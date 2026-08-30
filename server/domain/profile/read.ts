import { desc, eq } from 'drizzle-orm'

import { profileScoreRuns, profileScores, profileSnapshots } from '../../db/schema/profile.ts'
import type { Db } from '../../db/client.ts'
import { getInstrument, getVersion, hasSessionAwaitingScore } from '../assessment/index.ts'
import { DEFAULT_LOCALE, type Locale } from '../../db/schema/locale.ts'
import { scoreReportSchema, type ScoreReport } from '../../services/scoring/index.ts'

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
 *
 * Parsed through `scoreReportSchema`, not cast. SQLite holds only `json_valid` on this column, so
 * ADR-005 puts the real check here; a cast would assert the shape of the one payload a student
 * actually reads rather than verify it.
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
  return { ...row, report: scoreReportSchema.parse(JSON.parse(payload)) }
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

export interface ProfileView {
  profile: ProfileSnapshotSummary | null
  /** What the snapshot was produced from, named for a reader. Null alongside a null profile. */
  assessment: { instrumentName: string; versionNo: number } | null
  /** True when a submitted session exists that no approved formula could score yet. */
  awaitingScore: boolean
}

/**
 * Everything the profile screen renders from, assembled here rather than in the route.
 *
 * `patterns.md` gives the HTTP layer validation, authorization and mapping, and gives orchestration
 * to the service layer. Three service calls and a branch is orchestration, so it belongs here.
 *
 * The cross-domain reads go through `assessment`'s public entrypoint, never into its tables
 * (CLAUDE.md rule 12). The instrument's name is fetched rather than stored in the snapshot on
 * purpose: the snapshot holds version ids and no display text, so translating an instrument later
 * cannot appear to change a frozen report.
 *
 * Two empty states are told apart. A student who has taken nothing and a student whose finished
 * assessment has no approved formula both have no profile, and showing the first message to the
 * second reads as their work having been lost.
 */
export async function readProfileView(
  db: Db,
  { userId, locale = DEFAULT_LOCALE }: { userId: string; locale?: Locale }
): Promise<ProfileView> {
  const profile = await getCurrentProfile(db, userId)
  if (!profile) {
    return {
      profile: null,
      assessment: null,
      awaitingScore: await hasSessionAwaitingScore(db, userId),
    }
  }

  const version = await getVersion(db, profile.assessmentVersionId)
  const instrument = await getInstrument(db, version.instrumentId, locale)

  return {
    profile,
    assessment: { instrumentName: instrument.name, versionNo: version.versionNo },
    awaitingScore: false,
  }
}

export interface LedgerEntryRow {
  scoreType: string
  dimensionCode: string | null
  scoreValue: number
}

/**
 * The full-precision ledger behind one run.
 *
 * Not what any report renders — the report reads the snapshot, and no screen reads this. It exists
 * so that the unrounded figures are reachable at all: `scoring-spec.md`'s incident procedure turns
 * on checking a stored score against the formula that produced it, and a ledger nothing can read
 * cannot be checked. Its only caller today is the test that asserts the ledger is written
 * unrounded, and that is the honest state of it.
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
