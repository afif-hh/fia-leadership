import { and, eq, max } from 'drizzle-orm'
import * as z from 'zod/mini'

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
import { createAuditRepository } from '../platform/index.ts'
import { assessmentAuditEvent } from './audit-events.ts'
import { assertTransitionAllowed } from './state-machine.ts'

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

export class NotFoundError extends Error {
  constructor(label: string, id: string) {
    super(`${label} '${id}' not found.`)
    this.name = 'NotFoundError'
  }
}

export class CrossInstrumentError extends Error {
  constructor(label: string) {
    super(`${label} belongs to a different instrument.`)
    this.name = 'CrossInstrumentError'
  }
}

/**
 * A mutation was attempted against a `published` or `retired` version.
 *
 * The nine triggers from #48 are the actual guarantee and would abort this write regardless. This
 * error exists so the caller sees why rather than a raw `SQLITE_CONSTRAINT`, which is exactly the
 * division of labour #48 settled on: the trigger is what cannot be bypassed, the guard is what
 * can be acted on. Never remove one on the grounds that the other exists.
 */
export class VersionFrozenError extends Error {
  readonly versionId: string
  readonly status: VersionStatus

  constructor(versionId: string, status: VersionStatus) {
    super(
      `Assessment version '${versionId}' is ${status} and cannot be changed. ` +
        'Create a new version instead (FR-005).'
    )
    this.name = 'VersionFrozenError'
    this.versionId = versionId
    this.status = status
  }
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

    /** Guards `items.scale_id` against #47's cross-table consistency requirement. */
    async createItem(input: CreateItemInput): Promise<string> {
      const [scale] = await db
        .select({ instrumentId: assessmentScales.instrumentId })
        .from(assessmentScales)
        .where(eq(assessmentScales.id, input.scaleId))
      if (!scale) throw new NotFoundError('scale', input.scaleId)
      assertSameInstrument('scale', scale.instrumentId, input.instrumentId)

      const id = crypto.randomUUID()
      await db.insert(assessmentItems).values({
        id,
        instrumentId: input.instrumentId,
        code: input.code,
        stem: input.stem,
        scaleId: input.scaleId,
        createdAt: new Date(),
        createdBy: input.createdBy,
      })
      return id
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
          throw new Error('Reorder must not list the same item twice.')
        }
        if (orderedItemIds.length !== known.size) {
          throw new Error(
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
            throw new Error(
              `Source version must be 'published' or 'retired', not '${source.status}'.`
            )
          }
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

        const items = await tx
          .select({ id: assessmentVersionItems.id, itemId: assessmentVersionItems.itemId })
          .from(assessmentVersionItems)
          .where(eq(assessmentVersionItems.versionId, versionId))

        // A friendlier message than the trigger's — #48's own reasoning for pairing a service
        // guard with the trigger that is the real guarantee.
        if (items.length === 0) {
          throw new Error('Cannot publish a version with no items.')
        }

        for (const versionItem of items) {
          const [item] = await tx
            .select({ stem: assessmentItems.stem, scaleId: assessmentItems.scaleId })
            .from(assessmentItems)
            .where(eq(assessmentItems.id, versionItem.itemId))
          if (!item) throw new NotFoundError('item', versionItem.itemId)

          const [scale] = await tx
            .select({ points: assessmentScales.points })
            .from(assessmentScales)
            .where(eq(assessmentScales.id, item.scaleId))
          if (!scale) throw new NotFoundError('scale', item.scaleId)

          await tx
            .update(assessmentVersionItems)
            .set({ stemSnapshot: item.stem, scalePointsSnapshot: scale.points })
            .where(eq(assessmentVersionItems.id, versionItem.id))

          const dimensions = await tx
            .select({ dimensionId: assessmentItemDimensions.dimensionId })
            .from(assessmentItemDimensions)
            .where(eq(assessmentItemDimensions.itemId, versionItem.itemId))

          for (const { dimensionId } of dimensions) {
            const [dimension] = await tx
              .select({ code: assessmentDimensions.code })
              .from(assessmentDimensions)
              .where(eq(assessmentDimensions.id, dimensionId))
            if (!dimension) throw new NotFoundError('dimension', dimensionId)

            await tx.insert(assessmentVersionItemDimensions).values({
              versionItemId: versionItem.id,
              dimensionId,
              dimensionCodeSnapshot: dimension.code,
            })
          }
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
