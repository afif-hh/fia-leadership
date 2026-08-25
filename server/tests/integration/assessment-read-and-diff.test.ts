import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  VersionFrozenError,
  createAssessmentRepository,
  diffVersionAgainstSource,
  getVersionDetail,
  listInstruments,
  listVersions,
  type AssessmentRepository,
} from '../../domain/assessment'
import { freshDb, type TestDb } from '../setup/db'

const ACTOR = 'tester'

/**
 * The read side and the diff (#53), plus the frozen-version guard the HTTP layer maps to a 409.
 *
 * These are the functions the routes call, so testing them here is testing the routes' substance;
 * the routes themselves are exercised over real HTTP in `server/tests/e2e/assessment-api.test.ts`.
 */
async function seed(repo: AssessmentRepository, code = 'kdpgk') {
  const instrumentId = await repo.createInstrument({ code, name: 'KDPGK', createdBy: ACTOR })
  const scaleId = await repo.createScale({
    instrumentId,
    code: 'likert5',
    name: 'Likert 5',
    points: [
      { value: 1, label: 'Sangat tidak sesuai' },
      { value: 5, label: 'Sangat sesuai' },
    ],
  })
  const dimensionId = await repo.createDimension({
    instrumentId,
    code: 'directive',
    name: 'Directive',
    kind: 'style',
  })

  const items: string[] = []
  for (const [index, stem] of ['first stem', 'second stem', 'third stem'].entries()) {
    const itemId = await repo.createItem({
      instrumentId,
      code: `kd0${index + 1}`,
      stem,
      scaleId,
      createdBy: ACTOR,
    })
    await repo.mapItemToDimension(itemId, dimensionId)
    items.push(itemId)
  }

  return { instrumentId, scaleId, dimensionId, items }
}

/** A published version selecting the given items in order. */
async function publishedVersion(
  repo: AssessmentRepository,
  instrumentId: string,
  itemIds: readonly string[]
) {
  const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
  for (const [position, itemId] of itemIds.entries()) {
    await repo.addVersionItem({ versionId, itemId, position })
  }
  await repo.advanceToReview(versionId)
  await repo.publish(versionId, ACTOR)
  return versionId
}

describe('assessment read side', () => {
  let t: TestDb
  let repo: AssessmentRepository

  beforeEach(async () => {
    t = await freshDb()
    repo = createAssessmentRepository(t.db)
  })
  afterEach(async () => {
    await t.drop()
  })

  it('lists instruments and versions in a stable order', async () => {
    const b = await seed(repo, 'bbb')
    await seed(repo, 'aaa')

    expect((await listInstruments(t.db)).map((i) => i.code)).toEqual(['aaa', 'bbb'])

    await publishedVersion(repo, b.instrumentId, [b.items[0]!])
    await repo.createVersion({ instrumentId: b.instrumentId, actorUserId: ACTOR })
    expect((await listVersions(t.db, b.instrumentId)).map((v) => v.versionNo)).toEqual([1, 2])
  })

  it('reads a draft through to live bank text, and reports it not frozen', async () => {
    const { instrumentId, items } = await seed(repo)
    const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
    await repo.addVersionItem({ versionId, itemId: items[0]!, position: 0 })

    await repo.updateItem(items[0]!, { stem: 'reworded while still a draft' })

    const detail = await getVersionDetail(t.db, versionId)
    expect(detail.frozen).toBe(false)
    expect(detail.items[0]?.stem).toBe('reworded while still a draft')
    expect(detail.items[0]?.dimensions.map((d) => d.code)).toEqual(['directive'])
    expect(detail.items[0]?.scalePoints).toEqual([
      { value: 1, label: 'Sangat tidak sesuai' },
      { value: 5, label: 'Sangat sesuai' },
    ])
  })

  /** The payoff of #47's snapshot-on-publish, asserted rather than assumed. */
  it('reads a published version from its snapshot, ignoring later bank edits', async () => {
    const { instrumentId, items } = await seed(repo)
    const versionId = await publishedVersion(repo, instrumentId, [items[0]!])

    await repo.updateItem(items[0]!, { stem: 'reworded after publish' })

    const detail = await getVersionDetail(t.db, versionId)
    expect(detail.frozen).toBe(true)
    expect(detail.items[0]?.stem).toBe('first stem')
    expect(detail.items[0]?.dimensions.map((d) => d.code)).toEqual(['directive'])
  })

  it('orders a version selection by position', async () => {
    const { instrumentId, items } = await seed(repo)
    const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
    await repo.addVersionItem({ versionId, itemId: items[2]!, position: 0 })
    await repo.addVersionItem({ versionId, itemId: items[0]!, position: 1 })

    const detail = await getVersionDetail(t.db, versionId)
    expect(detail.items.map((i) => i.code)).toEqual(['kd03', 'kd01'])
  })
})

describe('selection editing', () => {
  let t: TestDb
  let repo: AssessmentRepository

  beforeEach(async () => {
    t = await freshDb()
    repo = createAssessmentRepository(t.db)
  })
  afterEach(async () => {
    await t.drop()
  })

  it('removes an item from an open version', async () => {
    const { instrumentId, items } = await seed(repo)
    const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
    await repo.addVersionItem({ versionId, itemId: items[0]!, position: 0 })
    await repo.addVersionItem({ versionId, itemId: items[1]!, position: 1 })

    await repo.removeVersionItem(versionId, items[0]!)

    expect((await getVersionDetail(t.db, versionId)).items.map((i) => i.code)).toEqual(['kd02'])
  })

  /** A swap is the smallest reorder that trips `UNIQUE(version_id, position)`. */
  it('swaps two positions without tripping the unique index', async () => {
    const { instrumentId, items } = await seed(repo)
    const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
    await repo.addVersionItem({ versionId, itemId: items[0]!, position: 0 })
    await repo.addVersionItem({ versionId, itemId: items[1]!, position: 1 })

    await repo.reorderVersionItems(versionId, [items[1]!, items[0]!])

    const detail = await getVersionDetail(t.db, versionId)
    expect(detail.items.map((i) => i.code)).toEqual(['kd02', 'kd01'])
    expect(detail.items.map((i) => i.position)).toEqual([0, 1])
  })

  it('reverses a three-item ordering', async () => {
    const { instrumentId, items } = await seed(repo)
    const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
    for (const [position, itemId] of items.entries()) {
      await repo.addVersionItem({ versionId, itemId, position })
    }

    await repo.reorderVersionItems(versionId, [...items].reverse())

    expect((await getVersionDetail(t.db, versionId)).items.map((i) => i.code)).toEqual([
      'kd03',
      'kd02',
      'kd01',
    ])
  })

  it('refuses a partial reorder rather than silently dropping items', async () => {
    const { instrumentId, items } = await seed(repo)
    const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
    await repo.addVersionItem({ versionId, itemId: items[0]!, position: 0 })
    await repo.addVersionItem({ versionId, itemId: items[1]!, position: 1 })

    await expect(repo.reorderVersionItems(versionId, [items[0]!])).rejects.toThrow(/every item/)
  })

  it('toggles reverse coding', async () => {
    const { instrumentId, items } = await seed(repo)
    const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
    await repo.addVersionItem({ versionId, itemId: items[0]!, position: 0 })

    await repo.setReverseCoded(versionId, items[0]!, true)

    expect((await getVersionDetail(t.db, versionId)).items[0]?.reverseCoded).toBe(true)
  })

  /**
   * The guard whose whole purpose is the error message (#48, #53's definition of done): the
   * triggers would abort each of these writes anyway, with a raw `SQLITE_CONSTRAINT`.
   */
  describe('every selection edit on a frozen version raises VersionFrozenError', () => {
    it('for published and for retired alike', async () => {
      const { instrumentId, items } = await seed(repo)
      const versionId = await publishedVersion(repo, instrumentId, [items[0]!])

      for (const status of ['published', 'retired'] as const) {
        if (status === 'retired') await repo.retire(versionId, ACTOR)

        await expect(
          repo.addVersionItem({ versionId, itemId: items[1]!, position: 5 })
        ).rejects.toBeInstanceOf(VersionFrozenError)
        await expect(repo.removeVersionItem(versionId, items[0]!)).rejects.toBeInstanceOf(
          VersionFrozenError
        )
        await expect(repo.reorderVersionItems(versionId, [items[0]!])).rejects.toBeInstanceOf(
          VersionFrozenError
        )
        await expect(repo.setReverseCoded(versionId, items[0]!, true)).rejects.toBeInstanceOf(
          VersionFrozenError
        )
      }
    })

    it('names the status and points at making a new version', async () => {
      const { instrumentId, items } = await seed(repo)
      const versionId = await publishedVersion(repo, instrumentId, [items[0]!])

      await expect(repo.removeVersionItem(versionId, items[0]!)).rejects.toThrow(
        /is published and cannot be changed.*new version/s
      )
    })
  })
})

describe('the version diff', () => {
  let t: TestDb
  let repo: AssessmentRepository

  beforeEach(async () => {
    t = await freshDb()
    repo = createAssessmentRepository(t.db)
  })
  afterEach(async () => {
    await t.drop()
  })

  it('is blank for a version with no source', async () => {
    const { instrumentId } = await seed(repo)
    const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })

    const diff = await diffVersionAgainstSource(t.db, versionId)
    expect(diff.blank).toBe(true)
    expect(diff.totalChanges).toBe(0)
    expect(diff.sourceVersionId).toBeNull()
  })

  it('reports nothing changed for an untouched clone', async () => {
    const { instrumentId, items } = await seed(repo)
    const source = await publishedVersion(repo, instrumentId, [items[0]!, items[1]!])
    const { versionId } = await repo.createVersion({
      instrumentId,
      actorUserId: ACTOR,
      sourceVersionId: source,
    })

    const diff = await diffVersionAgainstSource(t.db, versionId)
    expect(diff.blank).toBe(false)
    expect(diff.totalChanges).toBe(0)
  })

  it('reports an added and a removed item', async () => {
    const { instrumentId, items } = await seed(repo)
    const source = await publishedVersion(repo, instrumentId, [items[0]!])
    const { versionId } = await repo.createVersion({
      instrumentId,
      actorUserId: ACTOR,
      sourceVersionId: source,
    })

    await repo.addVersionItem({ versionId, itemId: items[1]!, position: 1 })
    await repo.removeVersionItem(versionId, items[0]!)

    const diff = await diffVersionAgainstSource(t.db, versionId)
    expect(diff.added.map((a) => a.code)).toEqual(['kd02'])
    expect(diff.removed.map((r) => r.code)).toEqual(['kd01'])
    expect(diff.totalChanges).toBe(2)
  })

  it('reports a move and a reverse-coding change', async () => {
    const { instrumentId, items } = await seed(repo)
    const source = await publishedVersion(repo, instrumentId, [items[0]!, items[1]!])
    const { versionId } = await repo.createVersion({
      instrumentId,
      actorUserId: ACTOR,
      sourceVersionId: source,
    })

    await repo.reorderVersionItems(versionId, [items[1]!, items[0]!])
    await repo.setReverseCoded(versionId, items[0]!, true)

    const diff = await diffVersionAgainstSource(t.db, versionId)
    expect(diff.moved.map((m) => [m.code, m.from, m.to])).toEqual([
      ['kd01', 0, 1],
      ['kd02', 1, 0],
    ])
    expect(diff.reverseCodingChanged.map((r) => [r.code, r.from, r.to])).toEqual([
      ['kd01', false, true],
    ])
  })

  /**
   * The requirement #49 made non-optional: a bank item reworded in place must show up here, with
   * the source's frozen wording *and* the new wording, because a diff tag alone never shows what
   * the old text was (#50).
   */
  it('reports a stem changed since the source froze, carrying both wordings', async () => {
    const { instrumentId, items } = await seed(repo)
    const source = await publishedVersion(repo, instrumentId, [items[0]!])
    const { versionId } = await repo.createVersion({
      instrumentId,
      actorUserId: ACTOR,
      sourceVersionId: source,
    })

    await repo.updateItem(items[0]!, { stem: 'reworded after the source was published' })

    const diff = await diffVersionAgainstSource(t.db, versionId)
    expect(diff.stemChanged).toEqual([
      {
        itemId: items[0]!,
        code: 'kd01',
        before: 'first stem',
        after: 'reworded after the source was published',
      },
    ])
    expect(diff.totalChanges).toBe(1)
  })

  it('does not report a stem change when the bank has not moved', async () => {
    const { instrumentId, items } = await seed(repo)
    const source = await publishedVersion(repo, instrumentId, [items[0]!])
    const { versionId } = await repo.createVersion({
      instrumentId,
      actorUserId: ACTOR,
      sourceVersionId: source,
    })

    expect((await diffVersionAgainstSource(t.db, versionId)).stemChanged).toEqual([])
  })
})
