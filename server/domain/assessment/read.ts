import { asc, eq } from 'drizzle-orm'

import {
  assessmentDimensions,
  assessmentInstruments,
  assessmentItemDimensions,
  assessmentItems,
  assessmentScales,
  assessmentVersionItemDimensions,
  assessmentVersionItems,
  assessmentVersions,
} from '../../db/schema/assessment.ts'
import type { DimensionKind, VersionStatus } from '../../db/schema/assessment.ts'
import type { Db } from '../../db/client.ts'
import { NotFoundError } from './repository.ts'

/**
 * The read side of the `assessment` domain.
 *
 * Separate from `repository.ts`, which is the only *writer*. These functions are what the HTTP
 * layer maps to a response, and they live here rather than in a route handler so the route stays
 * a thin binding and the query is callable — and therefore testable — under plain Node.
 *
 * A **published or retired** version reads from its snapshot columns; a **draft or review**
 * version reads through to the live bank. That distinction is the whole point of #47's
 * snapshot-on-publish: a published version must render what it asked at publish time, not what
 * the bank says today.
 */

export interface InstrumentSummary {
  id: string
  code: string
  name: string
  description: string | null
  createdAt: Date
}

export interface VersionSummary {
  id: string
  versionNo: number
  status: VersionStatus
  publishedAt: Date | null
  retiredAt: Date | null
  sourceVersionId: string | null
  createdAt: Date
}

export interface VersionItemDetail {
  versionItemId: string
  itemId: string
  code: string
  position: number
  reverseCoded: boolean
  /** Snapshot text once frozen, live bank text while still a draft. */
  stem: string
  /** Snapshot points once frozen, live scale points while still a draft. */
  scalePoints: unknown
  scaleCode: string | null
  dimensions: { id: string; code: string; kind: DimensionKind | null }[]
}

export interface VersionDetail extends VersionSummary {
  instrumentId: string
  /** True once `published` or `retired` — the client renders a frozen version read-only. */
  frozen: boolean
  items: VersionItemDetail[]
}

export async function listInstruments(db: Db): Promise<InstrumentSummary[]> {
  return db
    .select({
      id: assessmentInstruments.id,
      code: assessmentInstruments.code,
      name: assessmentInstruments.name,
      description: assessmentInstruments.description,
      createdAt: assessmentInstruments.createdAt,
    })
    .from(assessmentInstruments)
    .orderBy(asc(assessmentInstruments.code))
}

export async function getInstrument(db: Db, instrumentId: string): Promise<InstrumentSummary> {
  const [row] = await db
    .select({
      id: assessmentInstruments.id,
      code: assessmentInstruments.code,
      name: assessmentInstruments.name,
      description: assessmentInstruments.description,
      createdAt: assessmentInstruments.createdAt,
    })
    .from(assessmentInstruments)
    .where(eq(assessmentInstruments.id, instrumentId))
  if (!row) throw new NotFoundError('instrument', instrumentId)
  return row
}

export async function listVersions(db: Db, instrumentId: string): Promise<VersionSummary[]> {
  return db
    .select({
      id: assessmentVersions.id,
      versionNo: assessmentVersions.versionNo,
      status: assessmentVersions.status,
      publishedAt: assessmentVersions.publishedAt,
      retiredAt: assessmentVersions.retiredAt,
      sourceVersionId: assessmentVersions.sourceVersionId,
      createdAt: assessmentVersions.createdAt,
    })
    .from(assessmentVersions)
    .where(eq(assessmentVersions.instrumentId, instrumentId))
    .orderBy(asc(assessmentVersions.versionNo))
}

/** The bank, for the authoring UI's item picker. Always live text — the bank is never frozen. */
export async function listBankItems(db: Db, instrumentId: string) {
  return db
    .select({
      id: assessmentItems.id,
      code: assessmentItems.code,
      stem: assessmentItems.stem,
      scaleId: assessmentItems.scaleId,
    })
    .from(assessmentItems)
    .where(eq(assessmentItems.instrumentId, instrumentId))
    .orderBy(asc(assessmentItems.code))
}

export async function listDimensions(db: Db, instrumentId: string) {
  return db
    .select({
      id: assessmentDimensions.id,
      code: assessmentDimensions.code,
      name: assessmentDimensions.name,
      kind: assessmentDimensions.kind,
      description: assessmentDimensions.description,
    })
    .from(assessmentDimensions)
    .where(eq(assessmentDimensions.instrumentId, instrumentId))
    .orderBy(asc(assessmentDimensions.code))
}

export async function listScales(db: Db, instrumentId: string) {
  const rows = await db
    .select({
      id: assessmentScales.id,
      code: assessmentScales.code,
      name: assessmentScales.name,
      points: assessmentScales.points,
    })
    .from(assessmentScales)
    .where(eq(assessmentScales.instrumentId, instrumentId))
    .orderBy(asc(assessmentScales.code))

  return rows.map((row) => ({ ...row, points: parseJson(row.points) }))
}

export async function getVersion(
  db: Db,
  versionId: string
): Promise<
  VersionSummary & {
    instrumentId: string
  }
> {
  const [row] = await db
    .select({
      id: assessmentVersions.id,
      instrumentId: assessmentVersions.instrumentId,
      versionNo: assessmentVersions.versionNo,
      status: assessmentVersions.status,
      publishedAt: assessmentVersions.publishedAt,
      retiredAt: assessmentVersions.retiredAt,
      sourceVersionId: assessmentVersions.sourceVersionId,
      createdAt: assessmentVersions.createdAt,
    })
    .from(assessmentVersions)
    .where(eq(assessmentVersions.id, versionId))
  if (!row) throw new NotFoundError('version', versionId)
  return row
}

export function isFrozen(status: VersionStatus): boolean {
  return status === 'published' || status === 'retired'
}

/**
 * One version with its selection, dimension mapping and scale.
 *
 * Reads the snapshot for a frozen version and the live bank for an open one — see the note at the
 * top of this file.
 */
export async function getVersionDetail(db: Db, versionId: string): Promise<VersionDetail> {
  const version = await getVersion(db, versionId)
  const frozen = isFrozen(version.status)

  const selection = await db
    .select({
      versionItemId: assessmentVersionItems.id,
      itemId: assessmentVersionItems.itemId,
      position: assessmentVersionItems.position,
      reverseCoded: assessmentVersionItems.reverseCoded,
      stemSnapshot: assessmentVersionItems.stemSnapshot,
      scalePointsSnapshot: assessmentVersionItems.scalePointsSnapshot,
      code: assessmentItems.code,
      liveStem: assessmentItems.stem,
      scaleId: assessmentItems.scaleId,
    })
    .from(assessmentVersionItems)
    .innerJoin(assessmentItems, eq(assessmentItems.id, assessmentVersionItems.itemId))
    .where(eq(assessmentVersionItems.versionId, versionId))
    .orderBy(asc(assessmentVersionItems.position))

  const items: VersionItemDetail[] = []

  for (const row of selection) {
    const [scale] = await db
      .select({ code: assessmentScales.code, points: assessmentScales.points })
      .from(assessmentScales)
      .where(eq(assessmentScales.id, row.scaleId))

    const dimensions = frozen
      ? await db
          .select({
            id: assessmentVersionItemDimensions.dimensionId,
            code: assessmentVersionItemDimensions.dimensionCodeSnapshot,
            kind: assessmentDimensions.kind,
          })
          .from(assessmentVersionItemDimensions)
          .leftJoin(
            assessmentDimensions,
            eq(assessmentDimensions.id, assessmentVersionItemDimensions.dimensionId)
          )
          .where(eq(assessmentVersionItemDimensions.versionItemId, row.versionItemId))
      : await db
          .select({
            id: assessmentDimensions.id,
            code: assessmentDimensions.code,
            kind: assessmentDimensions.kind,
          })
          .from(assessmentItemDimensions)
          .innerJoin(
            assessmentDimensions,
            eq(assessmentDimensions.id, assessmentItemDimensions.dimensionId)
          )
          .where(eq(assessmentItemDimensions.itemId, row.itemId))

    items.push({
      versionItemId: row.versionItemId,
      itemId: row.itemId,
      code: row.code,
      position: row.position,
      reverseCoded: row.reverseCoded,
      stem: frozen ? (row.stemSnapshot ?? row.liveStem) : row.liveStem,
      scalePoints: frozen
        ? parseJson(row.scalePointsSnapshot ?? scale?.points ?? null)
        : parseJson(scale?.points ?? null),
      scaleCode: scale?.code ?? null,
      dimensions,
    })
  }

  return { ...version, frozen, items }
}

function parseJson(value: string | null): unknown {
  if (value === null) return null
  try {
    return JSON.parse(value)
  } catch {
    // The engine holds `CHECK(json_valid(...))` on every column this reads, so unparseable text
    // means the CHECK was bypassed. Surfacing null beats throwing on a read path.
    return null
  }
}
