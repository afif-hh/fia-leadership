import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import {
  assessmentInstruments,
  assessmentResponses,
  assessmentSessions,
  assessmentVersionItems,
  assessmentVersions,
} from '../../db/schema/assessment.ts'
import type { SessionStatus } from '../../db/schema/assessment.ts'
import { createAuditRepository } from '../platform/index.ts'
import { assessmentAuditEvent } from './audit-events.ts'
import { NotFoundError, scalePointsSchema, type ScalePoints } from './repository.ts'
import { assertSessionTransitionAllowed, isOpenForAnswers } from './taking-state-machine.ts'
import type { Db } from '../../db/client.ts'

/**
 * Taking an assessment: start, resume, save, submit.
 *
 * Two rules run through everything here and are easy to get wrong in opposite directions:
 *
 * 1. **Version status gates `start` and nothing else** (#58). Retiring a version means "stop
 *    handing this out", not "cancel what is in flight" — a student 35 items into a 40-item
 *    questionnaire must not lose that work to an administrative decision unrelated to them.
 *    So `save` and `submit` never look at version status at all.
 * 2. **Row ownership is this layer's job, not the policy layer's** (#65). The student's cell in
 *    the `ownAssessment` row is `CRUD`, which `interpret()` resolves to an unconditional `allow`
 *    — it never reaches `resolveScope`. Every lookup here therefore filters on `user_id` itself,
 *    and a mismatch is reported as `NotFoundError`, so an id the caller cannot see is
 *    indistinguishable from one that does not exist.
 */

/** `start` refused: the version is not `published`, so it is not being handed out. */
export class VersionNotTakeableError extends Error {
  readonly versionId: string
  readonly status: string

  constructor(versionId: string, status: string) {
    super(`Assessment version '${versionId}' is '${status}' and cannot be started.`)
    this.name = 'VersionNotTakeableError'
    this.versionId = versionId
    this.status = status
  }
}

/** A write arrived for a session that is no longer open. The freeze triggers agree in SQLite. */
export class SessionAlreadySubmittedError extends Error {
  readonly sessionId: string

  constructor(sessionId: string) {
    super(`Assessment session '${sessionId}' has already been submitted.`)
    this.name = 'SessionAlreadySubmittedError'
    this.sessionId = sessionId
  }
}

/**
 * The answer is not one of the anchors this item was published with.
 *
 * **The message must never contain the value.** #58 flagged this as the single most likely PII
 * leak in the whole flow, because the reflexive phrasing is `Invalid answer value: 9` and that
 * string goes straight into a log the moment anything catches and reports it. The item id is
 * enough for anyone debugging; the answer is what the PII Rule protects.
 */
export class InvalidAnswerError extends Error {
  readonly versionItemId: string

  constructor(versionItemId: string) {
    super(`The submitted answer is not one of the anchors for item '${versionItemId}'.`)
    this.name = 'InvalidAnswerError'
    this.versionItemId = versionItemId
  }
}

/** `submit` refused: SC-06. Names the unanswered items so the caller can build `fields`. */
export class IncompleteResponseSetError extends Error {
  readonly missingVersionItemIds: string[]

  constructor(missingVersionItemIds: string[]) {
    super(`${missingVersionItemIds.length} item(s) are unanswered.`)
    this.name = 'IncompleteResponseSetError'
    this.missingVersionItemIds = missingVersionItemIds
  }
}

export interface TakingItem {
  versionItemId: string
  position: number
  stem: string
  scalePoints: ScalePoints
}

export interface TakingSession {
  id: string
  versionId: string
  status: SessionStatus
  startedAt: Date
  submittedAt: Date | null
  consentPolicyVersion: string
}

export interface TakingSessionDetail {
  session: TakingSession
  /** In `position` order — a version has no other ordering, there is no sections table. */
  items: TakingItem[]
  /** Only the items actually answered so far; absent keys are unanswered. */
  answers: Record<string, number>
}

/**
 * The whole item set for a version, rendered from the publish snapshot rather than the live bank.
 * That is what makes the taking UI immune to bank edits, and it is why the FK on a response
 * points at the snapshot row.
 */
async function readItems(db: Db, versionId: string): Promise<TakingItem[]> {
  const rows = await db
    .select({
      versionItemId: assessmentVersionItems.id,
      position: assessmentVersionItems.position,
      stemSnapshot: assessmentVersionItems.stemSnapshot,
      scalePointsSnapshot: assessmentVersionItems.scalePointsSnapshot,
    })
    .from(assessmentVersionItems)
    .where(eq(assessmentVersionItems.versionId, versionId))
    .orderBy(asc(assessmentVersionItems.position))

  return rows.map((row) => {
    // A published version cannot have a null snapshot — the publish gate in migration 0004
    // refuses the transition otherwise. Reaching this means that trigger was dropped, so it is
    // an integrity failure rather than a case to render around.
    if (row.stemSnapshot === null || row.scalePointsSnapshot === null) {
      throw new Error(`Version item '${row.versionItemId}' is published without a snapshot.`)
    }
    return {
      versionItemId: row.versionItemId,
      position: row.position,
      stem: row.stemSnapshot,
      scalePoints: scalePointsSchema.parse(JSON.parse(row.scalePointsSnapshot)),
    }
  })
}

/** Loads a session the caller owns, or reports it as absent. See rule 2 in the module note. */
async function requireOwnedSession(
  db: Db,
  sessionId: string,
  userId: string
): Promise<TakingSession> {
  const rows = await db
    .select()
    .from(assessmentSessions)
    .where(and(eq(assessmentSessions.id, sessionId), eq(assessmentSessions.userId, userId)))
    .limit(1)

  const row = rows[0]
  if (!row) throw new NotFoundError('Assessment session', sessionId)

  return {
    id: row.id,
    versionId: row.versionId,
    status: row.status,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
    consentPolicyVersion: row.consentPolicyVersion,
  }
}

/**
 * Starts a session, or returns the one already in flight.
 *
 * Resuming is the same call as starting, deliberately: the unique index on (user, version) makes
 * a second session impossible anyway, so the alternative is an error the client would have to
 * recover from by fetching the session it was just told it could not create.
 *
 * `consentPolicyVersion` is supplied by the caller, which has already been through
 * `resolveConsentForStart` in the `identity` domain — this module never reads `identity_consents`
 * itself (CLAUDE.md rule 12).
 */
export async function startSession(
  db: Db,
  {
    userId,
    versionId,
    consentPolicyVersion,
  }: { userId: string; versionId: string; consentPolicyVersion: string }
): Promise<TakingSessionDetail> {
  const existing = await db
    .select({ id: assessmentSessions.id, status: assessmentSessions.status })
    .from(assessmentSessions)
    .where(and(eq(assessmentSessions.userId, userId), eq(assessmentSessions.versionId, versionId)))
    .limit(1)

  if (existing[0]) {
    if (existing[0].status !== 'in_progress') {
      throw new SessionAlreadySubmittedError(existing[0].id)
    }
    return getSession(db, { sessionId: existing[0].id, userId })
  }

  const versions = await db
    .select({ status: assessmentVersions.status })
    .from(assessmentVersions)
    .where(eq(assessmentVersions.id, versionId))
    .limit(1)

  const version = versions[0]
  if (!version) throw new NotFoundError('Assessment version', versionId)
  // The one place version status is consulted. See rule 1 in the module note.
  if (version.status !== 'published') {
    throw new VersionNotTakeableError(versionId, version.status)
  }

  const sessionId = crypto.randomUUID()
  await db.insert(assessmentSessions).values({
    id: sessionId,
    userId,
    versionId,
    status: 'in_progress',
    consentPolicyVersion,
    startedAt: new Date(),
    submittedAt: null,
  })

  return getSession(db, { sessionId, userId })
}

/** Everything the answering screen renders from: the session, its items, and answers so far. */
export async function getSession(
  db: Db,
  { sessionId, userId }: { sessionId: string; userId: string }
): Promise<TakingSessionDetail> {
  const session = await requireOwnedSession(db, sessionId, userId)
  const items = await readItems(db, session.versionId)

  const answerRows = await db
    .select({
      versionItemId: assessmentResponses.versionItemId,
      answerValue: assessmentResponses.answerValue,
    })
    .from(assessmentResponses)
    .where(eq(assessmentResponses.sessionId, sessionId))

  const answers: Record<string, number> = {}
  for (const row of answerRows) answers[row.versionItemId] = row.answerValue

  return { session, items, answers }
}

/**
 * Writes one answer. Upsert on the composite key, which is the whole of the idempotency story
 * (#64): a retried identical request rewrites the same row, so the endpoint needs no write token.
 */
export async function saveAnswer(
  db: Db,
  {
    sessionId,
    userId,
    versionItemId,
    answerValue,
  }: { sessionId: string; userId: string; versionItemId: string; answerValue: number }
): Promise<void> {
  const session = await requireOwnedSession(db, sessionId, userId)
  if (!isOpenForAnswers(session.status)) throw new SessionAlreadySubmittedError(sessionId)

  const items = await readItems(db, session.versionId)
  const item = items.find((i) => i.versionItemId === versionItemId)
  // An item id from another version is reported as absent rather than as a validation failure:
  // it identifies a row this session has no business naming.
  if (!item) throw new NotFoundError('Version item', versionItemId)

  // The constraint no CHECK can hold — the anchors live as JSON on another row (#58).
  if (!item.scalePoints.some((point) => point.value === answerValue)) {
    throw new InvalidAnswerError(versionItemId)
  }

  await db
    .insert(assessmentResponses)
    .values({ sessionId, versionItemId, answerValue })
    .onConflictDoUpdate({
      target: [assessmentResponses.sessionId, assessmentResponses.versionItemId],
      set: { answerValue },
    })
}

/**
 * Submits. Refuses an incomplete response set (SC-06) and names what is missing, so the HTTP
 * layer can build a `fields` array without re-deriving it.
 *
 * Audited — the one action in this flow that is (#65, and rbac.md's mandatory list). The detail
 * carries ids and a count only.
 */
export async function submitSession(
  db: Db,
  { sessionId, userId }: { sessionId: string; userId: string }
): Promise<TakingSession> {
  const session = await requireOwnedSession(db, sessionId, userId)
  if (session.status !== 'in_progress') throw new SessionAlreadySubmittedError(sessionId)
  assertSessionTransitionAllowed(session.status, 'submitted')

  const items = await readItems(db, session.versionId)
  const answered = new Set(
    (
      await db
        .select({ versionItemId: assessmentResponses.versionItemId })
        .from(assessmentResponses)
        .where(eq(assessmentResponses.sessionId, sessionId))
    ).map((row) => row.versionItemId)
  )

  const missing = items
    .filter((item) => !answered.has(item.versionItemId))
    .map((item) => item.versionItemId)
  if (missing.length > 0) throw new IncompleteResponseSetError(missing)

  const submittedAt = new Date()
  await db
    .update(assessmentSessions)
    .set({ status: 'submitted', submittedAt })
    .where(eq(assessmentSessions.id, sessionId))

  await createAuditRepository(db).append({
    ...assessmentAuditEvent({
      event_type: 'assessment.session_submitted',
      session_id: sessionId,
      version_id: session.versionId,
      item_count: items.length,
    }),
    actorUserId: userId,
  })

  return { ...session, status: 'submitted', submittedAt }
}

export interface TakeableVersion {
  versionId: string
  instrumentName: string
  description: string | null
  versionNo: number
  itemCount: number
  /** `available` · `in_progress` · `submitted` — what the list row offers the student (#61). */
  state: 'available' | 'in_progress' | 'submitted'
  /** True when the version is retired and only reachable to finish an existing session. */
  retired: boolean
}

/**
 * The student's assessment list (#61): one row per *version*, because completion and eligibility
 * are version-specific.
 *
 * Retired versions are excluded unless this student already has a session on one — retirement
 * means "stop handing this out", not "cancel what is in flight", so a half-finished session must
 * stay reachable (#58). A submitted session keeps its row as a static "Selesai" with no restart
 * action (#62); `scored` is treated the same way, since neither offers the student an action here.
 *
 * Deliberately returns no consent state: consent is recorded per policy document, not per
 * assessment, so every row would carry the same value (#59/#61).
 */
export async function listTakeableVersions(db: Db, userId: string): Promise<TakeableVersion[]> {
  const rows = await db
    .select({
      versionId: assessmentVersions.id,
      versionNo: assessmentVersions.versionNo,
      status: assessmentVersions.status,
      instrumentName: assessmentInstruments.name,
      description: assessmentInstruments.description,
      sessionStatus: assessmentSessions.status,
      itemCount: sql<number>`(
        SELECT COUNT(*) FROM ${assessmentVersionItems}
        WHERE ${assessmentVersionItems.versionId} = ${assessmentVersions.id}
      )`,
    })
    .from(assessmentVersions)
    .innerJoin(assessmentInstruments, eq(assessmentInstruments.id, assessmentVersions.instrumentId))
    // Left join keyed on this student, so another student's session can never widen the list.
    .leftJoin(
      assessmentSessions,
      and(
        eq(assessmentSessions.versionId, assessmentVersions.id),
        eq(assessmentSessions.userId, userId)
      )
    )
    .where(inArray(assessmentVersions.status, ['published', 'retired']))
    .orderBy(asc(assessmentInstruments.name), asc(assessmentVersions.versionNo))

  return rows
    .filter((row) => row.status === 'published' || row.sessionStatus !== null)
    .map((row) => ({
      versionId: row.versionId,
      instrumentName: row.instrumentName,
      description: row.description,
      versionNo: row.versionNo,
      itemCount: row.itemCount,
      state:
        row.sessionStatus === null
          ? 'available'
          : row.sessionStatus === 'in_progress'
            ? 'in_progress'
            : 'submitted',
      retired: row.status === 'retired',
    }))
}
