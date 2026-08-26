import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'

import {
  assessmentDimensions,
  assessmentInstruments,
  assessmentItems,
  assessmentScales,
  assessmentVersionItemDimensions,
  assessmentVersionItems,
  assessmentVersions,
} from '../../db/schema/assessment'
import { freshDb, type TestDb } from '../setup/db'

/** A minimal instrument with one scale, one item and one dimension, so a version has something
 * to select. Returns the ids tests build a version's selection from. */
async function seedInstrument(t: TestDb) {
  const instrumentId = crypto.randomUUID()
  const scaleId = crypto.randomUUID()
  const itemId = crypto.randomUUID()
  const dimensionId = crypto.randomUUID()
  const now = new Date()

  await t.db.insert(assessmentInstruments).values({
    id: instrumentId,
    code: 'kdpgk',
    name: 'KDPGK',
    createdAt: now,
    createdBy: 'tester',
  })
  await t.db.insert(assessmentScales).values({
    id: scaleId,
    instrumentId,
    code: 'likert5',
    name: 'Likert 5',
    points: JSON.stringify([{ value: 1, label: 'Sangat tidak sesuai' }]),
  })
  await t.db.insert(assessmentItems).values({
    id: itemId,
    instrumentId,
    code: 'kd01',
    stem: 'Saya membuat keputusan tanpa berkonsultasi.',
    scaleId,
    createdAt: now,
    createdBy: 'tester',
  })
  await t.db.insert(assessmentDimensions).values({
    id: dimensionId,
    instrumentId,
    code: 'directive',
    name: 'Directive',
    kind: 'style',
  })

  return { instrumentId, scaleId, itemId, dimensionId }
}

async function seedVersion(t: TestDb, instrumentId: string, versionNo = 1) {
  const versionId = crypto.randomUUID()
  await t.db.insert(assessmentVersions).values({
    id: versionId,
    instrumentId,
    versionNo,
    status: 'draft',
    createdAt: new Date(),
    createdBy: 'tester',
  })
  return versionId
}

/** A version whose single item carries a complete snapshot and dimension mapping, ready to
 * publish — the shape #52's publish transaction would leave it in just before flipping status. */
async function seedPublishableVersion(t: TestDb) {
  const { instrumentId, scaleId, itemId, dimensionId } = await seedInstrument(t)
  const versionId = await seedVersion(t, instrumentId)
  const versionItemId = crypto.randomUUID()

  await t.db.insert(assessmentVersionItems).values({
    id: versionItemId,
    versionId,
    itemId,
    position: 0,
    stemSnapshot: 'Saya membuat keputusan tanpa berkonsultasi.',
    scalePointsSnapshot: JSON.stringify([{ value: 1, label: 'Sangat tidak sesuai' }]),
  })
  await t.db.insert(assessmentVersionItemDimensions).values({
    versionItemId,
    dimensionId,
    dimensionCodeSnapshot: 'directive',
  })

  return { instrumentId, scaleId, itemId, dimensionId, versionId, versionItemId }
}

async function publish(t: TestDb, versionId: string) {
  await t.db
    .update(assessmentVersions)
    .set({ status: 'published', publishedAt: new Date() })
    .where(eq(assessmentVersions.id, versionId))
}

/** Same UPDATE as {@link publish}, issued through the raw client so a trigger abort surfaces
 * as a `LibsqlError` with `.code` set, rather than wrapped in Drizzle's `DrizzleQueryError`. */
async function publishRaw(t: TestDb, versionId: string) {
  await t.client.execute({
    sql: 'UPDATE assessment_versions SET status = ?, published_at = ? WHERE id = ?',
    args: ['published', Date.now(), versionId],
  })
}

describe('assessment_versions immutability', () => {
  let t: TestDb
  beforeEach(async () => {
    t = await freshDb()
  })
  afterEach(async () => {
    await t.drop()
  })

  it('has its nine triggers present after every migration has run', async () => {
    const rows = await t.db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`
    )
    const names = rows.map((r) => r.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'assessment_versions_no_update_frozen',
        'assessment_versions_no_delete_frozen',
        'assessment_versions_publish_requires_snapshot',
        'assessment_version_items_no_insert_frozen',
        'assessment_version_items_no_update_frozen',
        'assessment_version_items_no_delete_frozen',
        'assessment_version_item_dimensions_no_insert_frozen',
        'assessment_version_item_dimensions_no_update_frozen',
        'assessment_version_item_dimensions_no_delete_frozen',
        'assessment_versions_published_at_insert_consistent',
        'assessment_versions_published_at_update_consistent',
      ])
    )
  })

  /**
   * `published_at` present exactly when the version has been published (0005).
   *
   * 0003's CHECK holds only one direction — a published row must carry a timestamp — so a draft
   * could carry one and a retired row could carry none. Both make `published_at` unusable as the
   * answer to "when did this version freeze". Enforced by trigger rather than a corrected CHECK
   * because SQLite cannot alter a CHECK, and rebuilding this table would put the nine immutability
   * triggers, the self-FK and the one-open-version index at risk to fix a defence-in-depth rule.
   */
  describe('published_at is set exactly when the version has been published', () => {
    it('rejects a draft inserted with a published_at', async () => {
      const { instrumentId } = await seedInstrument(t)
      await expect(
        t.client.execute({
          sql: 'INSERT INTO assessment_versions (id, instrument_id, version_no, status, published_at, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
          args: [crypto.randomUUID(), instrumentId, 1, 'draft', Date.now(), Date.now(), 'tester'],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('rejects a retired row inserted with no published_at', async () => {
      const { instrumentId } = await seedInstrument(t)
      await expect(
        t.client.execute({
          sql: 'INSERT INTO assessment_versions (id, instrument_id, version_no, status, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
          args: [crypto.randomUUID(), instrumentId, 1, 'retired', Date.now(), 'tester'],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('rejects stamping a published_at onto a version that stays a draft', async () => {
      const { instrumentId } = await seedInstrument(t)
      const versionId = await seedVersion(t, instrumentId)

      // 0004's frozen-row trigger does not cover this: the row is open, and its status never
      // changes, so nothing else in the schema was watching this write.
      await expect(
        t.client.execute({
          sql: 'UPDATE assessment_versions SET published_at = ? WHERE id = ?',
          args: [Date.now(), versionId],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('still allows the real publish and retire transitions', async () => {
      const { versionId } = await seedPublishableVersion(t)
      await publishRaw(t, versionId)

      const [published] = await t.db
        .select({ publishedAt: assessmentVersions.publishedAt })
        .from(assessmentVersions)
        .where(eq(assessmentVersions.id, versionId))
      expect(published?.publishedAt).toBeInstanceOf(Date)

      // Retiring keeps published_at, which is exactly why the rule is "published or retired"
      // rather than "published".
      await t.client.execute({
        sql: 'UPDATE assessment_versions SET status = ?, retired_at = ? WHERE id = ?',
        args: ['retired', Date.now(), versionId],
      })
      const [retired] = await t.db
        .select({ status: assessmentVersions.status, publishedAt: assessmentVersions.publishedAt })
        .from(assessmentVersions)
        .where(eq(assessmentVersions.id, versionId))
      expect(retired?.status).toBe('retired')
      expect(retired?.publishedAt).toBeInstanceOf(Date)
    })
  })

  describe('publish gate', () => {
    it('rejects publishing a version with no items', async () => {
      const { instrumentId } = await seedInstrument(t)
      const versionId = await seedVersion(t, instrumentId)

      await expect(publishRaw(t, versionId)).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
      await expect(publishRaw(t, versionId)).rejects.toThrow(/complete snapshot/)
    })

    it('rejects publishing a version whose item has no snapshot yet', async () => {
      const { instrumentId, itemId } = await seedInstrument(t)
      const versionId = await seedVersion(t, instrumentId)
      await t.db.insert(assessmentVersionItems).values({
        id: crypto.randomUUID(),
        versionId,
        itemId,
        position: 0,
        // stemSnapshot / scalePointsSnapshot left NULL, as they are during draft authoring.
      })

      await expect(publishRaw(t, versionId)).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('accepts publishing once every item has a complete snapshot', async () => {
      const { versionId } = await seedPublishableVersion(t)

      await publish(t, versionId)

      const [row] = await t.db
        .select()
        .from(assessmentVersions)
        .where(eq(assessmentVersions.id, versionId))
      expect(row?.status).toBe('published')
    })
  })

  describe('the frozen assessment_versions row', () => {
    it('permits published -> retired together with a retired_at write', async () => {
      const { versionId } = await seedPublishableVersion(t)
      await publish(t, versionId)

      await t.db
        .update(assessmentVersions)
        .set({ status: 'retired', retiredAt: new Date() })
        .where(eq(assessmentVersions.id, versionId))

      const [row] = await t.db
        .select()
        .from(assessmentVersions)
        .where(eq(assessmentVersions.id, versionId))
      expect(row?.status).toBe('retired')
    })

    it('rejects published -> draft', async () => {
      const { versionId } = await seedPublishableVersion(t)
      await publish(t, versionId)

      await expect(
        t.client.execute({
          sql: "UPDATE assessment_versions SET status = 'draft' WHERE id = ?",
          args: [versionId],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('rejects a retirement that also changes an unrelated column', async () => {
      const { versionId } = await seedPublishableVersion(t)
      await publish(t, versionId)

      await expect(
        t.client.execute({
          sql: "UPDATE assessment_versions SET status = 'retired', version_no = 99 WHERE id = ?",
          args: [versionId],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('rejects deleting a published version', async () => {
      const { versionId } = await seedPublishableVersion(t)
      await publish(t, versionId)

      await expect(
        t.client.execute({
          sql: 'DELETE FROM assessment_versions WHERE id = ?',
          args: [versionId],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('rejects deleting a retired version', async () => {
      const { versionId } = await seedPublishableVersion(t)
      await publish(t, versionId)
      await t.db
        .update(assessmentVersions)
        .set({ status: 'retired', retiredAt: new Date() })
        .where(eq(assessmentVersions.id, versionId))

      await expect(
        t.client.execute({
          sql: 'DELETE FROM assessment_versions WHERE id = ?',
          args: [versionId],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })
  })

  describe('the frozen assessment_version_items children', () => {
    it('rejects inserting a new selection row once the version is published', async () => {
      const { instrumentId, scaleId, versionId } = await seedPublishableVersion(t)
      await publish(t, versionId)

      // A second item on the same instrument, so the insert fails on the trigger, not a unique
      // constraint on (version_id, item_id) or (version_id, position).
      const secondItemId = crypto.randomUUID()
      await t.db.insert(assessmentItems).values({
        id: secondItemId,
        instrumentId,
        code: 'kd02',
        stem: 'Saya berkonsultasi sebelum memutuskan.',
        scaleId,
        createdAt: new Date(),
        createdBy: 'tester',
      })

      await expect(
        t.client.execute({
          sql: 'INSERT INTO assessment_version_items (id, version_id, item_id, position, reverse_coded) VALUES (?, ?, ?, ?, 0)',
          args: [crypto.randomUUID(), versionId, secondItemId, 1],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('rejects updating a selection row once the version is published', async () => {
      const { versionId, versionItemId } = await seedPublishableVersion(t)
      await publish(t, versionId)

      await expect(
        t.client.execute({
          sql: 'UPDATE assessment_version_items SET position = 5 WHERE id = ?',
          args: [versionItemId],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('rejects deleting a selection row once the version is published', async () => {
      const { versionId, versionItemId } = await seedPublishableVersion(t)
      await publish(t, versionId)

      await expect(
        t.client.execute({
          sql: 'DELETE FROM assessment_version_items WHERE id = ?',
          args: [versionItemId],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('allows editing the selection freely while the version is still a draft', async () => {
      const { versionItemId } = await seedPublishableVersion(t)

      await t.db
        .update(assessmentVersionItems)
        .set({ position: 3 })
        .where(eq(assessmentVersionItems.id, versionItemId))

      const [row] = await t.db
        .select()
        .from(assessmentVersionItems)
        .where(eq(assessmentVersionItems.id, versionItemId))
      expect(row?.position).toBe(3)
    })
  })

  describe('the frozen assessment_version_item_dimensions children', () => {
    it('rejects inserting a dimension-snapshot row once the version is published', async () => {
      const { instrumentId, versionId, versionItemId } = await seedPublishableVersion(t)
      await publish(t, versionId)

      const secondDimensionId = crypto.randomUUID()
      await t.db.insert(assessmentDimensions).values({
        id: secondDimensionId,
        instrumentId,
        code: 'participative',
        name: 'Participative',
        kind: 'style',
      })

      await expect(
        t.client.execute({
          sql: 'INSERT INTO assessment_version_item_dimensions (version_item_id, dimension_id, dimension_code_snapshot) VALUES (?, ?, ?)',
          args: [versionItemId, secondDimensionId, 'participative'],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('rejects updating a dimension-snapshot row once the version is published', async () => {
      const { versionId, versionItemId, dimensionId } = await seedPublishableVersion(t)
      await publish(t, versionId)

      await expect(
        t.client.execute({
          sql: "UPDATE assessment_version_item_dimensions SET dimension_code_snapshot = 'changed' WHERE version_item_id = ? AND dimension_id = ?",
          args: [versionItemId, dimensionId],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('rejects deleting a dimension-snapshot row once the version is published', async () => {
      const { versionId, versionItemId, dimensionId } = await seedPublishableVersion(t)
      await publish(t, versionId)

      await expect(
        t.client.execute({
          sql: 'DELETE FROM assessment_version_item_dimensions WHERE version_item_id = ? AND dimension_id = ?',
          args: [versionItemId, dimensionId],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })
  })

  describe('the bank tables stay editable forever', () => {
    it('allows rewording a published item, per #49', async () => {
      const { instrumentId, itemId } = await seedInstrument(t)
      const versionId = await seedVersion(t, instrumentId)
      await t.db.insert(assessmentVersionItems).values({
        id: crypto.randomUUID(),
        versionId,
        itemId,
        position: 0,
        stemSnapshot: 'original wording',
        scalePointsSnapshot: JSON.stringify([{ value: 1, label: 'x' }]),
      })
      await publish(t, versionId)

      await t.db
        .update(assessmentItems)
        .set({ stem: 'reworded wording' })
        .where(eq(assessmentItems.id, itemId))

      const [item] = await t.db.select().from(assessmentItems).where(eq(assessmentItems.id, itemId))
      expect(item?.stem).toBe('reworded wording')
    })
  })
})
