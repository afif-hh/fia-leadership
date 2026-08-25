import { check, primaryKey, sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * The `assessment` domain: instruments, their versions, a per-instrument item bank, and the
 * scales/dimensions items are authored against.
 *
 * Bank tables (`assessment_instruments`, `assessment_items`, `assessment_dimensions`,
 * `assessment_scales`) stay freely editable forever — a published version does not depend on
 * them, because publish snapshots the parts that matter onto `assessment_versions` and its two
 * children. Those three tables are the only ones immutability-frozen; see the trigger migration
 * that ships alongside this schema. See #44, #47, #48, #49.
 *
 * `assessment_scoring_rules` is deliberately not here — ruled out in #47, belongs to the
 * scoring-engine map.
 */

export const VERSION_STATUSES = ['draft', 'review', 'published', 'retired'] as const
export type VersionStatus = (typeof VERSION_STATUSES)[number]

/** The three overlapping families kdpgk-v1.md's outputs need from one response set. */
export const DIMENSION_KINDS = ['domain', 'style', 'axis'] as const
export type DimensionKind = (typeof DIMENSION_KINDS)[number]

const sqlList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '))

/**
 * Format-only CHECK for a `code` column: lowercase letters, digits, underscore, non-empty.
 * Mirrors the `NOT GLOB` idiom `audit_logs.event_type` uses (ADR-005) — a closed vocabulary
 * would mean a table rebuild every time an author adds one, so only the shape is engine-held.
 */
const codeFormatCheck = (name: string, column: AnySQLiteColumn) =>
  check(name, sql`length(${column}) > 0 AND ${column} NOT GLOB '*[^a-z0-9_]*'`)

// ---------------------------------------------------------------------------
// Bank tables — freely editable forever, never frozen.
// ---------------------------------------------------------------------------

export const assessmentInstruments = sqliteTable(
  'assessment_instruments',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    createdBy: text('created_by').notNull(),
  },
  (t) => [
    uniqueIndex('assessment_instruments_code_key').on(t.code),
    codeFormatCheck('assessment_instruments_code_format_check', t.code),
  ]
)

export const assessmentDimensions = sqliteTable(
  'assessment_dimensions',
  {
    id: text('id').primaryKey(),
    instrumentId: text('instrument_id')
      .notNull()
      .references(() => assessmentInstruments.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: text('kind', { enum: DIMENSION_KINDS }).notNull(),
    description: text('description'),
  },
  (t) => [
    uniqueIndex('assessment_dimensions_instrument_id_code_key').on(t.instrumentId, t.code),
    codeFormatCheck('assessment_dimensions_code_format_check', t.code),
    check('assessment_dimensions_kind_check', sql`${t.kind} IN (${sqlList(DIMENSION_KINDS)})`),
  ]
)

/**
 * Anchor points (`{ value, label }[]`) as validated JSON — authorable content, not a UI
 * constant. `points` is `text`, shape-checked here with `json_valid` and, at the boundary, with
 * a `z.strictObject` per member (ADR-005); nothing here inspects inside it.
 */
export const assessmentScales = sqliteTable(
  'assessment_scales',
  {
    id: text('id').primaryKey(),
    instrumentId: text('instrument_id')
      .notNull()
      .references(() => assessmentInstruments.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    points: text('points').notNull(),
  },
  (t) => [
    uniqueIndex('assessment_scales_instrument_id_code_key').on(t.instrumentId, t.code),
    codeFormatCheck('assessment_scales_code_format_check', t.code),
    check('assessment_scales_points_json_check', sql`json_valid(${t.points})`),
  ]
)

export const assessmentItems = sqliteTable(
  'assessment_items',
  {
    id: text('id').primaryKey(),
    instrumentId: text('instrument_id')
      .notNull()
      .references(() => assessmentInstruments.id),
    code: text('code').notNull(),
    stem: text('stem').notNull(),
    scaleId: text('scale_id')
      .notNull()
      .references(() => assessmentScales.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    createdBy: text('created_by').notNull(),
  },
  (t) => [
    uniqueIndex('assessment_items_instrument_id_code_key').on(t.instrumentId, t.code),
    codeFormatCheck('assessment_items_code_format_check', t.code),
  ]
)

/**
 * Many-to-many: one item plausibly feeds a domain score, a style score and a Blake–Mouton axis
 * at once. Deliberately no weight column — a weight is a scoring decision, out of this map's
 * scope (#47).
 */
export const assessmentItemDimensions = sqliteTable(
  'assessment_item_dimensions',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => assessmentItems.id),
    dimensionId: text('dimension_id')
      .notNull()
      .references(() => assessmentDimensions.id),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.dimensionId] })]
)

// ---------------------------------------------------------------------------
// Version tables — frozen once `published` or `retired`. See the trigger migration.
// ---------------------------------------------------------------------------

export const assessmentVersions = sqliteTable(
  'assessment_versions',
  {
    id: text('id').primaryKey(),
    instrumentId: text('instrument_id')
      .notNull()
      .references(() => assessmentInstruments.id),
    versionNo: integer('version_no').notNull(),
    status: text('status', { enum: VERSION_STATUSES }).notNull().default('draft'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    /** Lifecycle label only — a retired version stays as frozen as a published one (#48). */
    retiredAt: integer('retired_at', { mode: 'timestamp_ms' }),
    /**
     * NULL means this version started blank (true of every v1). `restrict` because #48 makes
     * both `published` and `retired` undeletable, so a source can never disappear out from under
     * this reference (#49).
     */
    sourceVersionId: text('source_version_id').references(
      (): AnySQLiteColumn => assessmentVersions.id,
      { onDelete: 'restrict' }
    ),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    createdBy: text('created_by').notNull(),
  },
  (t) => [
    uniqueIndex('assessment_versions_instrument_id_version_no_key').on(t.instrumentId, t.versionNo),
    /**
     * At most one open (draft/review) version per instrument (#49) — the realistic failure this
     * prevents is two authors silently forking the same instrument, now that #45 gives both
     * Academic Lead and Lab Admin write access. Also what keeps `version_no` gapless for free.
     */
    uniqueIndex('assessment_versions_one_open_per_instrument')
      .on(t.instrumentId)
      .where(sql`${t.status} IN ('draft', 'review')`),
    check('assessment_versions_status_check', sql`${t.status} IN (${sqlList(VERSION_STATUSES)})`),
    check('assessment_versions_version_no_check', sql`${t.versionNo} > 0`),
    check(
      'assessment_versions_published_at_check',
      sql`${t.status} <> 'published' OR ${t.publishedAt} IS NOT NULL`
    ),
  ]
)

/**
 * The per-version item selection. `position` and `reverse_coded` are per-version, so they live
 * here rather than on the bank item — the same bank item can appear in two versions with a
 * different order or coding. Snapshot columns are nullable during draft; publish fills them
 * before flipping status, in one interactive transaction (#48).
 */
export const assessmentVersionItems = sqliteTable(
  'assessment_version_items',
  {
    id: text('id').primaryKey(),
    versionId: text('version_id')
      .notNull()
      .references(() => assessmentVersions.id),
    itemId: text('item_id')
      .notNull()
      .references(() => assessmentItems.id),
    position: integer('position').notNull(),
    reverseCoded: integer('reverse_coded', { mode: 'boolean' }).notNull().default(false),
    stemSnapshot: text('stem_snapshot'),
    scalePointsSnapshot: text('scale_points_snapshot'),
  },
  (t) => [
    uniqueIndex('assessment_version_items_version_id_item_id_key').on(t.versionId, t.itemId),
    uniqueIndex('assessment_version_items_version_id_position_key').on(t.versionId, t.position),
    check('assessment_version_items_position_check', sql`${t.position} >= 0`),
    check('assessment_version_items_reverse_coded_check', sql`${t.reverseCoded} IN (0, 1)`),
    check(
      'assessment_version_items_scale_points_snapshot_json_check',
      sql`${t.scalePointsSnapshot} IS NULL OR json_valid(${t.scalePointsSnapshot})`
    ),
  ]
)

/**
 * The dimension-mapping half of the publish snapshot. Rows exist only from publish onward — the
 * bank's `assessment_item_dimensions` mapping for every selected item, copied in at the same
 * time as the stem/scale snapshot, which is why `dimension_code_snapshot` is `NOT NULL` here
 * rather than nullable like its sibling columns on `assessment_version_items`.
 */
export const assessmentVersionItemDimensions = sqliteTable(
  'assessment_version_item_dimensions',
  {
    versionItemId: text('version_item_id')
      .notNull()
      .references(() => assessmentVersionItems.id),
    dimensionId: text('dimension_id')
      .notNull()
      .references(() => assessmentDimensions.id),
    dimensionCodeSnapshot: text('dimension_code_snapshot').notNull(),
  },
  (t) => [primaryKey({ columns: [t.versionItemId, t.dimensionId] })]
)
