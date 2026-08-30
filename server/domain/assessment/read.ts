import { and, asc, eq, inArray } from 'drizzle-orm'

import {
  assessmentDimensionTranslations,
  assessmentDimensions,
  assessmentInstrumentTranslations,
  assessmentInstruments,
  assessmentItemDimensions,
  assessmentItemTranslations,
  assessmentItems,
  assessmentScaleTranslations,
  assessmentScales,
  assessmentVersionItemDimensions,
  assessmentVersionItemTranslations,
  assessmentVersionItems,
  assessmentVersions,
} from '../../db/schema/assessment.ts'
import type { DimensionKind, VersionStatus } from '../../db/schema/assessment.ts'
import { DEFAULT_LOCALE, type Locale } from '../../db/schema/locale.ts'
import type { Db } from '../../db/client.ts'
import { NotFoundError } from './errors.ts'
import { pair } from './translation.ts'

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
 *
 * Every read takes a `locale` and resolves it the same way: the translation row if there is one,
 * the base row otherwise. The fallback is not a failure mode — Indonesian is the authored text,
 * and showing it is more honest than showing an English shell around missing sentences. It is
 * also why none of these functions can return an empty string for a translated field.
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

/** The columns every instrument read selects: the base row plus its translation, if any. */
const INSTRUMENT_COLUMNS = {
  id: assessmentInstruments.id,
  code: assessmentInstruments.code,
  name: assessmentInstruments.name,
  description: assessmentInstruments.description,
  createdAt: assessmentInstruments.createdAt,
  translatedName: assessmentInstrumentTranslations.name,
  translatedDescription: assessmentInstrumentTranslations.description,
}

const instrumentTranslationJoin = (locale: Locale) =>
  and(
    eq(assessmentInstrumentTranslations.instrumentId, assessmentInstruments.id),
    eq(assessmentInstrumentTranslations.locale, locale)
  )

function resolveInstrument(row: {
  id: string
  code: string
  name: string
  description: string | null
  createdAt: Date
  translatedName: string | null
  translatedDescription: string | null
}): InstrumentSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.translatedName ?? row.name,
    description: row.translatedDescription ?? row.description,
    createdAt: row.createdAt,
  }
}

export async function listInstruments(
  db: Db,
  locale: Locale = DEFAULT_LOCALE
): Promise<InstrumentSummary[]> {
  const rows = await db
    .select(INSTRUMENT_COLUMNS)
    .from(assessmentInstruments)
    .leftJoin(assessmentInstrumentTranslations, instrumentTranslationJoin(locale))
    .orderBy(asc(assessmentInstruments.code))
  return rows.map(resolveInstrument)
}

export async function getInstrument(
  db: Db,
  instrumentId: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<InstrumentSummary> {
  const [row] = await db
    .select(INSTRUMENT_COLUMNS)
    .from(assessmentInstruments)
    .leftJoin(assessmentInstrumentTranslations, instrumentTranslationJoin(locale))
    .where(eq(assessmentInstruments.id, instrumentId))
  if (!row) throw new NotFoundError('instrument', instrumentId)
  return resolveInstrument(row)
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
export async function listBankItems(db: Db, instrumentId: string, locale: Locale = DEFAULT_LOCALE) {
  const rows = await db
    .select({
      id: assessmentItems.id,
      code: assessmentItems.code,
      stem: assessmentItems.stem,
      scaleId: assessmentItems.scaleId,
      translatedStem: assessmentItemTranslations.stem,
    })
    .from(assessmentItems)
    .leftJoin(
      assessmentItemTranslations,
      and(
        eq(assessmentItemTranslations.itemId, assessmentItems.id),
        eq(assessmentItemTranslations.locale, locale)
      )
    )
    .where(eq(assessmentItems.instrumentId, instrumentId))
    .orderBy(asc(assessmentItems.code))

  return rows.map(({ translatedStem, ...row }) => ({ ...row, stem: translatedStem ?? row.stem }))
}

export async function listDimensions(
  db: Db,
  instrumentId: string,
  locale: Locale = DEFAULT_LOCALE
) {
  const rows = await db
    .select({
      id: assessmentDimensions.id,
      code: assessmentDimensions.code,
      name: assessmentDimensions.name,
      kind: assessmentDimensions.kind,
      description: assessmentDimensions.description,
      translatedName: assessmentDimensionTranslations.name,
      translatedDescription: assessmentDimensionTranslations.description,
    })
    .from(assessmentDimensions)
    .leftJoin(
      assessmentDimensionTranslations,
      and(
        eq(assessmentDimensionTranslations.dimensionId, assessmentDimensions.id),
        eq(assessmentDimensionTranslations.locale, locale)
      )
    )
    .where(eq(assessmentDimensions.instrumentId, instrumentId))
    .orderBy(asc(assessmentDimensions.code))

  return rows.map(({ translatedName, translatedDescription, ...row }) => ({
    ...row,
    name: translatedName ?? row.name,
    description: translatedDescription ?? row.description,
  }))
}

export async function listScales(db: Db, instrumentId: string, locale: Locale = DEFAULT_LOCALE) {
  const rows = await db
    .select({
      id: assessmentScales.id,
      code: assessmentScales.code,
      name: assessmentScales.name,
      points: assessmentScales.points,
      translatedName: assessmentScaleTranslations.name,
      translatedPoints: assessmentScaleTranslations.points,
    })
    .from(assessmentScales)
    .leftJoin(
      assessmentScaleTranslations,
      and(
        eq(assessmentScaleTranslations.scaleId, assessmentScales.id),
        eq(assessmentScaleTranslations.locale, locale)
      )
    )
    .where(eq(assessmentScales.instrumentId, instrumentId))
    .orderBy(asc(assessmentScales.code))

  return rows.map(({ translatedName, translatedPoints, ...row }) => ({
    ...row,
    name: translatedName ?? row.name,
    points: parseJson(translatedPoints ?? row.points),
  }))
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
export async function getVersionDetail(
  db: Db,
  versionId: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<VersionDetail> {
  const version = await getVersion(db, versionId)
  const frozen = isFrozen(version.status)

  // The scale joins in rather than being fetched per item: this is the read path NFR-01 gives
  // 800 ms, and the per-item form was two extra round-trips per item — 121 queries for the 60-item
  // instrument the PRD describes, each one a network hop to Turso.
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
      scaleCode: assessmentScales.code,
      scalePoints: assessmentScales.points,
      // The frozen translation and the live one, so the same query serves a published version and
      // an open one — which arm is read is decided once, below, by `frozen`.
      frozenStem: assessmentVersionItemTranslations.stemSnapshot,
      frozenScalePoints: assessmentVersionItemTranslations.scalePointsSnapshot,
      liveTranslatedStem: assessmentItemTranslations.stem,
      liveTranslatedScalePoints: assessmentScaleTranslations.points,
    })
    .from(assessmentVersionItems)
    .innerJoin(assessmentItems, eq(assessmentItems.id, assessmentVersionItems.itemId))
    .innerJoin(assessmentScales, eq(assessmentScales.id, assessmentItems.scaleId))
    .leftJoin(
      assessmentVersionItemTranslations,
      and(
        eq(assessmentVersionItemTranslations.versionItemId, assessmentVersionItems.id),
        eq(assessmentVersionItemTranslations.locale, locale)
      )
    )
    .leftJoin(
      assessmentItemTranslations,
      and(
        eq(assessmentItemTranslations.itemId, assessmentItems.id),
        eq(assessmentItemTranslations.locale, locale)
      )
    )
    .leftJoin(
      assessmentScaleTranslations,
      and(
        eq(assessmentScaleTranslations.scaleId, assessmentScales.id),
        eq(assessmentScaleTranslations.locale, locale)
      )
    )
    .where(eq(assessmentVersionItems.versionId, versionId))
    .orderBy(asc(assessmentVersionItems.position))

  // One query for every item's dimensions, grouped in memory. Which side it reads is #47's rule,
  // unchanged: a frozen version reads the snapshot rows keyed by version item, an open one reads
  // the live mapping keyed by bank item.
  const dimensionsByKey = new Map<string, VersionItemDetail['dimensions']>()
  if (selection.length > 0) {
    const rows = frozen
      ? await db
          .select({
            key: assessmentVersionItemDimensions.versionItemId,
            id: assessmentVersionItemDimensions.dimensionId,
            code: assessmentVersionItemDimensions.dimensionCodeSnapshot,
            kind: assessmentDimensions.kind,
          })
          .from(assessmentVersionItemDimensions)
          .leftJoin(
            assessmentDimensions,
            eq(assessmentDimensions.id, assessmentVersionItemDimensions.dimensionId)
          )
          .where(
            inArray(
              assessmentVersionItemDimensions.versionItemId,
              selection.map((row) => row.versionItemId)
            )
          )
      : await db
          .select({
            key: assessmentItemDimensions.itemId,
            id: assessmentDimensions.id,
            code: assessmentDimensions.code,
            kind: assessmentDimensions.kind,
          })
          .from(assessmentItemDimensions)
          .innerJoin(
            assessmentDimensions,
            eq(assessmentDimensions.id, assessmentItemDimensions.dimensionId)
          )
          .where(
            inArray(
              assessmentItemDimensions.itemId,
              selection.map((row) => row.itemId)
            )
          )

    for (const { key, ...dimension } of rows) {
      const list = dimensionsByKey.get(key)
      if (list) list.push(dimension)
      else dimensionsByKey.set(key, [dimension])
    }
  }

  const items: VersionItemDetail[] = selection.map((row) => {
    // A frozen version reads its snapshot, an open one reads through to the live bank (#47). In
    // both arms the translation is taken as a whole or not at all; `pair` is where that rule
    // lives, and `taking.ts` reads the student's screen through the same function.
    const translated = frozen
      ? pair(row.frozenStem, row.frozenScalePoints)
      : pair(row.liveTranslatedStem, row.liveTranslatedScalePoints)

    const base = frozen
      ? {
          stem: row.stemSnapshot ?? row.liveStem,
          scalePoints: row.scalePointsSnapshot ?? row.scalePoints,
        }
      : { stem: row.liveStem, scalePoints: row.scalePoints }

    const text = translated ?? base

    return {
      versionItemId: row.versionItemId,
      itemId: row.itemId,
      code: row.code,
      position: row.position,
      reverseCoded: row.reverseCoded,
      stem: text.stem,
      scalePoints: parseJson(text.scalePoints ?? null),
      scaleCode: row.scaleCode ?? null,
      dimensions: dimensionsByKey.get(frozen ? row.versionItemId : row.itemId) ?? [],
    }
  })

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

export interface InstrumentTranslations {
  locale: Locale
  instrument: { name: string; description: string | null } | null
  items: { itemId: string; stem: string }[]
  scales: { scaleId: string; name: string; points: unknown }[]
  dimensions: { dimensionId: string; name: string; description: string | null }[]
}

/**
 * Every translation an instrument holds in one language, unresolved.
 *
 * The reads above answer "what does this say to a reader"; this answers "what has been
 * translated". The authoring screen needs the second, because it edits the translation next to
 * the original and a resolved read cannot tell a real translation from a fallback.
 */
export async function getInstrumentTranslations(
  db: Db,
  instrumentId: string,
  locale: Locale
): Promise<InstrumentTranslations> {
  const [instrument, items, scales, dimensions] = await Promise.all([
    db
      .select({
        name: assessmentInstrumentTranslations.name,
        description: assessmentInstrumentTranslations.description,
      })
      .from(assessmentInstrumentTranslations)
      .where(
        and(
          eq(assessmentInstrumentTranslations.instrumentId, instrumentId),
          eq(assessmentInstrumentTranslations.locale, locale)
        )
      ),
    db
      .select({ itemId: assessmentItemTranslations.itemId, stem: assessmentItemTranslations.stem })
      .from(assessmentItemTranslations)
      .innerJoin(assessmentItems, eq(assessmentItems.id, assessmentItemTranslations.itemId))
      .where(
        and(
          eq(assessmentItems.instrumentId, instrumentId),
          eq(assessmentItemTranslations.locale, locale)
        )
      ),
    db
      .select({
        scaleId: assessmentScaleTranslations.scaleId,
        name: assessmentScaleTranslations.name,
        points: assessmentScaleTranslations.points,
      })
      .from(assessmentScaleTranslations)
      .innerJoin(assessmentScales, eq(assessmentScales.id, assessmentScaleTranslations.scaleId))
      .where(
        and(
          eq(assessmentScales.instrumentId, instrumentId),
          eq(assessmentScaleTranslations.locale, locale)
        )
      ),
    db
      .select({
        dimensionId: assessmentDimensionTranslations.dimensionId,
        name: assessmentDimensionTranslations.name,
        description: assessmentDimensionTranslations.description,
      })
      .from(assessmentDimensionTranslations)
      .innerJoin(
        assessmentDimensions,
        eq(assessmentDimensions.id, assessmentDimensionTranslations.dimensionId)
      )
      .where(
        and(
          eq(assessmentDimensions.instrumentId, instrumentId),
          eq(assessmentDimensionTranslations.locale, locale)
        )
      ),
  ])

  return {
    locale,
    instrument: instrument[0] ?? null,
    items,
    scales: scales.map((row) => ({ ...row, points: parseJson(row.points) })),
    dimensions,
  }
}
