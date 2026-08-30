import { desc, eq } from 'drizzle-orm'

import { profileScoreRuns, profileScores, profileSnapshots } from '../../db/schema/profile.ts'
import type { ScoreRunReason } from '../../db/schema/profile.ts'
import { isUniqueViolation, type Db } from '../../db/client.ts'
import {
  SessionNotScorableError,
  getScoringConfig,
  markSessionScored,
  readScorableSession,
} from '../assessment/index.ts'
import { createAuditRepository } from '../platform/index.ts'
import { score, scoreReportSchema, type ScoreReport } from '../../services/scoring/index.ts'
import { profileAuditEvent } from './audit-events.ts'

/**
 * `server/domain/profile/` — the only writer to the `profile_*` tables.
 *
 * This module is the orchestration and nothing else. It reads a frozen response set and a frozen
 * formula through the `assessment` domain's public entrypoint (CLAUDE.md rule 12), hands both to
 * a pure function that has no database handle, and writes what comes back. Every number in this
 * file arrived from `server/services/scoring/`; none is computed here. That is what lets the
 * formula be reviewed by an Academic Lead who does not read Drizzle.
 *
 * Everything written here is append-only and the triggers in migration 0013 enforce it, so there
 * is no update path to get wrong: a correction is a new run.
 */

export interface ScoreSessionResult {
  scoreRunId: string
  snapshotId: string
  report: ScoreReport
  /** True when this call found the work already done rather than doing it. */
  alreadyScored: boolean
}

/**
 * SHA-256 over the exact payload bytes, the way `identity_consents.policy_hash` proves what text
 * a student agreed to. Version ids live inside the payload *and* in their own columns, so a
 * payload edited to disagree with them is detectable rather than merely forbidden.
 */
async function hashPayload(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Scores one submitted session.
 *
 * Idempotent by construction rather than by a key cache. The partial unique index on
 * `profile_score_runs` admits exactly one `initial` run per session, so two callers racing — a
 * retried submit and the result page asking for its own score, say — converge on one
 * authoritative score instead of two, and the loser reports what the winner wrote. A key cache
 * with an expiry could not promise that.
 *
 * That is also the whole recovery story for a session left `submitted` by a request that died
 * between submitting and scoring: calling this again converges, however it got there, so no
 * sweeper is needed to un-stick one.
 *
 * A rescore is deliberately not idempotent in the same way: it is an operator deciding that a
 * result must be recomputed, it always writes a new run, and `note` records why. `scoring-spec.md`
 * forbids the alternative outright — a rescore never overwrites, and the earlier run stays
 * readable so that SC-08 can be checked rather than trusted.
 *
 * **No endpoint reaches `reason: 'rescore'` yet**, and that is a decision rather than an omission:
 * who may trigger one, and under which rbac.md row, is not settled, and guessing would hand
 * somebody the power to change a result a student has already seen. Until it is settled, a rescore
 * is an operator action through this service. Deleting the path instead would take the incident
 * procedure in `observability.md` with it.
 */
export async function scoreSession(
  db: Db,
  {
    sessionId,
    userId,
    reason = 'initial',
    note,
    scoringVersionId,
    actorUserId,
  }: {
    sessionId: string
    /** Set by any caller acting on behalf of one student, which makes a session they do not own
     * indistinguishable from one that does not exist. Omitted only by operator paths. */
    userId?: string
    reason?: ScoreRunReason
    note?: string
    scoringVersionId?: string
    actorUserId?: string
  }
): Promise<ScoreSessionResult> {
  // Read first, without demanding `submitted`, because a session that has already been scored is
  // exactly the state a repeated call arrives in — refusing it before looking for the existing run
  // would turn the idempotent path into an error. The read still refuses `in_progress` outright
  // and still applies the ownership filter, so nothing is loosened by deferring the check.
  const session = await readScorableSession(db, { sessionId, userId, requireSubmitted: false })

  if (reason === 'initial') {
    const existing = await findExistingRun(db, sessionId)
    if (existing) {
      // Re-applied rather than assumed. `markSessionScored` runs after the write transaction, so a
      // request that died between the two leaves a session still `submitted` with a score run that
      // already exists — and returning early without this would make that state permanent, since
      // every later call takes this same branch. It is a no-op once the status has moved.
      await markSessionScored(db, sessionId)
      return existing
    }
    if (session.status !== 'submitted') {
      throw new SessionNotScorableError(sessionId, session.status)
    }
  }

  const config = await getScoringConfig(db, {
    versionId: session.versionId,
    scoringVersionId,
  })

  const run = score(session.version, config, session.responses)

  const scoreRunId = crypto.randomUUID()
  const snapshotId = crypto.randomUUID()
  const createdAt = new Date()
  const payload = JSON.stringify(run.report)
  const payloadHash = await hashPayload(payload)

  try {
    await db.transaction(async (tx) => {
      await tx.insert(profileScoreRuns).values({
        id: scoreRunId,
        userId: session.userId,
        sessionId: session.sessionId,
        assessmentVersionId: session.versionId,
        scoringVersionId: config.id,
        reason,
        note: note ?? null,
        createdAt,
      })

      await tx.insert(profileScores).values(
        run.ledger.map((entry) => ({
          id: crypto.randomUUID(),
          scoreRunId,
          scoreType: entry.scoreType,
          dimensionCode: entry.dimensionCode,
          scoringRuleId: entry.scoringRuleId,
          scoreValue: entry.scoreValue,
        }))
      )

      await tx.insert(profileSnapshots).values({
        id: snapshotId,
        scoreRunId,
        userId: session.userId,
        sessionId: session.sessionId,
        assessmentVersionId: session.versionId,
        scoringVersionId: config.id,
        payload,
        payloadHash,
        createdAt,
      })

      if (reason === 'rescore') {
        // Only a rescore is audited. An initial run already has a durable record of its own — the
        // score run row — and auditing it would write one row per student per assessment for no
        // investigative gain, the same reasoning #65 applied to autosave. A rescore is different
        // in kind: someone decided an existing result had to change, and `observability.md`'s
        // incident-scoring procedure requires that decision to leave a trail.
        await createAuditRepository(tx as unknown as Db).append({
          ...profileAuditEvent({
            event_type: 'profile.session_rescored',
            score_run_id: scoreRunId,
            session_id: session.sessionId,
            assessment_version_id: session.versionId,
            scoring_version_id: config.id,
          }),
          actorUserId: actorUserId ?? null,
          targetUserId: session.userId,
        })
      }
    })
  } catch (error) {
    // The index did its job: another caller wrote the initial run first. Converge on theirs.
    if (reason === 'initial' && isUniqueViolation(error)) {
      const existing = await findExistingRun(db, sessionId)
      if (existing) return existing
    }
    throw error
  }

  await markSessionScored(db, sessionId)

  return { scoreRunId, snapshotId, report: run.report, alreadyScored: false }
}

/** The newest run for a session, if it has one. Newest rather than first because a rescore is
 * what a caller asking "is this already scored?" should be told about. */
async function findExistingRun(db: Db, sessionId: string): Promise<ScoreSessionResult | null> {
  const rows = await db
    .select({
      scoreRunId: profileScoreRuns.id,
      snapshotId: profileSnapshots.id,
      payload: profileSnapshots.payload,
    })
    .from(profileScoreRuns)
    .innerJoin(profileSnapshots, eq(profileSnapshots.scoreRunId, profileScoreRuns.id))
    .where(eq(profileScoreRuns.sessionId, sessionId))
    .orderBy(desc(profileScoreRuns.createdAt))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  return {
    scoreRunId: row.scoreRunId,
    snapshotId: row.snapshotId,
    // The stored report, never a recomputed one. SC-08's whole point: what a student was shown
    // is served from the snapshot, so publishing a new formula cannot change it retroactively.
    // Parsed rather than cast, for the reason given on `toSummary` in read.ts.
    report: scoreReportSchema.parse(JSON.parse(row.payload)),
    alreadyScored: true,
  }
}
