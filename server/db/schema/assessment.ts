import {
  check,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

import { LOCALES } from './locale.ts'

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
 * A translation row's language. Engine-held as a CHECK for the same reason the status vocabulary
 * is: a row naming a language the application cannot render is unreadable content collected under
 * a heading nobody can reproduce.
 */
const localeCheck = (name: string, column: AnySQLiteColumn) =>
  check(name, sql`${column} IN (${sqlList(LOCALES)})`)

/**
 * Format-only CHECK for a `code` column: lowercase letters, digits, underscore, non-empty.
 * Mirrors the `NOT GLOB` idiom `audit_logs.event_type` uses (ADR-005) — a closed vocabulary
 * would mean a table rebuild every time an author adds one, so only the shape is engine-held.
 */
const codeFormatCheck = (name: string, column: AnySQLiteColumn) =>
  check(name, sql`length(${column}) > 0 AND ${column} NOT GLOB '*[^a-z0-9_]*'`)

/**
 * The request-side mirror of `codeFormatCheck`, kept in the same file so the two cannot drift.
 *
 * The CHECK is the guarantee and stays. This exists so a malformed `code` is refused at the API
 * boundary with a 422 naming the field, instead of reaching SQLite and coming back as a 500 with
 * the failed statement and a stack trace in the body — which is what `POST /instruments` did for
 * any code containing a capital letter.
 */
export const ASSESSMENT_CODE_PATTERN = /^[a-z0-9_]+$/

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
 * Bank content in a second language.
 *
 * Side-car rows rather than columns on the bank tables, and the base row keeps the Indonesian
 * text rather than moving into a translation of its own. Two consequences, both wanted: existing
 * rows need no backfill and no nullable columns, and the default reading path is exactly the
 * query it was before this table existed.
 *
 * A missing row is not an error. `resolve` in `translation.ts` falls back to the base text, so a
 * partly translated instrument renders as a partly translated instrument rather than as a hole —
 * the same rule the browser's `fallbackLocale` follows.
 *
 * A translation is bank content, so like the rest of the bank it stays editable forever. What a
 * *published version* asks is frozen separately, in `assessment_version_item_translations`.
 */
export const assessmentInstrumentTranslations = sqliteTable(
  'assessment_instrument_translations',
  {
    instrumentId: text('instrument_id')
      .notNull()
      .references(() => assessmentInstruments.id),
    locale: text('locale', { enum: LOCALES }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
  },
  (t) => [
    primaryKey({ columns: [t.instrumentId, t.locale] }),
    localeCheck('assessment_instrument_translations_locale_check', t.locale),
  ]
)

export const assessmentDimensionTranslations = sqliteTable(
  'assessment_dimension_translations',
  {
    dimensionId: text('dimension_id')
      .notNull()
      .references(() => assessmentDimensions.id),
    locale: text('locale', { enum: LOCALES }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
  },
  (t) => [
    primaryKey({ columns: [t.dimensionId, t.locale] }),
    localeCheck('assessment_dimension_translations_locale_check', t.locale),
  ]
)

/**
 * `points` carries the whole anchor-point array, not a per-label row.
 *
 * A scale's anchors are read as a set — "1 = Sangat tidak sesuai … 5 = Sangat sesuai" is one
 * calibrated ladder, and translating one rung without the others is how a scale stops measuring
 * what it measured. Storing the array whole makes a partial translation unrepresentable.
 */
export const assessmentScaleTranslations = sqliteTable(
  'assessment_scale_translations',
  {
    scaleId: text('scale_id')
      .notNull()
      .references(() => assessmentScales.id),
    locale: text('locale', { enum: LOCALES }).notNull(),
    name: text('name').notNull(),
    points: text('points').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.scaleId, t.locale] }),
    localeCheck('assessment_scale_translations_locale_check', t.locale),
    check('assessment_scale_translations_points_json_check', sql`json_valid(${t.points})`),
  ]
)

export const assessmentItemTranslations = sqliteTable(
  'assessment_item_translations',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => assessmentItems.id),
    locale: text('locale', { enum: LOCALES }).notNull(),
    stem: text('stem').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.locale] }),
    localeCheck('assessment_item_translations_locale_check', t.locale),
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

/**
 * The other half of the publish snapshot: what this version asks in each translated language.
 *
 * Frozen for the same reason the base snapshot is (FR-005, #48). A student who answered the
 * English rendering answered *those sentences*, and editing the bank translation afterwards must
 * not change what the record says they were asked. The base columns on
 * `assessment_version_items` keep holding the Indonesian, so a version with no translation looks
 * exactly as it did before this table existed.
 *
 * Rows exist only from publish onward, and only for a locale that had a bank translation at
 * publish time. A locale translated after publish is therefore absent here on purpose: adding it
 * would change what a frozen version asks, which is what a new version is for.
 */
export const assessmentVersionItemTranslations = sqliteTable(
  'assessment_version_item_translations',
  {
    versionItemId: text('version_item_id')
      .notNull()
      .references(() => assessmentVersionItems.id),
    locale: text('locale', { enum: LOCALES }).notNull(),
    stemSnapshot: text('stem_snapshot').notNull(),
    scalePointsSnapshot: text('scale_points_snapshot').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.versionItemId, t.locale] }),
    localeCheck('assessment_version_item_translations_locale_check', t.locale),
    check(
      'assessment_version_item_translations_scale_points_json_check',
      sql`json_valid(${t.scalePointsSnapshot})`
    ),
  ]
)

// ---------------------------------------------------------------------------
// Taking tables — a student's session and the answers in it (#58, #59, #67).
// ---------------------------------------------------------------------------

/**
 * `scored` exists from day one even though the scoring engine does not, and that is a cost
 * decision rather than tidiness: SQLite has no `ALTER TABLE … ADD CONSTRAINT`, so widening this
 * CHECK later means rebuilding `assessment_sessions` at a point when it holds real students'
 * sessions. Including it now costs nothing — the state machine simply has no transition into it.
 *
 * `abandoned` was considered and rejected on the same reasoning read the other way: it is
 * speculative, and session expiry and time limits are both out of scope (#58).
 */
export const SESSION_STATUSES = ['in_progress', 'submitted', 'scored'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

/**
 * One row per (student, version). The only transition implemented is `in_progress → submitted`;
 * **`submitted → scored` is a defined contract this map deliberately does not implement**, left
 * here so the scoring effort finds it waiting rather than having to invent it (#58, #70).
 *
 * `user_id` carries no foreign key, matching `created_by` on the tables above: this repo draws
 * the domain boundary with the table-name prefix and the *absence* of cross-domain references
 * (CLAUDE.md rule 12). `consent_policy_version` is a plain column for the same reason (#59).
 */
export const assessmentSessions = sqliteTable(
  'assessment_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    versionId: text('version_id')
      .notNull()
      .references(() => assessmentVersions.id),
    status: text('status', { enum: SESSION_STATUSES }).notNull().default('in_progress'),
    /**
     * The `policy_version` of `assessment-privacy-notice` in force at `start` (#59). Denormalised
     * on purpose: reconstructing it from `identity_consents.accepted_at` ordering holds until a
     * seed or import row lands out of order, and it turns a traceability question into a
     * cross-domain inference.
     */
    consentPolicyVersion: text('consent_policy_version').notNull(),
    /** `started_at` rather than `created_at`: "start" is the domain's own word for this event. */
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    submittedAt: integer('submitted_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    /**
     * Plain, with no status filter. One session per version and no retakes are both settled, so a
     * partial index would carry a condition nothing needs.
     */
    uniqueIndex('assessment_sessions_user_id_version_id_key').on(t.userId, t.versionId),
    check('assessment_sessions_status_check', sql`${t.status} IN (${sqlList(SESSION_STATUSES)})`),
    /**
     * Mirrors `assessment_versions_published_at_check`. NFR-11 wants a score traceable to a
     * response set *and a timestamp*, and a submitted session with no submit time cannot supply
     * one. Held by the engine because adding a CHECK later is a table rebuild.
     */
    check(
      'assessment_sessions_submitted_at_check',
      sql`${t.status} = 'in_progress' OR ${t.submittedAt} IS NOT NULL`
    ),
  ]
)

/**
 * One row per (session, version item) — rows rather than one JSON blob on the session, because
 * scoring reads per item and joins `reverse_coded` and the dimension mapping, and because a blob
 * makes autosave a read-modify-write that silently loses an answer (#58).
 *
 * The foreign key points at the **snapshot** row, not the bank's `item_id`. That row already
 * carries `position`, `reverse_coded`, and the stem/scale snapshots, so referencing it locks an
 * answer to the version it was given under as a side effect rather than as an extra rule.
 *
 * Not append-only, deliberately (#58): an edit history is behavioural data nobody requested, that
 * scoring does not read, and that is more revealing than the final answer if it leaks. For the
 * same reason there is no per-answer timestamp — `privacy-security.md` asks for the minimum
 * necessary, and nothing consumes one.
 *
 * The composite primary key *is* the upsert key the autosave contract relies on (#64), which is
 * why that endpoint needs no idempotency mechanism of its own.
 */
export const assessmentResponses = sqliteTable(
  'assessment_responses',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => assessmentSessions.id),
    versionItemId: text('version_item_id')
      .notNull()
      .references(() => assessmentVersionItems.id),
    /**
     * `real`, matching the `z.number()` the published authoring contract already promises for a
     * scale point's `value`. Tightening authoring to integers would make an already-published
     * version with a fractional anchor fail its own validation, and published versions are frozen.
     *
     * The constraint that actually matters — that this is one of the `value`s in the item's
     * `scale_points_snapshot` — lives in JSON on another row, out of reach of a SQLite CHECK. It
     * is a mandatory service-layer check, and its error message must never contain the value
     * itself (the PII Rule; see #58).
     */
    answerValue: real('answer_value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.versionItemId] })]
)

// ---------------------------------------------------------------------------
// Scoring configuration — the versioned formula inputs (#26, ADR-010).
// ---------------------------------------------------------------------------

/**
 * A scoring version's lifecycle. Deliberately not the four of `VERSION_STATUSES`: there is no
 * `review` here, because rbac.md's Scoring Rules row already splits the work between two roles —
 * Lab Admin drafts, Academic Lead approves — so `draft → approved` *is* the review.
 *
 * `retired` exists for the same reason it does on a version: a formula that must stop being
 * handed out still has to keep explaining scores it already produced.
 */
export const SCORING_VERSION_STATUSES = ['draft', 'approved', 'retired'] as const
export type ScoringVersionStatus = (typeof SCORING_VERSION_STATUSES)[number]

/**
 * One formula, bound to one published assessment version.
 *
 * Bound to a *version* rather than an instrument because the weights address dimensions by the
 * codes that version froze at publish. A new assessment version can add or drop a dimension, and
 * a weight set that no longer matches its item mapping is a formula that silently scores nothing.
 *
 * `bands` is the readiness threshold table, carried as configuration rather than as code, so that
 * changing a threshold is structurally a new row rather than a deploy — which is what makes
 * `/CLAUDE.md` rule 1 enforceable at all. Its shape is validated at the boundary by a
 * `z.strictObject` per member (ADR-005); nothing in SQLite looks inside it.
 *
 * The two axis columns name which dimension is Blake-Mouton's Task and which is its People. They
 * are nullable together: an instrument with no grid is a legitimate instrument, and inventing an
 * axis for it would put a coordinate on a report that measures nothing.
 */
export const assessmentScoringVersions = sqliteTable(
  'assessment_scoring_versions',
  {
    id: text('id').primaryKey(),
    versionId: text('version_id')
      .notNull()
      .references(() => assessmentVersions.id),
    scoringNo: integer('scoring_no').notNull(),
    status: text('status', { enum: SCORING_VERSION_STATUSES }).notNull().default('draft'),
    bands: text('bands').notNull(),
    taskAxisDimensionId: text('task_axis_dimension_id').references(() => assessmentDimensions.id),
    peopleAxisDimensionId: text('people_axis_dimension_id').references(
      () => assessmentDimensions.id
    ),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    createdBy: text('created_by').notNull(),
    approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
    approvedBy: text('approved_by'),
    retiredAt: integer('retired_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('assessment_scoring_versions_version_id_scoring_no_key').on(
      t.versionId,
      t.scoringNo
    ),
    /** At most one draft per assessment version, for the reason the sibling index on
     * `assessment_versions` exists: two authors silently forking one formula. */
    uniqueIndex('assessment_scoring_versions_one_draft_per_version')
      .on(t.versionId)
      .where(sql`${t.status} = 'draft'`),
    /**
     * At most one *approved* formula per assessment version. Scoring a session has to pick one
     * without asking, and "the approved one" is only an answer while there is exactly one.
     */
    uniqueIndex('assessment_scoring_versions_one_approved_per_version')
      .on(t.versionId)
      .where(sql`${t.status} = 'approved'`),
    check(
      'assessment_scoring_versions_status_check',
      sql`${t.status} IN (${sqlList(SCORING_VERSION_STATUSES)})`
    ),
    check('assessment_scoring_versions_scoring_no_check', sql`${t.scoringNo} > 0`),
    check('assessment_scoring_versions_bands_json_check', sql`json_valid(${t.bands})`),
    /** Mirrors `assessment_versions_published_at_check`: NFR-11 wants a score traceable to a
     * formula *and the moment it was approved*. */
    check(
      'assessment_scoring_versions_approved_at_check',
      sql`${t.status} = 'draft' OR (${t.approvedAt} IS NOT NULL AND ${t.approvedBy} IS NOT NULL)`
    ),
    /** Both axes or neither. A grid with one coordinate is not a grid. */
    check(
      'assessment_scoring_versions_axis_pairing_check',
      sql`(${t.taskAxisDimensionId} IS NULL) = (${t.peopleAxisDimensionId} IS NULL)`
    ),
  ]
)

/**
 * One weight per dimension per formula.
 *
 * A row exists for every dimension the formula scores, including styles and axes whose weight is
 * not consulted when aggregating — because `scores.scoring_rule_id` is mandatory in
 * `data-dictionary.md`, and a ledger row that cannot name the rule that produced it is a score
 * with no formula behind it.
 */
export const assessmentScoringRules = sqliteTable(
  'assessment_scoring_rules',
  {
    id: text('id').primaryKey(),
    scoringVersionId: text('scoring_version_id')
      .notNull()
      .references(() => assessmentScoringVersions.id),
    dimensionId: text('dimension_id')
      .notNull()
      .references(() => assessmentDimensions.id),
    /** Copied at approve time for the same reason `dimension_code_snapshot` is, one table over:
     * the ledger addresses dimensions by code, and the bank stays editable. */
    dimensionCode: text('dimension_code').notNull(),
    weight: real('weight').notNull(),
  },
  (t) => [
    uniqueIndex('assessment_scoring_rules_scoring_version_id_dimension_id_key').on(
      t.scoringVersionId,
      t.dimensionId
    ),
    check('assessment_scoring_rules_weight_check', sql`${t.weight} >= 0`),
  ]
)
