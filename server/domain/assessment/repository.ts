import { and, eq, inArray, max } from 'drizzle-orm'
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as z from 'zod/mini'

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
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../../db/schema/locale.ts'
import type { Db } from '../../db/client.ts'
import { createAuditRepository } from '../platform/index.ts'
import { assessmentAuditEvent } from './audit-events.ts'
import { assertTransitionAllowed } from './state-machine.ts'
import {
  BaseLocaleNotTranslatableError,
  CrossInstrumentError,
  InvalidReorderError,
  InvalidSourceVersionError,
  NotFoundError,
  OpenVersionExistsError,
  VersionFrozenError,
  VersionNotPublishableError,
} from './errors.ts'
import { pair } from './translation.ts'

/**
 * `server/domain/assessment/` — the only writer to the `assessment_*` tables. No HTTP layer, no
 * UI: this is the service/repository layer #53 and #54 are built on.
 *
 * Bank tables (`instruments`, `dimensions`, `scales`, `items`) stay freely editable forever
 * (#47) — no transaction, no state machine, just plain inserts. `assessment_versions` and its
 * two children carry the real invariants: cloning a version and publishing one are each one
 * transaction, and every write here also goes through `assertSameInstrument` wherever a foreign
 * key could otherwise point across instrument boundaries (#47's own words: "SQLite CHECKs cannot
 * see another table").
 *
 * `created_by` is bare `text` with no foreign key to `identity_user` — CLAUDE.md §12 forbids
 * reaching into another domain's tables from a migration, same precedent as `audit_logs.actor_user_id`.
 */

function assertTranslatableLocale(locale: Locale): void {
  if (locale === DEFAULT_LOCALE) throw new BaseLocaleNotTranslatableError(locale)
}

/**
 * The precondition every translation write shares: the language must be translatable, and the row
 * being translated must exist.
 *
 * Stated once rather than four times. Deliberately not a generic `setTranslation(table, fields)` —
 * that would hide each table's column shape behind a cast, and the shape is the part worth keeping
 * visible. This takes the repetition out and leaves four typed upserts.
 */
async function requireTranslatable(
  db: Db,
  locale: Locale,
  label: string,
  id: string,
  table: IdentifiedTable
): Promise<void> {
  assertTranslatableLocale(locale)
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id))
  if (!row) throw new NotFoundError(label, id)
}

/** A table this helper can look a row up in: any of the four bank tables. */
type IdentifiedTable = SQLiteTable & { id: AnySQLiteColumn }

/** Every language a translation can be stored in: everything except the base row's own. */
const TRANSLATABLE_LOCALES = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)

/** `id -> locale -> value`, for the two translation lookups publish makes per item. */
function groupByLocale<T extends { locale: Locale }>(
  rows: readonly T[],
  idOf: (row: T) => string,
  valueOf: (row: T) => string
): Map<string, Map<Locale, string>> {
  const byId = new Map<string, Map<Locale, string>>()
  for (const row of rows) {
    const id = idOf(row)
    const byLocale = byId.get(id) ?? new Map<Locale, string>()
    byLocale.set(row.locale, valueOf(row))
    byId.set(id, byLocale)
  }
  return byId
}

/**
 * The service guard #47 calls for: stops `version_items.item_id`, `items.scale_id` and
 * `item_dimensions.dimension_id` pointing at another instrument's row.
 */
function assertSameInstrument(label: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new CrossInstrumentError(label)
  }
}

/** Refuses a write to a frozen version with an actionable message. See {@link VersionFrozenError}. */
function assertOpen(versionId: string, status: VersionStatus): void {
  if (status === 'published' || status === 'retired') {
    throw new VersionFrozenError(versionId, status)
  }
}

const scalePoint = z.strictObject({ value: z.number(), label: z.string() })
/** Validated per ADR-005: `points`/`scale_points_snapshot` are `text` at the engine, shape-checked
 * here before ever reaching a `json_valid` CHECK. */
export const scalePointsSchema = z.array(scalePoint)
export type ScalePoints = z.infer<typeof scalePointsSchema>

export interface CreateInstrumentInput {
  code: string
  name: string
  description?: string | null
  createdBy: string
}

export interface CreateDimensionInput {
  instrumentId: string
  code: string
  name: string
  kind: DimensionKind
  description?: string | null
}

export interface CreateScaleInput {
  instrumentId: string
  code: string
  name: string
  points: ScalePoints
}

export interface CreateItemInput {
  instrumentId: string
  code: string
  stem: string
  scaleId: string
  createdBy: string
  /** Mapped in the same transaction as the insert, so an item is never half-mapped. */
  dimensionIds?: readonly string[]
  /** Selects the new item into an open version in the same transaction. */
  addTo?: { versionId: string; position: number }
}

export interface CreateVersionInput {
  instrumentId: string
  actorUserId: string
  /** Omit to start blank (true of every v1). Must be `published` or `retired` (#49) — a draft
   * source would also collide with the one-open-version index. */
  sourceVersionId?: string
}

export interface CreateVersionResult {
  versionId: string
  versionNo: number
  clonedItemCount: number
}

export interface AddVersionItemInput {
  versionId: string
  itemId: string
  position: number
  reverseCoded?: boolean
}

export function createAssessmentRepository(db: Db) {
  return {
    async createInstrument(input: CreateInstrumentInput): Promise<string> {
      const id = crypto.randomUUID()
      await db.insert(assessmentInstruments).values({
        id,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        createdAt: new Date(),
        createdBy: input.createdBy,
      })
      return id
    },

    async createDimension(input: CreateDimensionInput): Promise<string> {
      const id = crypto.randomUUID()
      await db.insert(assessmentDimensions).values({
        id,
        instrumentId: input.instrumentId,
        code: input.code,
        name: input.name,
        kind: input.kind,
        description: input.description ?? null,
      })
      return id
    },

    async createScale(input: CreateScaleInput): Promise<string> {
      const points = scalePointsSchema.parse(input.points)
      const id = crypto.randomUUID()
      await db.insert(assessmentScales).values({
        id,
        instrumentId: input.instrumentId,
        code: input.code,
        name: input.name,
        points: JSON.stringify(points),
      })
      return id
    },

    /**
     * Guards `items.scale_id` against #47's cross-table consistency requirement.
     *
     * `dimensionIds` and `addTo` are applied in the same transaction as the insert, because the
     * authoring UI's real action is "add this item to this version", not three independent writes.
     * Done as separate requests, a failure between them left a bank item that belongs to no
     * version and whose code is already spent against the instrument's unique index — so retrying
     * the same paste then failed on the code, and the item could not be reached from any screen.
     */
    async createItem(input: CreateItemInput): Promise<string> {
      const [scale] = await db
        .select({ instrumentId: assessmentScales.instrumentId })
        .from(assessmentScales)
        .where(eq(assessmentScales.id, input.scaleId))
      if (!scale) throw new NotFoundError('scale', input.scaleId)
      assertSameInstrument('scale', scale.instrumentId, input.instrumentId)

      const dimensionIds = [...new Set(input.dimensionIds ?? [])]
      for (const dimensionId of dimensionIds) {
        const [dimension] = await db
          .select({ instrumentId: assessmentDimensions.instrumentId })
          .from(assessmentDimensions)
          .where(eq(assessmentDimensions.id, dimensionId))
        if (!dimension) throw new NotFoundError('dimension', dimensionId)
        assertSameInstrument('dimension', dimension.instrumentId, input.instrumentId)
      }

      if (input.addTo) {
        const [version] = await db
          .select({
            instrumentId: assessmentVersions.instrumentId,
            status: assessmentVersions.status,
          })
          .from(assessmentVersions)
          .where(eq(assessmentVersions.id, input.addTo.versionId))
        if (!version) throw new NotFoundError('version', input.addTo.versionId)
        assertSameInstrument('version', version.instrumentId, input.instrumentId)
        assertOpen(input.addTo.versionId, version.status)
      }

      const id = crypto.randomUUID()
      await db.transaction(async (tx) => {
        await tx.insert(assessmentItems).values({
          id,
          instrumentId: input.instrumentId,
          code: input.code,
          stem: input.stem,
          scaleId: input.scaleId,
          createdAt: new Date(),
          createdBy: input.createdBy,
        })

        if (dimensionIds.length > 0) {
          await tx
            .insert(assessmentItemDimensions)
            .values(dimensionIds.map((dimensionId) => ({ itemId: id, dimensionId })))
        }

        if (input.addTo) {
          await tx.insert(assessmentVersionItems).values({
            id: crypto.randomUUID(),
            versionId: input.addTo.versionId,
            itemId: id,
            position: input.addTo.position,
            reverseCoded: false,
          })
        }
      })
      return id
    },

    /**
     * Bank content in a second language, written whole per (row, locale).
     *
     * Upsert rather than insert: translating is iterative, and an author correcting one word
     * should not have to delete a row first. There is no delete counterpart on purpose — removing
     * a translation silently reverts that screen to Indonesian for every English reader, which is
     * a decision worth an explicit request rather than a side effect of an edit form.
     *
     * `DEFAULT_LOCALE` is refused. The Indonesian text is the base row, and accepting it here
     * would create a second place for the same sentence to live — the exact drift the base-row
     * design exists to prevent.
     */
    async setItemTranslation(input: {
      itemId: string
      locale: Locale
      stem: string
    }): Promise<void> {
      await requireTranslatable(db, input.locale, 'item', input.itemId, assessmentItems)

      await db
        .insert(assessmentItemTranslations)
        .values(input)
        .onConflictDoUpdate({
          target: [assessmentItemTranslations.itemId, assessmentItemTranslations.locale],
          set: { stem: input.stem },
        })
    },

    /** The anchor ladder is translated whole; see the note on `assessment_scale_translations`. */
    async setScaleTranslation(input: {
      scaleId: string
      locale: Locale
      name: string
      points: ScalePoints
    }): Promise<void> {
      await requireTranslatable(db, input.locale, 'scale', input.scaleId, assessmentScales)

      const points = JSON.stringify(scalePointsSchema.parse(input.points))
      await db
        .insert(assessmentScaleTranslations)
        .values({ scaleId: input.scaleId, locale: input.locale, name: input.name, points })
        .onConflictDoUpdate({
          target: [assessmentScaleTranslations.scaleId, assessmentScaleTranslations.locale],
          set: { name: input.name, points },
        })
    },

    async setDimensionTranslation(input: {
      dimensionId: string
      locale: Locale
      name: string
      description?: string | null
    }): Promise<void> {
      await requireTranslatable(
        db,
        input.locale,
        'dimension',
        input.dimensionId,
        assessmentDimensions
      )

      const values = {
        dimensionId: input.dimensionId,
        locale: input.locale,
        name: input.name,
        description: input.description ?? null,
      }
      await db
        .insert(assessmentDimensionTranslations)
        .values(values)
        .onConflictDoUpdate({
          target: [
            assessmentDimensionTranslations.dimensionId,
            assessmentDimensionTranslations.locale,
          ],
          set: { name: values.name, description: values.description },
        })
    },

    async setInstrumentTranslation(input: {
      instrumentId: string
      locale: Locale
      name: string
      description?: string | null
    }): Promise<void> {
      await requireTranslatable(
        db,
        input.locale,
        'instrument',
        input.instrumentId,
        assessmentInstruments
      )

      const values = {
        instrumentId: input.instrumentId,
        locale: input.locale,
        name: input.name,
        description: input.description ?? null,
      }
      await db
        .insert(assessmentInstrumentTranslations)
        .values(values)
        .onConflictDoUpdate({
          target: [
            assessmentInstrumentTranslations.instrumentId,
            assessmentInstrumentTranslations.locale,
          ],
          set: { name: values.name, description: values.description },
        })
    },

    /** Guards `item_dimensions.dimension_id` against #47's cross-table consistency requirement. */
    async mapItemToDimension(itemId: string, dimensionId: string): Promise<void> {
      const [item] = await db
        .select({ instrumentId: assessmentItems.instrumentId })
        .from(assessmentItems)
        .where(eq(assessmentItems.id, itemId))
      if (!item) throw new NotFoundError('item', itemId)

      const [dimension] = await db
        .select({ instrumentId: assessmentDimensions.instrumentId })
        .from(assessmentDimensions)
        .where(eq(assessmentDimensions.id, dimensionId))
      if (!dimension) throw new NotFoundError('dimension', dimensionId)
      assertSameInstrument('dimension', dimension.instrumentId, item.instrumentId)

      await db.insert(assessmentItemDimensions).values({ itemId, dimensionId })
    },

    /**
     * Replaces an item's whole dimension set in one transaction.
     *
     * The authoring UI's chip picker (#54) toggles a chip and sends the resulting set, so it needs
     * replace rather than the add-only `mapItemToDimension`. Delete-then-insert rather than a diff:
     * the table is a bare two-column join with no other state to preserve, so a diff would be more
     * code for the same result.
     *
     * Bank-level, and deliberately so — a published version keeps its own
     * `assessment_version_item_dimensions` snapshot (#47), so remapping here cannot alter what a
     * published version measures.
     */
    async setItemDimensions(itemId: string, dimensionIds: readonly string[]): Promise<void> {
      const [item] = await db
        .select({ instrumentId: assessmentItems.instrumentId })
        .from(assessmentItems)
        .where(eq(assessmentItems.id, itemId))
      if (!item) throw new NotFoundError('item', itemId)

      const unique = [...new Set(dimensionIds)]

      for (const dimensionId of unique) {
        const [dimension] = await db
          .select({ instrumentId: assessmentDimensions.instrumentId })
          .from(assessmentDimensions)
          .where(eq(assessmentDimensions.id, dimensionId))
        if (!dimension) throw new NotFoundError('dimension', dimensionId)
        assertSameInstrument('dimension', dimension.instrumentId, item.instrumentId)
      }

      await db.transaction(async (tx) => {
        await tx.delete(assessmentItemDimensions).where(eq(assessmentItemDimensions.itemId, itemId))
        if (unique.length > 0) {
          await tx
            .insert(assessmentItemDimensions)
            .values(unique.map((dimensionId) => ({ itemId, dimensionId })))
        }
      })
    },

    /**
     * Adds one item to a version's selection. Guards `version_items.item_id` against #47's
     * cross-table consistency requirement — the trigger from #48 stops this once the version is
     * frozen, but that is a different failure mode from an item belonging to the wrong instrument.
     */
    async addVersionItem(input: AddVersionItemInput): Promise<string> {
      const [version] = await db
        .select({
          instrumentId: assessmentVersions.instrumentId,
          status: assessmentVersions.status,
        })
        .from(assessmentVersions)
        .where(eq(assessmentVersions.id, input.versionId))
      if (!version) throw new NotFoundError('version', input.versionId)
      assertOpen(input.versionId, version.status)

      const [item] = await db
        .select({ instrumentId: assessmentItems.instrumentId })
        .from(assessmentItems)
        .where(eq(assessmentItems.id, input.itemId))
      if (!item) throw new NotFoundError('item', input.itemId)
      assertSameInstrument('item', item.instrumentId, version.instrumentId)

      const id = crypto.randomUUID()
      await db.insert(assessmentVersionItems).values({
        id,
        versionId: input.versionId,
        itemId: input.itemId,
        position: input.position,
        reverseCoded: input.reverseCoded ?? false,
      })
      return id
    },

    async removeVersionItem(versionId: string, itemId: string): Promise<void> {
      const status = await getStatus(db, versionId)
      assertOpen(versionId, status)

      await db
        .delete(assessmentVersionItems)
        .where(
          and(
            eq(assessmentVersionItems.versionId, versionId),
            eq(assessmentVersionItems.itemId, itemId)
          )
        )
    },

    /**
     * Rewrites the whole ordering in one transaction.
     *
     * Every row is parked in a disjoint scratch range first, because
     * `UNIQUE(version_id, position)` would otherwise reject any reorder that passes through a
     * position another row still holds — a swap being the smallest such case, and SQLite having no
     * DEFERRABLE constraint to postpone the check to commit.
     *
     * The scratch range is `max(position) + 1` upwards rather than negative: `position >= 0` is
     * also a CHECK, so negatives abort. That puts scratch above every occupied slot and above the
     * final `0..n-1` range, so neither pass can collide. Both passes are inside the transaction,
     * so the scratch values are never observable.
     */
    async reorderVersionItems(versionId: string, orderedItemIds: readonly string[]): Promise<void> {
      const status = await getStatus(db, versionId)
      assertOpen(versionId, status)

      await db.transaction(async (tx) => {
        const existing = await tx
          .select({
            itemId: assessmentVersionItems.itemId,
            position: assessmentVersionItems.position,
          })
          .from(assessmentVersionItems)
          .where(eq(assessmentVersionItems.versionId, versionId))

        const known = new Set(existing.map((row) => row.itemId))
        for (const itemId of orderedItemIds) {
          if (!known.has(itemId)) throw new NotFoundError('version item', itemId)
        }
        if (new Set(orderedItemIds).size !== orderedItemIds.length) {
          throw new InvalidReorderError('Reorder must not list the same item twice.')
        }
        if (orderedItemIds.length !== known.size) {
          throw new InvalidReorderError(
            `Reorder must list every item in the version: expected ${known.size}, got ${orderedItemIds.length}.`
          )
        }

        const scratchBase =
          Math.max(existing.length, ...existing.map((row) => row.position + 1)) + 1

        const move = (itemId: string, position: number) =>
          tx
            .update(assessmentVersionItems)
            .set({ position })
            .where(
              and(
                eq(assessmentVersionItems.versionId, versionId),
                eq(assessmentVersionItems.itemId, itemId)
              )
            )

        for (const [index, itemId] of orderedItemIds.entries()) {
          await move(itemId, scratchBase + index)
        }
        for (const [index, itemId] of orderedItemIds.entries()) {
          await move(itemId, index)
        }
      })
    },

    async setReverseCoded(versionId: string, itemId: string, reverseCoded: boolean): Promise<void> {
      const status = await getStatus(db, versionId)
      assertOpen(versionId, status)

      await db
        .update(assessmentVersionItems)
        .set({ reverseCoded })
        .where(
          and(
            eq(assessmentVersionItems.versionId, versionId),
            eq(assessmentVersionItems.itemId, itemId)
          )
        )
    },

    /**
     * Rewords a bank item in place. Deliberately unrestricted even when the item appears in a
     * published version — #49 chose this, and the diff is what makes the resulting drift visible.
     */
    async updateItem(itemId: string, changes: { code?: string; stem?: string }): Promise<void> {
      const [item] = await db
        .select({ id: assessmentItems.id })
        .from(assessmentItems)
        .where(eq(assessmentItems.id, itemId))
      if (!item) throw new NotFoundError('item', itemId)

      await db.update(assessmentItems).set(changes).where(eq(assessmentItems.id, itemId))
    },

    async updateDimension(
      dimensionId: string,
      changes: { code?: string; name?: string; kind?: DimensionKind; description?: string | null }
    ): Promise<void> {
      const [dimension] = await db
        .select({ id: assessmentDimensions.id })
        .from(assessmentDimensions)
        .where(eq(assessmentDimensions.id, dimensionId))
      if (!dimension) throw new NotFoundError('dimension', dimensionId)

      await db
        .update(assessmentDimensions)
        .set(changes)
        .where(eq(assessmentDimensions.id, dimensionId))
    },

    async updateScale(
      scaleId: string,
      changes: { code?: string; name?: string; points?: ScalePoints }
    ): Promise<void> {
      const [scale] = await db
        .select({ id: assessmentScales.id })
        .from(assessmentScales)
        .where(eq(assessmentScales.id, scaleId))
      if (!scale) throw new NotFoundError('scale', scaleId)

      const { points, ...rest } = changes
      await db
        .update(assessmentScales)
        .set(
          points === undefined
            ? rest
            : { ...rest, points: JSON.stringify(scalePointsSchema.parse(points)) }
        )
        .where(eq(assessmentScales.id, scaleId))
    },

    /**
     * Insert the version row, then — if cloning — `INSERT..SELECT` the source's selection with
     * snapshots left NULL. One transaction (#49).
     */
    async createVersion(input: CreateVersionInput): Promise<CreateVersionResult> {
      const versionId = crypto.randomUUID()
      let versionNo = 0
      let clonedItemCount = 0

      await db.transaction(async (tx) => {
        if (input.sourceVersionId) {
          const [source] = await tx
            .select({
              instrumentId: assessmentVersions.instrumentId,
              status: assessmentVersions.status,
            })
            .from(assessmentVersions)
            .where(eq(assessmentVersions.id, input.sourceVersionId))
          if (!source) throw new NotFoundError('version', input.sourceVersionId)
          assertSameInstrument('source version', source.instrumentId, input.instrumentId)
          if (source.status !== 'published' && source.status !== 'retired') {
            throw new InvalidSourceVersionError(source.status)
          }
        }

        // Pre-check the partial unique index rather than letting it abort: see
        // OpenVersionExistsError. Inside the transaction, so it reads the same snapshot as the
        // insert below — the index remains the guarantee if two transactions race.
        const [open] = await tx
          .select({ id: assessmentVersions.id, versionNo: assessmentVersions.versionNo })
          .from(assessmentVersions)
          .where(
            and(
              eq(assessmentVersions.instrumentId, input.instrumentId),
              inArray(assessmentVersions.status, ['draft', 'review'])
            )
          )
        if (open) {
          throw new OpenVersionExistsError(input.instrumentId, open.id, open.versionNo)
        }

        const [row] = await tx
          .select({ maxNo: max(assessmentVersions.versionNo) })
          .from(assessmentVersions)
          .where(eq(assessmentVersions.instrumentId, input.instrumentId))
        versionNo = (row?.maxNo ?? 0) + 1

        await tx.insert(assessmentVersions).values({
          id: versionId,
          instrumentId: input.instrumentId,
          versionNo,
          status: 'draft',
          sourceVersionId: input.sourceVersionId ?? null,
          createdAt: new Date(),
          createdBy: input.actorUserId,
        })

        if (input.sourceVersionId) {
          const sourceItems = await tx
            .select({
              itemId: assessmentVersionItems.itemId,
              position: assessmentVersionItems.position,
              reverseCoded: assessmentVersionItems.reverseCoded,
            })
            .from(assessmentVersionItems)
            .where(eq(assessmentVersionItems.versionId, input.sourceVersionId))

          if (sourceItems.length > 0) {
            await tx.insert(assessmentVersionItems).values(
              sourceItems.map((item) => ({
                id: crypto.randomUUID(),
                versionId,
                itemId: item.itemId,
                position: item.position,
                reverseCoded: item.reverseCoded,
              }))
            )
          }
          clonedItemCount = sourceItems.length
        }

        const event = assessmentAuditEvent({
          event_type: 'assessment.version_created',
          version_id: versionId,
          version_no: versionNo,
          source_version_id: input.sourceVersionId ?? null,
          cloned_item_count: clonedItemCount,
        })
        await createAuditRepository(tx as unknown as Db).append({
          ...event,
          actorUserId: input.actorUserId,
          targetUserId: null,
        })
      })

      return { versionId, versionNo, clonedItemCount }
    },

    /** `draft -> review`. Not independently audited — only create/publish/retire are (#52). */
    async advanceToReview(versionId: string): Promise<void> {
      const status = await getStatus(db, versionId)
      assertTransitionAllowed(status, 'review')
      await db
        .update(assessmentVersions)
        .set({ status: 'review' })
        .where(eq(assessmentVersions.id, versionId))
    },

    /**
     * `review -> published`. Fills the snapshot columns from current bank state, *then* flips
     * status, in one interactive transaction — flipping first would make #48's own triggers
     * block these same writes.
     */
    async publish(versionId: string, actorUserId: string): Promise<void> {
      await db.transaction(async (tx) => {
        const [version] = await tx
          .select({ status: assessmentVersions.status, versionNo: assessmentVersions.versionNo })
          .from(assessmentVersions)
          .where(eq(assessmentVersions.id, versionId))
        if (!version) throw new NotFoundError('version', versionId)
        assertTransitionAllowed(version.status, 'published')

        // One joined read of everything to be snapshotted, rather than three queries per item and
        // one per mapping. At the 60-item x 20-dimension scale the PRD states, the per-item form
        // was ~250 sequential round-trips inside a single transaction against a remote Turso
        // connection; NFR-01 gives the read path 800 ms and publish is not exempt from being
        // usable. The immutability triggers are unchanged, so what may be written is unchanged too.
        const items = await tx
          .select({
            id: assessmentVersionItems.id,
            itemId: assessmentVersionItems.itemId,
            scaleId: assessmentItems.scaleId,
            code: assessmentItems.code,
            stem: assessmentItems.stem,
            points: assessmentScales.points,
          })
          .from(assessmentVersionItems)
          .innerJoin(assessmentItems, eq(assessmentItems.id, assessmentVersionItems.itemId))
          .innerJoin(assessmentScales, eq(assessmentScales.id, assessmentItems.scaleId))
          .where(eq(assessmentVersionItems.versionId, versionId))

        // Friendlier messages than the triggers' — #48's own reasoning for pairing a service guard
        // with the trigger that is the real guarantee.
        if (items.length === 0) {
          throw new VersionNotPublishableError('no-items')
        }

        const mappings = await tx
          .select({
            itemId: assessmentItemDimensions.itemId,
            dimensionId: assessmentItemDimensions.dimensionId,
            code: assessmentDimensions.code,
          })
          .from(assessmentItemDimensions)
          .innerJoin(
            assessmentDimensions,
            eq(assessmentDimensions.id, assessmentItemDimensions.dimensionId)
          )
          .where(
            inArray(
              assessmentItemDimensions.itemId,
              items.map((row) => row.itemId)
            )
          )

        const mappedByItem = new Map<string, typeof mappings>()
        for (const mapping of mappings) {
          const list = mappedByItem.get(mapping.itemId)
          if (list) list.push(mapping)
          else mappedByItem.set(mapping.itemId, [mapping])
        }

        // The same gate the review screen applies, enforced here because the UI is not a boundary
        // (CLAUDE.md §6). An item measuring nothing contributes to no dimension score, so a version
        // containing one publishes as permanently unscoreable — and FR-005 means it can never be
        // corrected in place.
        const unmapped = items.filter((row) => !mappedByItem.has(row.itemId))
        if (unmapped.length > 0) {
          throw new VersionNotPublishableError(
            'unmapped-items',
            unmapped.map((row) => row.code).sort()
          )
        }

        // The translated half of the snapshot, read in two queries rather than two per item for
        // the same reason as the base read above.
        const itemIds = items.map((row) => row.itemId)
        const scaleIds = [...new Set(items.map((row) => row.scaleId))]

        const itemTranslations = await tx
          .select({
            itemId: assessmentItemTranslations.itemId,
            locale: assessmentItemTranslations.locale,
            stem: assessmentItemTranslations.stem,
          })
          .from(assessmentItemTranslations)
          .where(inArray(assessmentItemTranslations.itemId, itemIds))

        const scaleTranslations = await tx
          .select({
            scaleId: assessmentScaleTranslations.scaleId,
            locale: assessmentScaleTranslations.locale,
            points: assessmentScaleTranslations.points,
          })
          .from(assessmentScaleTranslations)
          .where(inArray(assessmentScaleTranslations.scaleId, scaleIds))

        // Nested rather than a composite string key: `byLocale.get(id)?.get(locale)` says what it
        // looks up, and a separator character in a template literal does not.
        const stemByItem = groupByLocale(
          itemTranslations,
          (row) => row.itemId,
          (row) => row.stem
        )
        const pointsByScale = groupByLocale(
          scaleTranslations,
          (row) => row.scaleId,
          (row) => row.points
        )

        const translatedRows: (typeof assessmentVersionItemTranslations.$inferInsert)[] = []
        const dimensionRows: (typeof assessmentVersionItemDimensions.$inferInsert)[] = []

        for (const versionItem of items) {
          await tx
            .update(assessmentVersionItems)
            .set({ stemSnapshot: versionItem.stem, scalePointsSnapshot: versionItem.points })
            .where(eq(assessmentVersionItems.id, versionItem.id))

          // A locale is snapshotted only when both halves exist in it — `pair` is the same rule the
          // read paths apply, and a frozen version can never be corrected, so a half-translated
          // item is written as no translation at all and the reader falls back to the base.
          for (const locale of TRANSLATABLE_LOCALES) {
            const text = pair(
              stemByItem.get(versionItem.itemId)?.get(locale),
              pointsByScale.get(versionItem.scaleId)?.get(locale)
            )
            if (!text) continue
            translatedRows.push({
              versionItemId: versionItem.id,
              locale,
              stemSnapshot: text.stem,
              scalePointsSnapshot: text.scalePoints,
            })
          }

          for (const mapping of mappedByItem.get(versionItem.itemId) ?? []) {
            dimensionRows.push({
              versionItemId: versionItem.id,
              dimensionId: mapping.dimensionId,
              dimensionCodeSnapshot: mapping.code,
            })
          }
        }

        // One insert each, not one per item. Publish already had a per-item round-trip budget
        // problem once (see the note above the joined read); at the 60-item scale the PRD
        // describes, per-item inserts put 120 extra statements inside this transaction.
        if (translatedRows.length > 0) {
          await tx.insert(assessmentVersionItemTranslations).values(translatedRows)
        }
        if (dimensionRows.length > 0) {
          await tx.insert(assessmentVersionItemDimensions).values(dimensionRows)
        }

        await tx
          .update(assessmentVersions)
          .set({ status: 'published', publishedAt: new Date() })
          .where(eq(assessmentVersions.id, versionId))

        const event = assessmentAuditEvent({
          event_type: 'assessment.version_published',
          version_id: versionId,
          version_no: version.versionNo,
        })
        await createAuditRepository(tx as unknown as Db).append({
          ...event,
          actorUserId,
          targetUserId: null,
        })
      })
    },

    /** `published -> retired`. The only mutation #48's trigger permits on a frozen row. */
    async retire(versionId: string, actorUserId: string): Promise<void> {
      await db.transaction(async (tx) => {
        const [version] = await tx
          .select({ status: assessmentVersions.status, versionNo: assessmentVersions.versionNo })
          .from(assessmentVersions)
          .where(eq(assessmentVersions.id, versionId))
        if (!version) throw new NotFoundError('version', versionId)
        assertTransitionAllowed(version.status, 'retired')

        await tx
          .update(assessmentVersions)
          .set({ status: 'retired', retiredAt: new Date() })
          .where(eq(assessmentVersions.id, versionId))

        const event = assessmentAuditEvent({
          event_type: 'assessment.version_retired',
          version_id: versionId,
          version_no: version.versionNo,
        })
        await createAuditRepository(tx as unknown as Db).append({
          ...event,
          actorUserId,
          targetUserId: null,
        })
      })
    },
  }
}

async function getStatus(db: Db, versionId: string): Promise<VersionStatus> {
  const [version] = await db
    .select({ status: assessmentVersions.status })
    .from(assessmentVersions)
    .where(eq(assessmentVersions.id, versionId))
  if (!version) throw new NotFoundError('version', versionId)
  return version.status
}

export type AssessmentRepository = ReturnType<typeof createAssessmentRepository>
