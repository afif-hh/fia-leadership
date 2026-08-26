import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createAssessmentRepository,
  diffVersionAgainstSource,
  getVersionDetail,
  type AssessmentRepository,
} from '../../domain/assessment'
import { freshDb, type TestDb } from '../setup/db'

/**
 * The assessment domain at the size the PRD actually describes: 60 items across 20 dimensions.
 *
 * Every other test here uses one or two items, so the read and publish paths were only ever
 * exercised at a size where an N+1 is invisible. At this size the old `getVersionDetail` issued
 * 121 queries and the old `publish` around 250, each one a round trip — against a remote Turso
 * connection rather than the local file used here, which is why the count matters more than the
 * millisecond figure below.
 *
 * The timing assertion is deliberately loose. It is a regression guard against a reintroduced
 * per-item query, not a benchmark: a local SQLite file cannot predict production latency, and a
 * tight bound here would fail on a loaded CI box for reasons that have nothing to do with the code.
 * NFR-01's "P95 API read ≤ 800 ms" is the budget this protects.
 */

const ACTOR = 'tester'
const ITEM_COUNT = 60
const DIMENSION_COUNT = 20

/** Counts statements issued on the underlying libSQL client until `stop()`. */
function countQueries(t: TestDb) {
  const original = t.client.execute.bind(t.client)
  let count = 0
  t.client.execute = ((...args: Parameters<typeof original>) => {
    count++
    return original(...args)
  }) as typeof t.client.execute

  return {
    stop() {
      t.client.execute = original
      return count
    },
  }
}

async function seedAtScale(repo: AssessmentRepository) {
  const instrumentId = await repo.createInstrument({
    code: 'kdpgk_scale',
    name: 'KDPGK at scale',
    createdBy: ACTOR,
  })
  const scaleId = await repo.createScale({
    instrumentId,
    code: 'likert5',
    name: 'Likert 5',
    points: [
      { value: 1, label: 'Sangat tidak sesuai' },
      { value: 5, label: 'Sangat sesuai' },
    ],
  })

  const dimensionIds: string[] = []
  for (let d = 0; d < DIMENSION_COUNT; d++) {
    dimensionIds.push(
      await repo.createDimension({
        instrumentId,
        code: `dim_${String(d).padStart(2, '0')}`,
        name: `Dimension ${d}`,
        kind: 'style',
      })
    )
  }

  const itemIds: string[] = []
  for (let i = 0; i < ITEM_COUNT; i++) {
    const itemId = await repo.createItem({
      instrumentId,
      code: `kd${String(i).padStart(2, '0')}`,
      stem: `Item ${i} untuk pengujian skala.`,
      scaleId,
      createdBy: ACTOR,
    })
    // Three dimensions each, spread across the twenty, so no item is unmapped and the mapping
    // table holds 180 rows rather than 60.
    await repo.setItemDimensions(itemId, [
      dimensionIds[i % DIMENSION_COUNT]!,
      dimensionIds[(i + 7) % DIMENSION_COUNT]!,
      dimensionIds[(i + 13) % DIMENSION_COUNT]!,
    ])
    itemIds.push(itemId)
  }

  return { instrumentId, itemIds, dimensionIds }
}

describe(`the assessment domain at ${ITEM_COUNT} items x ${DIMENSION_COUNT} dimensions`, () => {
  let t: TestDb
  let repo: AssessmentRepository

  beforeEach(async () => {
    t = await freshDb()
    repo = createAssessmentRepository(t.db)
  })
  afterEach(async () => {
    await t.drop()
  })

  it('publishes, reads back and diffs a full-size instrument', async () => {
    const { instrumentId, itemIds } = await seedAtScale(repo)

    const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
    for (const [position, itemId] of itemIds.entries()) {
      await repo.addVersionItem({ versionId, itemId, position })
    }
    await repo.advanceToReview(versionId)

    const publishStarted = performance.now()
    await repo.publish(versionId, ACTOR)
    const publishMs = performance.now() - publishStarted

    const readStarted = performance.now()
    const detail = await getVersionDetail(t.db, versionId)
    const readMs = performance.now() - readStarted

    expect(detail.items).toHaveLength(ITEM_COUNT)
    expect(detail.frozen).toBe(true)
    // Every item carries its snapshot: the whole point of publishing at this size.
    for (const item of detail.items) {
      expect(item.dimensions).toHaveLength(3)
      expect(item.stem).not.toBe('')
      expect(item.scalePoints).not.toBeNull()
    }

    expect(readMs, `getVersionDetail took ${Math.round(readMs)}ms`).toBeLessThan(800)
    expect(publishMs, `publish took ${Math.round(publishMs)}ms`).toBeLessThan(3000)
  })

  /**
   * The real guard. Wall-clock on a local SQLite file barely moves when a per-item query comes
   * back — the round trip that hurts is a network one — so the query *count* is what has to hold.
   * `getVersionDetail` issued 122 queries here before it was rewritten; it now issues 3 whatever
   * the item count, and 3 is asserted rather than "few" so that reintroducing a loop fails loudly.
   */
  it('reads a full-size version in a constant number of queries', async () => {
    const { instrumentId, itemIds } = await seedAtScale(repo)
    const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
    for (const [position, itemId] of itemIds.entries()) {
      await repo.addVersionItem({ versionId, itemId, position })
    }

    const counted = countQueries(t)
    await getVersionDetail(t.db, versionId)
    const open = counted.stop()

    await repo.advanceToReview(versionId)
    await repo.publish(versionId, ACTOR)

    const countedFrozen = countQueries(t)
    await getVersionDetail(t.db, versionId)
    const frozen = countedFrozen.stop()

    // One for the version row, one for the selection, one for every item's dimensions.
    expect(open, `open version took ${open} queries`).toBe(3)
    expect(frozen, `frozen version took ${frozen} queries`).toBe(3)
  })

  it('diffs a full-size clone against its published source', async () => {
    const { instrumentId, itemIds } = await seedAtScale(repo)

    const { versionId: v1 } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
    for (const [position, itemId] of itemIds.entries()) {
      await repo.addVersionItem({ versionId: v1, itemId, position })
    }
    await repo.advanceToReview(v1)
    await repo.publish(v1, ACTOR)

    const { versionId: v2 } = await repo.createVersion({
      instrumentId,
      actorUserId: ACTOR,
      sourceVersionId: v1,
    })
    await repo.updateItem(itemIds[0]!, { stem: 'Reworded for v2.' })

    const started = performance.now()
    const diff = await diffVersionAgainstSource(t.db, v2)
    const diffMs = performance.now() - started

    expect(diff.stemChanged).toHaveLength(1)
    expect(diff.totalChanges).toBe(1)
    expect(diffMs, `diff took ${Math.round(diffMs)}ms`).toBeLessThan(800)
  })
})
