import { desc, eq } from 'drizzle-orm'

import { profileScoreRuns, profileScores, profileSnapshots } from '../../db/schema/profile.ts'
import type { Db } from '../../db/client.ts'
import type { ScoreReport } from '../../services/scoring/index.ts'

/**
 * Reading a leadership profile.
 *
 * The current profile is the newest snapshot, served verbatim. It is never recomputed, and that
 * is the whole of SC-08: publish a new formula tomorrow and what this returns for a run scored
 * today is byte-for-byte what the student saw today.
 *
 * There is no `leadership_profiles` table to keep in step, so `dominant_style` cannot drift from
 * the snapshot it was derived from — see the note at the top of `server/db/schema/profile.ts`.
 */

export interface ProfileSnapshotSummary {
  snapshotId: string
  scoreRunId: string
  sessionId: string
  assessmentVersionId: string
  scoringVersionId: string
  createdAt: Date
  report: ScoreReport
}

/**
 * `payload` is parsed and dropped rather than passed along. It is the same report twice — once as
 * a JSON string and once as an object — and shipping both doubles the response for no reader,
 * while inviting a client to trust whichever copy it happened to pick.
 */
function toSummary({
  payload,
  ...row
}: {
  snapshotId: string
  scoreRunId: string
  sessionId: string
  assessmentVersionId: string
  scoringVersionId: string
  createdAt: Date
  payload: string
}): ProfileSnapshotSummary {
  return { ...row, report: JSON.parse(payload) as ScoreReport }
}

const snapshotColumns = {
  snapshotId: profileSnapshots.id,
  scoreRunId: profileSnapshots.scoreRunId,
  sessionId: profileSnapshots.sessionId,
  assessmentVersionId: profileSnapshots.assessmentVersionId,
  scoringVersionId: profileSnapshots.scoringVersionId,
  createdAt: profileSnapshots.createdAt,
  payload: profileSnapshots.payload,
}

/** The student's current profile, or null when nothing has been scored for them yet. */
export async function getCurrentProfile(
  db: Db,
  userId: string
): Promise<ProfileSnapshotSummary | null> {
  const rows = await db
    .select(snapshotColumns)
    .from(profileSnapshots)
    .where(eq(profileSnapshots.userId, userId))
    .orderBy(desc(profileSnapshots.createdAt))
    .limit(1)

  const row = rows[0]
  return row ? toSummary(row) : null
}

/** Every profile this student has, newest first — the longitudinal view the PRD's re-assessment
 * loop rests on. A rescore appears here as its own entry rather than replacing the original. */
export async function listProfileHistory(
  db: Db,
  userId: string,
  limit = 50
): Promise<ProfileSnapshotSummary[]> {
  const rows = await db
    .select(snapshotColumns)
    .from(profileSnapshots)
    .where(eq(profileSnapshots.userId, userId))
    .orderBy(desc(profileSnapshots.createdAt))
    .limit(limit)

  return rows.map(toSummary)
}

export interface LedgerEntryRow {
  scoreType: string
  dimensionCode: string | null
  scoreValue: number
}

/**
 * The full-precision ledger behind one run.
 *
 * Not what any report renders — the report reads the snapshot. This exists for the two callers
 * that need the unrounded figures: a longitudinal trend, where sub-point movement is the signal,
 * and an incident investigation checking a score against the formula that produced it.
 */
export async function readLedger(db: Db, scoreRunId: string): Promise<LedgerEntryRow[]> {
  return db
    .select({
      scoreType: profileScores.scoreType,
      dimensionCode: profileScores.dimensionCode,
      scoreValue: profileScores.scoreValue,
    })
    .from(profileScores)
    .where(eq(profileScores.scoreRunId, scoreRunId))
}

/** Every run for a session, newest first. A rescore never removes what it supersedes. */
export async function listScoreRuns(db: Db, sessionId: string) {
  return db
    .select()
    .from(profileScoreRuns)
    .where(eq(profileScoreRuns.sessionId, sessionId))
    .orderBy(desc(profileScoreRuns.createdAt))
}
