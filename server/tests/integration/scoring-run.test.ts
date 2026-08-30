import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from '../setup/db'
import { seedSession } from '../fixtures/assessment-taking'
import { MIXED_EXPECTED, MIXED_VECTOR } from '../fixtures/scoring/golden-v1'
import { seedScorableInstrument, writeResponses } from '../fixtures/scoring/seed-instrument'
import type { SeededScoringInstrument } from '../fixtures/scoring/seed-instrument'
import {
  getCurrentProfile,
  listProfileHistory,
  listScoreRuns,
  readLedger,
  scoreSession,
} from '../../domain/profile/index.ts'
import {
  NoApprovedScoringVersionError,
  NotFoundError,
  SessionNotScorableError,
  createScoringVersion,
  approveScoringVersion,
  readScorableSession,
} from '../../domain/assessment/index.ts'

/**
 * The half of the acceptance suite the pure engine cannot answer: SC-07 against the real unique
 * index, SC-08 against a stored snapshot, and the ledger's append-only triggers against SQLite
 * itself rather than against a repository interface that merely lacks an update method.
 *
 * The expected numbers are the same hand-computed ones the unit suite asserts, which is the whole
 * value of running them again here — if reading a frozen response set and a frozen formula out of
 * five tables reproduces `MIXED_EXPECTED`, the join between storage and arithmetic is right.
 */

let t: TestDb
let seeded: SeededScoringInstrument

beforeEach(async () => {
  t = await freshDb()
  seeded = await seedScorableInstrument(t)
})

afterEach(async () => {
  await t.drop()
})

/**
 * Answers are written while the session is still `in_progress`, then the status is flipped.
 * Migration 0007 freezes `assessment_responses` the moment a session is submitted — INSERT
 * included — so seeding a submitted session and then filling it is refused by the database, which
 * is exactly the guarantee that migration exists for.
 */
async function submittedSession(vector = MIXED_VECTOR, userId?: string) {
  const session = await seedSession(t, {
    versionId: seeded.versionId,
    status: 'in_progress',
    ...(userId ? { userId } : {}),
  })
  await writeResponses(t, session.sessionId, seeded, vector)
  await t.client.execute({
    sql: 'UPDATE assessment_sessions SET status = ?, submitted_at = ? WHERE id = ?',
    args: ['submitted', Date.now(), session.sessionId],
  })
  return session
}

/** Asserts the database itself refused a statement, rather than a service guard doing it. */
async function refused(statement: Promise<unknown>) {
  await expect(statement).rejects.toThrow(/SQLITE_CONSTRAINT/)
}

describe('scoring a submitted session', () => {
  it('reproduces the hand-computed golden report end to end', async () => {
    const session = await submittedSession()

    const run = await scoreSession(t.db, { sessionId: session.sessionId })

    expect(run.report.overall).toEqual(MIXED_EXPECTED.overall)
    expect(run.report.domains).toEqual(MIXED_EXPECTED.domains)
    expect(run.report.styles).toEqual(MIXED_EXPECTED.styles)
    expect(run.report.dominant).toEqual(MIXED_EXPECTED.dominant)
    expect(run.report.grid).toEqual(MIXED_EXPECTED.grid)
  })

  it('moves the session from submitted to scored', async () => {
    const session = await submittedSession()
    await scoreSession(t.db, { sessionId: session.sessionId })

    const rows = await t.client.execute({
      sql: 'SELECT status FROM assessment_sessions WHERE id = ?',
      args: [session.sessionId],
    })
    expect(rows.rows[0]!.status).toBe('scored')
  })

  it('writes the ledger unrounded while the snapshot holds the rounded report', async () => {
    const session = await submittedSession()
    const run = await scoreSession(t.db, { sessionId: session.sessionId })

    const ledger = await readLedger(t.db, run.scoreRunId)
    const readiness = ledger.find((entry) => entry.scoreType === 'readiness')!
    expect(readiness.scoreValue).toBeCloseTo(52.7777777, 6)
    expect(run.report.overall.score).toBe(53)
  })

  it('round-trips a full-precision double through storage without losing a bit', async () => {
    // The one fact ADR-010 §11 says could undermine the `REAL` choice, asserted rather than
    // assumed. SQLite REAL and a JavaScript number are the same 8-byte IEEE-754 double, so this
    // has to be exact equality — a tolerance here would be testing nothing.
    const session = await submittedSession()
    const run = await scoreSession(t.db, { sessionId: session.sessionId })

    const stored = await readLedger(t.db, run.scoreRunId)
    const readiness = stored.find((entry) => entry.scoreType === 'readiness')!
    // (2·50 + 1·(700/12)) / 3, computed the same way the engine computes it.
    const expected = (2 * 50 + (7 / 12) * 100) / 3
    expect(readiness.scoreValue).toBe(expected)
    expect(Object.is(readiness.scoreValue, expected)).toBe(true)
  })

  it('records every column NFR-11 asks a score to be traceable by', async () => {
    const session = await submittedSession()
    const run = await scoreSession(t.db, { sessionId: session.sessionId })

    const [stored] = await listScoreRuns(t.db, session.sessionId)
    expect(stored).toMatchObject({
      id: run.scoreRunId,
      sessionId: session.sessionId,
      assessmentVersionId: seeded.versionId,
      scoringVersionId: seeded.scoringVersionId,
      reason: 'initial',
    })
    expect(stored!.createdAt).toBeInstanceOf(Date)
  })

  it('refuses a session that has not been submitted', async () => {
    const session = await seedSession(t, { versionId: seeded.versionId, status: 'in_progress' })
    await expect(scoreSession(t.db, { sessionId: session.sessionId })).rejects.toBeInstanceOf(
      SessionNotScorableError
    )
  })

  it('reports a session belonging to someone else as absent', async () => {
    const session = await submittedSession(MIXED_VECTOR, 'student-a')

    // Not a 403-shaped refusal: an id the caller cannot see must be indistinguishable from one
    // that does not exist, which is what makes session ids unenumerable.
    await expect(
      scoreSession(t.db, { sessionId: session.sessionId, userId: 'student-b' })
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('SC-07 · repeated submit', () => {
  it('produces one authoritative score however many times it is asked', async () => {
    const session = await submittedSession()

    const first = await scoreSession(t.db, { sessionId: session.sessionId })
    const second = await scoreSession(t.db, { sessionId: session.sessionId })
    const third = await scoreSession(t.db, { sessionId: session.sessionId })

    expect(first.alreadyScored).toBe(false)
    expect(second.alreadyScored).toBe(true)
    expect(third.alreadyScored).toBe(true)
    expect(second.scoreRunId).toBe(first.scoreRunId)
    expect(third.report).toEqual(first.report)

    const runs = await listScoreRuns(t.db, session.sessionId)
    expect(runs).toHaveLength(1)
  })

  it('finishes a run that was interrupted before the session status moved', async () => {
    const session = await submittedSession()
    await scoreSession(t.db, { sessionId: session.sessionId })

    // The state a request that died between the write and the status flip would leave behind.
    await t.client.execute({
      sql: 'UPDATE assessment_sessions SET status = ? WHERE id = ?',
      args: ['submitted', session.sessionId],
    })

    const again = await scoreSession(t.db, { sessionId: session.sessionId })
    expect(again.alreadyScored).toBe(true)

    const rows = await t.client.execute({
      sql: 'SELECT status FROM assessment_sessions WHERE id = ?',
      args: [session.sessionId],
    })
    expect(rows.rows[0]!.status).toBe('scored')
    expect(await listScoreRuns(t.db, session.sessionId)).toHaveLength(1)
  })

  it('holds that guarantee in the database, not only in the service', async () => {
    const session = await submittedSession()
    await scoreSession(t.db, { sessionId: session.sessionId })

    // The partial unique index, hit directly. The service's own pre-check is skipped here on
    // purpose: it is the index that survives two isolates racing.
    await refused(
      t.client.execute({
        sql: `INSERT INTO profile_score_runs
              (id, user_id, session_id, assessment_version_id, scoring_version_id, reason, created_at)
              VALUES (?, ?, ?, ?, ?, 'initial', ?)`,
        args: [
          crypto.randomUUID(),
          session.userId,
          session.sessionId,
          seeded.versionId,
          seeded.scoringVersionId,
          Date.now(),
        ],
      })
    )
  })
})

describe('SC-08 · a new scoring version', () => {
  it('leaves the stored report of the earlier run byte-for-byte unchanged', async () => {
    const session = await submittedSession()
    const first = await scoreSession(t.db, { sessionId: session.sessionId })

    const before = await t.client.execute({
      sql: 'SELECT payload, payload_hash FROM profile_snapshots WHERE score_run_id = ?',
      args: [first.scoreRunId],
    })

    // A second formula over the same version: weights swapped, thresholds raised. Retire the
    // first, because only one approved formula per version is allowed to exist.
    await t.client.execute({
      sql: 'UPDATE assessment_scoring_versions SET status = ?, retired_at = ? WHERE id = ?',
      args: ['retired', Date.now(), seeded.scoringVersionId],
    })
    const second = await createScoringVersion(t.db, {
      versionId: seeded.versionId,
      bands: [
        { code: 'emerging', min: 0 },
        { code: 'developing', min: 50 },
        { code: 'established', min: 70 },
        { code: 'advanced', min: 90 },
      ],
      weights: [
        { dimensionId: seeded.dimensionIdByCode.d_alpha!, weight: 1 },
        { dimensionId: seeded.dimensionIdByCode.d_beta!, weight: 2 },
        { dimensionId: seeded.dimensionIdByCode.s_one!, weight: 1 },
        { dimensionId: seeded.dimensionIdByCode.s_two!, weight: 1 },
        { dimensionId: seeded.dimensionIdByCode.ax_task!, weight: 1 },
        { dimensionId: seeded.dimensionIdByCode.ax_people!, weight: 1 },
      ],
      taskAxisDimensionId: seeded.dimensionIdByCode.ax_task!,
      peopleAxisDimensionId: seeded.dimensionIdByCode.ax_people!,
      actorUserId: 'lab-admin',
    })
    await approveScoringVersion(t.db, {
      scoringVersionId: second.id,
      actorUserId: 'academic-lead',
    })

    const rescored = await scoreSession(t.db, {
      sessionId: session.sessionId,
      reason: 'rescore',
      note: 'SC-08',
      actorUserId: 'academic-lead',
    })

    expect(rescored.report.overall.score).toBe(56)
    expect(rescored.report.overall.score).not.toBe(first.report.overall.score)

    const after = await t.client.execute({
      sql: 'SELECT payload, payload_hash FROM profile_snapshots WHERE score_run_id = ?',
      args: [first.scoreRunId],
    })
    expect(after.rows[0]).toEqual(before.rows[0])

    // Both runs remain readable: a rescore adds, it never replaces.
    expect(await listScoreRuns(t.db, session.sessionId)).toHaveLength(2)
    expect(await listProfileHistory(t.db, session.userId)).toHaveLength(2)
  })

  it('audits the rescore and only the rescore', async () => {
    const session = await submittedSession()
    await scoreSession(t.db, { sessionId: session.sessionId })
    await scoreSession(t.db, {
      sessionId: session.sessionId,
      reason: 'rescore',
      note: 'a correction',
      actorUserId: 'academic-lead',
    })

    const events = await t.client.execute(
      "SELECT event_type, detail FROM audit_logs WHERE event_type LIKE 'profile.%'"
    )
    expect(events.rows).toHaveLength(1)
    expect(events.rows[0]!.event_type).toBe('profile.session_rescored')
    // The PII Rule: ids only. No band, no score, no dimension.
    const detail = JSON.parse(String(events.rows[0]!.detail))
    expect(Object.keys(detail).sort()).toEqual([
      'assessment_version_id',
      'event_type',
      'score_run_id',
      'scoring_version_id',
      'session_id',
    ])
  })

  it('refuses a rescore with no reason recorded', async () => {
    const session = await submittedSession()
    await scoreSession(t.db, { sessionId: session.sessionId })

    await refused(
      t.client.execute({
        sql: `INSERT INTO profile_score_runs
              (id, user_id, session_id, assessment_version_id, scoring_version_id, reason, created_at)
              VALUES (?, ?, ?, ?, ?, 'rescore', ?)`,
        args: [
          crypto.randomUUID(),
          session.userId,
          session.sessionId,
          seeded.versionId,
          seeded.scoringVersionId,
          Date.now(),
        ],
      })
    )
  })
})

describe('the ledger is append-only in the database', () => {
  it('refuses an UPDATE or a DELETE on every one of the three tables', async () => {
    const session = await submittedSession()
    const run = await scoreSession(t.db, { sessionId: session.sessionId })

    await refused(
      t.client.execute({
        sql: 'UPDATE profile_scores SET score_value = 100 WHERE score_run_id = ?',
        args: [run.scoreRunId],
      })
    )
    await refused(
      t.client.execute({
        sql: 'DELETE FROM profile_scores WHERE score_run_id = ?',
        args: [run.scoreRunId],
      })
    )
    await refused(
      t.client.execute({
        sql: 'UPDATE profile_snapshots SET payload = ? WHERE score_run_id = ?',
        args: ['{}', run.scoreRunId],
      })
    )
    await refused(
      t.client.execute({
        sql: 'DELETE FROM profile_snapshots WHERE score_run_id = ?',
        args: [run.scoreRunId],
      })
    )
    await refused(
      t.client.execute({
        sql: 'UPDATE profile_score_runs SET reason = ? WHERE id = ?',
        args: ['rescore', run.scoreRunId],
      })
    )
    await refused(
      t.client.execute({
        sql: 'DELETE FROM profile_score_runs WHERE id = ?',
        args: [run.scoreRunId],
      })
    )
  })
})

describe('an unconfigured instrument', () => {
  it('is refused with an error an operator can act on, not a not-found', async () => {
    const unconfigured = await seedScorableInstrument(t, { approve: false, versionNo: 2 })
    const session = await seedSession(t, {
      versionId: unconfigured.versionId,
      status: 'in_progress',
    })
    await writeResponses(t, session.sessionId, unconfigured, MIXED_VECTOR)
    await t.client.execute({
      sql: 'UPDATE assessment_sessions SET status = ?, submitted_at = ? WHERE id = ?',
      args: ['submitted', Date.now(), session.sessionId],
    })

    await expect(scoreSession(t.db, { sessionId: session.sessionId })).rejects.toBeInstanceOf(
      NoApprovedScoringVersionError
    )

    // And the session stays scorable, so approving a formula later is all it takes.
    const still = await readScorableSession(t.db, { sessionId: session.sessionId })
    expect(still.status).toBe('submitted')
  })
})

describe('the current profile', () => {
  it('is the newest snapshot, served rather than recomputed', async () => {
    const session = await submittedSession()
    const run = await scoreSession(t.db, { sessionId: session.sessionId })

    const current = await getCurrentProfile(t.db, session.userId)
    expect(current?.scoreRunId).toBe(run.scoreRunId)
    expect(current?.report).toEqual(run.report)
  })

  it('is null for a student who has never been scored', async () => {
    expect(await getCurrentProfile(t.db, 'never-assessed')).toBeNull()
  })
})
