import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * The `profile` domain: what the scoring engine produced, and the report frozen from it.
 *
 * Three tables, all append-only, guarded by `RAISE(ABORT)` triggers in the migration that ships
 * with this file — the same mechanism `audit_logs` uses, for the same reason. `scoring-spec.md`
 * calls the ledger append-only per `score_run` and forbids UPDATE on an authoritative score, and
 * a repository interface without an update method is a convention while a trigger is a guarantee.
 *
 * **There is no `leadership_profiles` table**, and its absence is deliberate.
 * `data-dictionary.md` lists `leadership_profiles.dominant_style` as derived and forbids editing
 * it by hand. A column carrying that rule needs the rule enforced somewhere; a *query* carrying
 * it cannot be edited at all. The current profile is therefore the newest `profile_snapshots` row
 * for a user, and the dominant style is a field inside its frozen payload. Making the illegal
 * state unrepresentable beats guarding it.
 *
 * Nothing here has a foreign key into `assessment` or `identity`. That matches
 * `assessment_sessions.user_id` and `created_by` everywhere else in this repo: the domain
 * boundary is the table-name prefix plus the *absence* of cross-domain references
 * (CLAUDE.md rule 12), and a foreign key across it would be exactly the coupling the rule
 * forbids.
 */

/** Why a run exists. `initial` is the one produced by submitting; anything later is a `rescore`,
 * which never overwrites and always leaves the earlier run readable (scoring-spec.md). */
export const SCORE_RUN_REASONS = ['initial', 'rescore'] as const
export type ScoreRunReason = (typeof SCORE_RUN_REASONS)[number]

/**
 * The score ledger's vocabulary, fixed by `data-dictionary.md` and not widened here.
 *
 * `raw` and `normalized` carry one row per scored dimension of any kind; `style` repeats the
 * normalized figure for the ten style dimensions under the name the report reads them by; and
 * `readiness` is the single overall potential score, the only row with no dimension.
 *
 * Blake-Mouton coordinates are absent on purpose. They are derived from the two axis dimensions'
 * normalized rows by a documented mapping, so storing them would be storing the same measurement
 * twice under two names, with nothing keeping the copies honest. They live in the snapshot
 * payload, which is the frozen report rather than the ledger.
 */
export const SCORE_TYPES = ['raw', 'normalized', 'style', 'readiness'] as const
export type ScoreType = (typeof SCORE_TYPES)[number]

const sqlList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '))

/**
 * One pass of the engine over one session's response set.
 *
 * Every column NFR-11 names is here and none is nullable: the assessment version, the scoring
 * version, the response set (by session), and the timestamp. Traceability is not a property this
 * table can be missing.
 */
export const profileScoreRuns = sqliteTable(
  'profile_score_runs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    sessionId: text('session_id').notNull(),
    assessmentVersionId: text('assessment_version_id').notNull(),
    scoringVersionId: text('scoring_version_id').notNull(),
    reason: text('reason', { enum: SCORE_RUN_REASONS }).notNull(),
    /** Free text, required on a rescore. `scoring-spec.md`: a rescore always records why. */
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    /**
     * SC-07, held by the engine rather than by an idempotency key.
     *
     * A second submit is already refused by the session's own status, but that guarantee lives in
     * one service function. This one survives a sweeper running twice, a retried request, and two
     * Workers isolates racing on the same session — none of which a key cache with an expiry
     * would.
     */
    uniqueIndex('profile_score_runs_session_id_initial_key')
      .on(t.sessionId)
      .where(sql`${t.reason} = 'initial'`),
    index('profile_score_runs_user_id_created_at_idx').on(t.userId, t.createdAt),
    check('profile_score_runs_reason_check', sql`${t.reason} IN (${sqlList(SCORE_RUN_REASONS)})`),
    /** A rescore with no reason is an unexplained change to someone's result. */
    check(
      'profile_score_runs_rescore_note_check',
      sql`${t.reason} <> 'rescore' OR (${t.note} IS NOT NULL AND length(${t.note}) > 0)`
    ),
  ]
)

/**
 * The ledger itself. Full-precision doubles, written unrounded (#26).
 *
 * SQLite `REAL` is an 8-byte IEEE-754 double, which is exactly what a JavaScript number is, so
 * the round trip is lossless and "input sama → output identik" survives storage. Rounding happens
 * once, when the report is built — never here.
 */
export const profileScores = sqliteTable(
  'profile_scores',
  {
    id: text('id').primaryKey(),
    scoreRunId: text('score_run_id')
      .notNull()
      .references(() => profileScoreRuns.id),
    scoreType: text('score_type', { enum: SCORE_TYPES }).notNull(),
    /** NULL exactly when `score_type` is `readiness`; the CHECK below holds both directions. */
    dimensionCode: text('dimension_code'),
    /** `data-dictionary.md` makes this mandatory: a score that cannot name its rule has no
     * formula behind it. NULL only for `readiness`, which aggregates every rule rather than
     * applying one. */
    scoringRuleId: text('scoring_rule_id'),
    scoreValue: real('score_value').notNull(),
  },
  (t) => [
    uniqueIndex('profile_scores_run_type_dimension_key').on(
      t.scoreRunId,
      t.scoreType,
      t.dimensionCode
    ),
    /**
     * The index above cannot hold the readiness row, because SQLite treats NULLs in a unique
     * index as distinct — two readiness rows would both be accepted by it. This one closes that.
     */
    uniqueIndex('profile_scores_run_readiness_key')
      .on(t.scoreRunId)
      .where(sql`${t.scoreType} = 'readiness'`),
    check('profile_scores_score_type_check', sql`${t.scoreType} IN (${sqlList(SCORE_TYPES)})`),
    check(
      'profile_scores_dimension_pairing_check',
      sql`(${t.scoreType} = 'readiness') = (${t.dimensionCode} IS NULL)`
    ),
    check(
      'profile_scores_scoring_rule_check',
      sql`${t.scoreType} = 'readiness' OR ${t.scoringRuleId} IS NOT NULL`
    ),
  ]
)

/**
 * The frozen report: one row per score run, holding what the student was shown.
 *
 * `payload` is the rounded, presentational form — integers, band, coordinates, dominant style —
 * because SC-08 asks that a historical report not change when a new formula is published, and a
 * report recomputed from the ledger by today's code is not a historical report. The ledger keeps
 * the full precision a trend chart needs; this keeps the sentence a student read.
 *
 * `payload_hash` is the "signed with version metadata" `data-dictionary.md` asks for, built the
 * way `identity_consents.policy_hash` is: a SHA-256 over the exact bytes. The version ids are
 * inside the payload *and* in their own columns, so a payload edited to disagree with them is
 * detectable rather than merely forbidden.
 */
export const profileSnapshots = sqliteTable(
  'profile_snapshots',
  {
    id: text('id').primaryKey(),
    scoreRunId: text('score_run_id')
      .notNull()
      .references(() => profileScoreRuns.id),
    userId: text('user_id').notNull(),
    sessionId: text('session_id').notNull(),
    assessmentVersionId: text('assessment_version_id').notNull(),
    scoringVersionId: text('scoring_version_id').notNull(),
    payload: text('payload').notNull(),
    payloadHash: text('payload_hash').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    uniqueIndex('profile_snapshots_score_run_id_key').on(t.scoreRunId),
    index('profile_snapshots_user_id_created_at_idx').on(t.userId, t.createdAt),
    check('profile_snapshots_payload_json_check', sql`json_valid(${t.payload})`),
  ]
)
