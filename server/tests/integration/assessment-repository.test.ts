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
  NotFoundError,
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
      ).rejects.toThrow(/published' or 'retired'/)
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

      await expect(repo.publish(versionId, ACTOR)).rejects.toThrow(/no items/)
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
