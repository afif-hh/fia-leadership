import { eq } from 'drizzle-orm'

import { assessmentItems, assessmentVersionItems } from '../../db/schema/assessment.ts'
import type { Db } from '../../db/client.ts'
import { getVersion } from './read.ts'

/**
 * The version diff, against `source_version_id`.
 *
 * Not optional and not cosmetic. #49 allowed bank items to be **reworded in place**, accepting
 * that item code `KD01` can mean different wording in two versions — explicitly on the condition
 * that the system makes that drift visible for the Academic Lead to judge. This function is that
 * condition being met, which is why #50 promoted the review screen from polish to load-bearing.
 *
 * The comparison is asymmetric by design, and the asymmetry is #47's snapshot model showing
 * through: the source is always `published` or `retired` (#49), so its `stem_snapshot` is the
 * wording it actually asked. The draft has NULL snapshots until publish, so its wording is
 * whatever the bank says right now. A `stemChanged` entry therefore means "the bank has moved
 * since the source froze", which is the drift being governed.
 */

export interface StemChange {
  itemId: string
  code: string
  /** What the source version froze. */
  before: string
  /** What the bank says now, and therefore what this version would freeze if published. */
  after: string
}

export interface VersionDiff {
  versionId: string
  sourceVersionId: string | null
  /** True when there is no source — every v1. Nothing to compare, so every list is empty. */
  blank: boolean
  added: { itemId: string; code: string; position: number }[]
  removed: { itemId: string; code: string; position: number }[]
  moved: { itemId: string; code: string; from: number; to: number }[]
  reverseCodingChanged: { itemId: string; code: string; from: boolean; to: boolean }[]
  stemChanged: StemChange[]
  /** What the review screen names before publish arms (#50). */
  totalChanges: number
}

interface SelectionRow {
  itemId: string
  code: string
  position: number
  reverseCoded: boolean
  stemSnapshot: string | null
  liveStem: string
}

async function selectionOf(db: Db, versionId: string): Promise<SelectionRow[]> {
  return db
    .select({
      itemId: assessmentVersionItems.itemId,
      code: assessmentItems.code,
      position: assessmentVersionItems.position,
      reverseCoded: assessmentVersionItems.reverseCoded,
      stemSnapshot: assessmentVersionItems.stemSnapshot,
      liveStem: assessmentItems.stem,
    })
    .from(assessmentVersionItems)
    .innerJoin(assessmentItems, eq(assessmentItems.id, assessmentVersionItems.itemId))
    .where(eq(assessmentVersionItems.versionId, versionId))
}

export async function diffVersionAgainstSource(db: Db, versionId: string): Promise<VersionDiff> {
  const version = await getVersion(db, versionId)

  if (!version.sourceVersionId) {
    return {
      versionId,
      sourceVersionId: null,
      blank: true,
      added: [],
      removed: [],
      moved: [],
      reverseCodingChanged: [],
      stemChanged: [],
      totalChanges: 0,
    }
  }

  const [current, source] = await Promise.all([
    selectionOf(db, versionId),
    selectionOf(db, version.sourceVersionId),
  ])

  const sourceByItem = new Map(source.map((row) => [row.itemId, row]))
  const currentByItem = new Map(current.map((row) => [row.itemId, row]))

  const diff: VersionDiff = {
    versionId,
    sourceVersionId: version.sourceVersionId,
    blank: false,
    added: [],
    removed: [],
    moved: [],
    reverseCodingChanged: [],
    stemChanged: [],
    totalChanges: 0,
  }

  for (const row of current) {
    const before = sourceByItem.get(row.itemId)

    if (!before) {
      diff.added.push({ itemId: row.itemId, code: row.code, position: row.position })
      continue
    }

    if (before.position !== row.position) {
      diff.moved.push({
        itemId: row.itemId,
        code: row.code,
        from: before.position,
        to: row.position,
      })
    }

    if (before.reverseCoded !== row.reverseCoded) {
      diff.reverseCodingChanged.push({
        itemId: row.itemId,
        code: row.code,
        from: before.reverseCoded,
        to: row.reverseCoded,
      })
    }

    // `stemSnapshot` on the source is the wording it froze; `liveStem` is today's bank text. A
    // NULL snapshot would mean the source was never published, which #49 makes unreachable — but
    // it is guarded rather than asserted, because a read path should not throw on it.
    if (before.stemSnapshot !== null && before.stemSnapshot !== row.liveStem) {
      diff.stemChanged.push({
        itemId: row.itemId,
        code: row.code,
        before: before.stemSnapshot,
        after: row.liveStem,
      })
    }
  }

  for (const row of source) {
    if (!currentByItem.has(row.itemId)) {
      diff.removed.push({ itemId: row.itemId, code: row.code, position: row.position })
    }
  }

  const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code)
  diff.added.sort(byCode)
  diff.removed.sort(byCode)
  diff.moved.sort(byCode)
  diff.reverseCodingChanged.sort(byCode)
  diff.stemChanged.sort(byCode)

  diff.totalChanges =
    diff.added.length +
    diff.removed.length +
    diff.moved.length +
    diff.reverseCodingChanged.length +
    diff.stemChanged.length

  return diff
}
