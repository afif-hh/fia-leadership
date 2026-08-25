import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import {
  assessmentVersionItemDimensions,
  assessmentVersionItems,
  assessmentVersions,
} from '../../db/schema/assessment'
import { auditLogs } from '../../db/schema/platform'
import {
  CrossInstrumentError,
  IllegalTransitionError,
  InvalidSourceVersionError,
  NotFoundError,
  OpenVersionExistsError,
  VersionNotPublishableError,
  createAssessmentRepository,
  type AssessmentRepository,
} from '../../domain/assessment'
import { freshDb, type TestDb } from '../setup/db'

const ACTOR = 'tester'

/** One instrument with one scale, one dimension and one item, built through the repository
 * itself rather than raw inserts — this is what exercises createItem/mapItemToDimension.
 * `code` must be unique per call within a test, since `assessment_instruments.code` is globally
 * unique. */
async function seedBank(repo: AssessmentRepository, code = 'kdpgk') {
  const instrumentId = await repo.createInstrument({
    code,
    name: 'KDPGK',
    createdBy: ACTOR,
  })
  const scaleId = await repo.createScale({
    instrumentId,
    code: 'likert5',
    name: 'Likert 5',
    points: [{ value: 1, label: 'Sangat tidak sesuai' }],
  })
  const dimensionId = await repo.createDimension({
    instrumentId,
    code: 'directive',
    name: 'Directive',
    kind: 'style',
  })
  const itemId = await repo.createItem({
    instrumentId,
    code: 'kd01',
    stem: 'Saya membuat keputusan tanpa berkonsultasi.',
    scaleId,
    createdBy: ACTOR,
  })
  await repo.mapItemToDimension(itemId, dimensionId)

  return { instrumentId, scaleId, dimensionId, itemId }
}

describe('assessment repository', () => {
  let t: TestDb
  let repo: AssessmentRepository

  beforeEach(async () => {
    t = await freshDb()
    repo = createAssessmentRepository(t.db)
  })
  afterEach(async () => {
    await t.drop()
  })

  describe('the cross-instrument guard', () => {
    it('rejects an item whose scale belongs to a different instrument', async () => {
      const { scaleId } = await seedBank(repo)
      const otherInstrumentId = await repo.createInstrument({
        code: 'other',
        name: 'Other',
        createdBy: ACTOR,
      })

      await expect(
        repo.createItem({
          instrumentId: otherInstrumentId,
          code: 'x01',
          stem: 'x',
          scaleId,
          createdBy: ACTOR,
        })
      ).rejects.toBeInstanceOf(CrossInstrumentError)
    })

    it('rejects mapping an item to a dimension from a different instrument', async () => {
      const { itemId } = await seedBank(repo)
      const otherInstrumentId = await repo.createInstrument({
        code: 'other',
        name: 'Other',
        createdBy: ACTOR,
      })
      const otherDimensionId = await repo.createDimension({
        instrumentId: otherInstrumentId,
        code: 'other_dim',
        name: 'Other',
        kind: 'style',
      })

      await expect(repo.mapItemToDimension(itemId, otherDimensionId)).rejects.toBeInstanceOf(
        CrossInstrumentError
      )
    })

    it('rejects adding an item from a different instrument to a version selection', async () => {
      const { instrumentId } = await seedBank(repo, 'kdpgk_a')
      const { itemId: otherItemId } = await seedBank(repo, 'kdpgk_b')
      const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })

      await expect(
        repo.addVersionItem({ versionId, itemId: otherItemId, position: 0 })
      ).rejects.toBeInstanceOf(CrossInstrumentError)
    })

    it('rejects cloning from a version belonging to a different instrument', async () => {
      const { instrumentId: instrumentA } = await seedBank(repo, 'kdpgk_a')
      const { instrumentId: instrumentB } = await seedBank(repo, 'kdpgk_b')
      const { versionId: versionA } = await repo.createVersion({
        instrumentId: instrumentA,
        actorUserId: ACTOR,
      })

      await expect(
        repo.createVersion({
          instrumentId: instrumentB,
          actorUserId: ACTOR,
          sourceVersionId: versionA,
        })
      ).rejects.toBeInstanceOf(CrossInstrumentError)
    })
  })

  describe('createVersion', () => {
    it('starts blank with version_no 1 and an audit row carrying no items', async () => {
      const { instrumentId } = await seedBank(repo)

      const result = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
      expect(result.versionNo).toBe(1)
      expect(result.clonedItemCount).toBe(0)

      const rows = await t.db.select().from(auditLogs)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.eventType).toBe('assessment.version_created')
      const detail = JSON.parse(rows[0]?.detail ?? 'null')
      expect(detail).toEqual({
        event_type: 'assessment.version_created',
        version_id: result.versionId,
        version_no: 1,
        source_version_id: null,
        cloned_item_count: 0,
      })
    })

    it('refuses to clone from a version that is not published or retired', async () => {
      const { instrumentId } = await seedBank(repo)
      const { versionId: draftVersionId } = await repo.createVersion({
        instrumentId,
        actorUserId: ACTOR,
      })

      await expect(
        repo.createVersion({
          instrumentId,
          actorUserId: ACTOR,
          sourceVersionId: draftVersionId,
        })
      ).rejects.toThrow(InvalidSourceVersionError)
    })

    // This request breaks two rules at once — the source is a draft, and that draft is still open.
    // The source check has to win: it says the request is malformed, where the open-version check
    // says only "not yet". Pinned because the precedence is what decides whether the caller sees
    // 422 or 409.
    it('reports the invalid source, not the open version, when a request breaks both', async () => {
      const { instrumentId } = await seedBank(repo)
      const { versionId: draftVersionId } = await repo.createVersion({
        instrumentId,
        actorUserId: ACTOR,
      })

      await expect(
        repo.createVersion({ instrumentId, actorUserId: ACTOR, sourceVersionId: draftVersionId })
      ).rejects.not.toBeInstanceOf(OpenVersionExistsError)
    })

    it('refuses a second open version, naming the one already open', async () => {
      const { instrumentId } = await seedBank(repo)
      await repo.createVersion({ instrumentId, actorUserId: ACTOR })

      // The partial unique index would abort this anyway; the point of the guard is that the caller
      // gets a 409 it can act on rather than a raw SQLITE_CONSTRAINT surfacing as a 500.
      await expect(repo.createVersion({ instrumentId, actorUserId: ACTOR })).rejects.toThrow(
        OpenVersionExistsError
      )
      await expect(repo.createVersion({ instrumentId, actorUserId: ACTOR })).rejects.toThrow(/v1/)
    })

    it('allows a new version once the open one is published', async () => {
      const { instrumentId, itemId } = await seedBank(repo)
      const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
      await repo.addVersionItem({ versionId, itemId, position: 0 })
      await repo.advanceToReview(versionId)
      await repo.publish(versionId, ACTOR)

      const second = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
      expect(second.versionNo).toBe(2)
    })

    it('clones the source selection with snapshots left NULL, and bumps version_no', async () => {
      const { instrumentId, itemId } = await seedBank(repo)
      const { versionId: v1 } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
      await repo.addVersionItem({ versionId: v1, itemId, position: 0, reverseCoded: true })
      await repo.advanceToReview(v1)
      await repo.publish(v1, ACTOR)

      const {
        versionId: v2,
        versionNo,
        clonedItemCount,
      } = await repo.createVersion({
        instrumentId,
        actorUserId: ACTOR,
        sourceVersionId: v1,
      })

      expect(versionNo).toBe(2)
      expect(clonedItemCount).toBe(1)

      const items = await t.db
        .select()
        .from(assessmentVersionItems)
        .where(eq(assessmentVersionItems.versionId, v2))
      expect(items).toHaveLength(1)
      expect(items[0]?.itemId).toBe(itemId)
      expect(items[0]?.position).toBe(0)
      expect(items[0]?.reverseCoded).toBe(true)
      expect(items[0]?.stemSnapshot).toBeNull()
      expect(items[0]?.scalePointsSnapshot).toBeNull()
    })
  })

  describe('publish', () => {
    it('refuses to publish a version with no items', async () => {
      const { instrumentId } = await seedBank(repo)
      const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
      await repo.advanceToReview(versionId)

      await expect(repo.publish(versionId, ACTOR)).rejects.toBeInstanceOf(
        VersionNotPublishableError
      )
    })

    /**
     * The review screen blocks this, but the UI is not a boundary (CLAUDE.md §6) and an API client
     * bypasses it. An item measuring no dimension contributes to no score, so publishing one
     * freezes a version that can never produce a result — and FR-005 means it can never be fixed
     * in place, only superseded.
     */
    it('refuses to publish when an item measures no dimension, naming the item', async () => {
      const { instrumentId, scaleId } = await seedBank(repo)
      const orphanId = await repo.createItem({
        instrumentId,
        code: 'kd99',
        stem: 'Item yang belum dipetakan ke dimensi apa pun.',
        scaleId,
        createdBy: ACTOR,
      })
      const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
      await repo.addVersionItem({ versionId, itemId: orphanId, position: 0 })
      await repo.advanceToReview(versionId)

      await expect(repo.publish(versionId, ACTOR)).rejects.toBeInstanceOf(
        VersionNotPublishableError
      )
      // The code identifies which item to go and fix. The stem must not appear — it is authored
      // content and this message travels into an HTTP body.
      await expect(repo.publish(versionId, ACTOR)).rejects.toThrow(/kd99/)
      await expect(repo.publish(versionId, ACTOR)).rejects.not.toThrow(/belum dipetakan/)

      const [version] = await t.db
        .select()
        .from(assessmentVersions)
        .where(eq(assessmentVersions.id, versionId))
      expect(version?.status).toBe('review')
    })

    it('publishes when every item measures at least one dimension', async () => {
      const { instrumentId, scaleId, dimensionId } = await seedBank(repo)
      const secondId = await repo.createItem({
        instrumentId,
        code: 'kd02',
        stem: 'Item kedua.',
        scaleId,
        createdBy: ACTOR,
      })
      await repo.mapItemToDimension(secondId, dimensionId)
      const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
      await repo.addVersionItem({ versionId, itemId: secondId, position: 0 })
      await repo.advanceToReview(versionId)

      await expect(repo.publish(versionId, ACTOR)).resolves.toBeUndefined()
    })

    it('refuses to publish a draft directly, skipping review', async () => {
      const { instrumentId, itemId } = await seedBank(repo)
      const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
      await repo.addVersionItem({ versionId, itemId, position: 0 })

      await expect(repo.publish(versionId, ACTOR)).rejects.toBeInstanceOf(IllegalTransitionError)
    })

    it('fills the snapshot from current bank state and flips status, audited with no stem', async () => {
      const { instrumentId, itemId, dimensionId } = await seedBank(repo)
      const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
      await repo.addVersionItem({ versionId, itemId, position: 0 })
      await repo.advanceToReview(versionId)

      await repo.publish(versionId, ACTOR)

      const [version] = await t.db
        .select()
        .from(assessmentVersions)
        .where(eq(assessmentVersions.id, versionId))
      expect(version?.status).toBe('published')
      expect(version?.publishedAt).toBeInstanceOf(Date)

      const [versionItem] = await t.db
        .select()
        .from(assessmentVersionItems)
        .where(eq(assessmentVersionItems.versionId, versionId))
      expect(versionItem?.stemSnapshot).toBe('Saya membuat keputusan tanpa berkonsultasi.')
      expect(JSON.parse(versionItem?.scalePointsSnapshot ?? 'null')).toEqual([
        { value: 1, label: 'Sangat tidak sesuai' },
      ])

      const dimensionSnapshots = await t.db
        .select()
        .from(assessmentVersionItemDimensions)
        .where(eq(assessmentVersionItemDimensions.versionItemId, versionItem!.id))
      expect(dimensionSnapshots).toHaveLength(1)
      expect(dimensionSnapshots[0]?.dimensionId).toBe(dimensionId)
      expect(dimensionSnapshots[0]?.dimensionCodeSnapshot).toBe('directive')

      const [auditRow] = await t.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.eventType, 'assessment.version_published'))
      const detail = JSON.parse(auditRow?.detail ?? 'null')
      expect(detail).toEqual({
        event_type: 'assessment.version_published',
        version_id: versionId,
        version_no: 1,
      })
      expect(JSON.stringify(detail)).not.toMatch(/berkonsultasi/)
    })
  })

  describe('retire', () => {
    it('moves a published version to retired and audits it with no stem', async () => {
      const { instrumentId, itemId } = await seedBank(repo)
      const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
      await repo.addVersionItem({ versionId, itemId, position: 0 })
      await repo.advanceToReview(versionId)
      await repo.publish(versionId, ACTOR)

      await repo.retire(versionId, ACTOR)

      const [version] = await t.db
        .select()
        .from(assessmentVersions)
        .where(eq(assessmentVersions.id, versionId))
      expect(version?.status).toBe('retired')
      expect(version?.retiredAt).toBeInstanceOf(Date)

      const [auditRow] = await t.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.eventType, 'assessment.version_retired'))
      expect(JSON.parse(auditRow?.detail ?? 'null')).toEqual({
        event_type: 'assessment.version_retired',
        version_id: versionId,
        version_no: 1,
      })
    })

    it('refuses to retire a draft', async () => {
      const { instrumentId } = await seedBank(repo)
      const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })

      await expect(repo.retire(versionId, ACTOR)).rejects.toBeInstanceOf(IllegalTransitionError)
    })

    it('rejects operating on a version that does not exist', async () => {
      await expect(repo.retire(crypto.randomUUID(), ACTOR)).rejects.toBeInstanceOf(NotFoundError)
    })
  })
})
