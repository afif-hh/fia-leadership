import { and, asc, eq, inArray, max } from 'drizzle-orm'
import * as z from 'zod/mini'

import {
  assessmentDimensions,
  assessmentResponses,
  assessmentScoringRules,
  assessmentScoringVersions,
  assessmentSessions,
  assessmentVersionItemDimensions,
  assessmentVersionItems,
  assessmentVersions,
} from '../../db/schema/assessment.ts'
import type { ScoringVersionStatus, SessionStatus } from '../../db/schema/assessment.ts'
import type { Db } from '../../db/client.ts'
import { createAuditRepository } from '../platform/index.ts'
import { assessmentAuditEvent } from './audit-events.ts'
import { NotFoundError } from './errors.ts'
import { scalePointsSchema } from './repository.ts'
import type {
  AssessmentVersionForScoring,
  ResponseSet,
  ScoringVersionForScoring,
} from '../../services/scoring/index.ts'

/**
 * Everything the scoring engine needs from the `assessment` domain, and the authoring of the
 * formula itself.
 *
 * Two responsibilities in one file on purpose. They are the same seam viewed from either side:
 * the formula is configured against a published version's dimensions, and the response set is
 * read through that same version's snapshot. Splitting them would put half of one boundary in
 * each of two files and leave a reader of either unable to see the contract.
 *
 * The `profile` domain is the only caller. It reaches these through `index.ts`, never into this
 * file — CLAUDE.md rule 12, enforced by the `no-restricted-imports` boundary in eslint.config.mjs.
 *
 * Nothing here computes a score. The arithmetic lives in `server/services/scoring/`, which has no
 * database handle at all, and that separation is what makes a golden vector meaningful.
 */

/* ---------------------------------------------------------------------------- band config --- */

/**
 * The readiness threshold table, validated at the boundary because SQLite holds only
 * `json_valid` (ADR-005). `z.strictObject` rather than a plain object: a plain one *strips*
 * unknown keys, so a band table carrying a stray field would be silently accepted in a shortened
 * form rather than rejected, and this row is frozen the moment it is approved.
 */
export const bandsSchema = z.array(
  z.strictObject({
    code: z.string().check(z.minLength(1)),
    min: z.number(),
  })
)

export type Bands = z.infer<typeof bandsSchema>

/* -------------------------------------------------------------------------------- errors --- */

export class ScoringVersionFrozenError extends Error {
  readonly scoringVersionId: string
  readonly status: ScoringVersionStatus

  constructor(scoringVersionId: string, status: ScoringVersionStatus) {
    super(
      `Scoring version '${scoringVersionId}' is ${status} and cannot be changed. ` +
        'Draft a new one instead.'
    )
    this.name = 'ScoringVersionFrozenError'
    this.scoringVersionId = scoringVersionId
    this.status = status
  }
}

/**
 * A submitted session cannot be scored because its version has no approved formula.
 *
 * Its own error rather than a `NotFoundError`, because the two ask for opposite responses: a
 * missing session is the caller's mistake, while this is an operational gap that an Academic Lead
 * closes by approving a formula, and the sweeper must be able to tell them apart to know whether
 * retrying will ever help.
 */
export class NoApprovedScoringVersionError extends Error {
  readonly versionId: string

  constructor(versionId: string) {
    super(`Assessment version '${versionId}' has no approved scoring version.`)
    this.name = 'NoApprovedScoringVersionError'
    this.versionId = versionId
  }
}

/** A session in a state the scoring engine has no business reading. */
export class SessionNotScorableError extends Error {
  readonly sessionId: string
  readonly status: SessionStatus

  constructor(sessionId: string, status: SessionStatus) {
    super(`Assessment session '${sessionId}' is '${status}' and is not awaiting a score.`)
    this.name = 'SessionNotScorableError'
    this.sessionId = sessionId
    this.status = status
  }
}

/** A configuration the domain refuses before the database ever sees it. */
export class ScoringConfigInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScoringConfigInputError'
  }
}

/* --------------------------------------------------------------------- authoring the rules --- */

export interface ScoringWeightInput {
  dimensionId: string
  weight: number
}

export interface ScoringVersionSummary {
  id: string
  versionId: string
  scoringNo: number
  status: ScoringVersionStatus
  bands: Bands
  taskAxisDimensionId: string | null
  peopleAxisDimensionId: string | null
  createdAt: Date
  approvedAt: Date | null
  retiredAt: Date | null
  weights: { dimensionId: string; dimensionCode: string; weight: number }[]
}

async function requireScoringVersion(db: Db, id: string) {
  const rows = await db
    .select()
    .from(assessmentScoringVersions)
    .where(eq(assessmentScoringVersions.id, id))
    .limit(1)
  const row = rows[0]
  if (!row) throw new NotFoundError('Scoring version', id)
  return row
}

/**
 * Drafts a formula for one published assessment version.
 *
 * Every weight is written at draft time along with the dimension's `code`, copied rather than
 * joined for the same reason `dimension_code_snapshot` is copied one table over: the ledger
 * addresses dimensions by code, and the bank stays editable forever. A rename after approval must
 * not silently repoint a frozen formula at a different measurement.
 *
 * rbac.md gives this the `draft` action on the Scoring Rules row, which only Lab Admin holds.
 */
export async function createScoringVersion(
  db: Db,
  input: {
    versionId: string
    bands: Bands
    weights: readonly ScoringWeightInput[]
    taskAxisDimensionId?: string | null
    peopleAxisDimensionId?: string | null
    actorUserId: string
  }
): Promise<ScoringVersionSummary> {
  const bands = bandsSchema.parse(input.bands)
  if (bands.length === 0) {
    throw new ScoringConfigInputError('A scoring version needs at least one readiness band.')
  }
  if (input.weights.length === 0) {
    throw new ScoringConfigInputError('A scoring version needs at least one weighted dimension.')
  }

  const versions = await db
    .select({ id: assessmentVersions.id, status: assessmentVersions.status })
    .from(assessmentVersions)
    .where(eq(assessmentVersions.id, input.versionId))
    .limit(1)
  const version = versions[0]
  if (!version) throw new NotFoundError('Assessment version', input.versionId)
  // A formula addresses the codes a version froze at publish, so there is nothing stable to
  // address before that. Retired is allowed: a retired version still has scores to explain.
  if (version.status !== 'published' && version.status !== 'retired') {
    throw new ScoringConfigInputError(
      'A scoring version can only be drafted against a published assessment version.'
    )
  }

  const dimensionIds = input.weights.map((w) => w.dimensionId)
  const dimensions = await db
    .select({
      id: assessmentDimensions.id,
      code: assessmentDimensions.code,
      kind: assessmentDimensions.kind,
    })
    .from(assessmentDimensions)
    .where(inArray(assessmentDimensions.id, dimensionIds))

  const byId = new Map(dimensions.map((d) => [d.id, d]))
  const unknown = dimensionIds.filter((id) => !byId.has(id))
  if (unknown.length > 0) throw new NotFoundError('Dimension', unknown[0]!)

  for (const axisId of [input.taskAxisDimensionId, input.peopleAxisDimensionId]) {
    if (!axisId) continue
    const axis = byId.get(axisId)
    if (!axis) throw new NotFoundError('Dimension', axisId)
    if (axis.kind !== 'axis') {
      throw new ScoringConfigInputError(
        `Dimension '${axis.code}' is a ${axis.kind}, so it cannot be a Blake-Mouton axis.`
      )
    }
  }

  const highest = await db
    .select({ value: max(assessmentScoringVersions.scoringNo) })
    .from(assessmentScoringVersions)
    .where(eq(assessmentScoringVersions.versionId, input.versionId))
  const scoringNo = (highest[0]?.value ?? 0) + 1

  const id = crypto.randomUUID()
  const createdAt = new Date()

  await db.transaction(async (tx) => {
    await tx.insert(assessmentScoringVersions).values({
      id,
      versionId: input.versionId,
      scoringNo,
      status: 'draft',
      bands: JSON.stringify(bands),
      taskAxisDimensionId: input.taskAxisDimensionId ?? null,
      peopleAxisDimensionId: input.peopleAxisDimensionId ?? null,
      createdAt,
      createdBy: input.actorUserId,
      approvedAt: null,
      approvedBy: null,
      retiredAt: null,
    })

    await tx.insert(assessmentScoringRules).values(
      input.weights.map((weight) => ({
        id: crypto.randomUUID(),
        scoringVersionId: id,
        dimensionId: weight.dimensionId,
        dimensionCode: byId.get(weight.dimensionId)!.code,
        weight: weight.weight,
      }))
    )

    await createAuditRepository(tx as unknown as Db).append({
      ...assessmentAuditEvent({
        event_type: 'assessment.scoring_version_created',
        scoring_version_id: id,
        version_id: input.versionId,
        scoring_no: scoringNo,
        rule_count: input.weights.length,
      }),
      actorUserId: input.actorUserId,
    })
  })

  return getScoringVersion(db, id)
}

export async function getScoringVersion(db: Db, id: string): Promise<ScoringVersionSummary> {
  const row = await requireScoringVersion(db, id)
  const rules = await db
    .select({
      dimensionId: assessmentScoringRules.dimensionId,
      dimensionCode: assessmentScoringRules.dimensionCode,
      weight: assessmentScoringRules.weight,
    })
    .from(assessmentScoringRules)
    .where(eq(assessmentScoringRules.scoringVersionId, id))
    .orderBy(asc(assessmentScoringRules.dimensionCode))

  return {
    id: row.id,
    versionId: row.versionId,
    scoringNo: row.scoringNo,
    status: row.status,
    bands: bandsSchema.parse(JSON.parse(row.bands)),
    taskAxisDimensionId: row.taskAxisDimensionId,
    peopleAxisDimensionId: row.peopleAxisDimensionId,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    retiredAt: row.retiredAt,
    weights: rules,
  }
}

export async function listScoringVersions(
  db: Db,
  versionId: string
): Promise<ScoringVersionSummary[]> {
  const rows = await db
    .select({ id: assessmentScoringVersions.id })
    .from(assessmentScoringVersions)
    .where(eq(assessmentScoringVersions.versionId, versionId))
    .orderBy(asc(assessmentScoringVersions.scoringNo))

  return Promise.all(rows.map((row) => getScoringVersion(db, row.id)))
}

/**
 * Approves a draft, which freezes it. rbac.md gives this the `approve` action, held only by
 * Academic Lead — the separation of duties that `/CLAUDE.md` rule 1 rests on.
 *
 * The database refuses an approval with no rules behind it, and refuses a second approved formula
 * on the same version. Both are checked here too, so the caller gets a sentence rather than a
 * constraint name.
 */
export async function approveScoringVersion(
  db: Db,
  { scoringVersionId, actorUserId }: { scoringVersionId: string; actorUserId: string }
): Promise<ScoringVersionSummary> {
  const row = await requireScoringVersion(db, scoringVersionId)
  if (row.status !== 'draft') throw new ScoringVersionFrozenError(row.id, row.status)

  const existing = await db
    .select({ id: assessmentScoringVersions.id })
    .from(assessmentScoringVersions)
    .where(
      and(
        eq(assessmentScoringVersions.versionId, row.versionId),
        eq(assessmentScoringVersions.status, 'approved')
      )
    )
    .limit(1)
  if (existing[0]) {
    throw new ScoringConfigInputError(
      'That assessment version already has an approved scoring version. Retire it first.'
    )
  }

  const rules = await db
    .select({ id: assessmentScoringRules.id })
    .from(assessmentScoringRules)
    .where(eq(assessmentScoringRules.scoringVersionId, row.id))
    .limit(1)
  if (!rules[0]) {
    throw new ScoringConfigInputError('A scoring version with no rules scores nothing.')
  }

  const approvedAt = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(assessmentScoringVersions)
      .set({ status: 'approved', approvedAt, approvedBy: actorUserId })
      .where(eq(assessmentScoringVersions.id, row.id))

    await createAuditRepository(tx as unknown as Db).append({
      ...assessmentAuditEvent({
        event_type: 'assessment.scoring_version_approved',
        scoring_version_id: row.id,
        version_id: row.versionId,
        scoring_no: row.scoringNo,
      }),
      actorUserId,
    })
  })

  return getScoringVersion(db, row.id)
}

/** Retires an approved formula. The only UPDATE the freeze trigger lets through. */
export async function retireScoringVersion(
  db: Db,
  { scoringVersionId, actorUserId }: { scoringVersionId: string; actorUserId: string }
): Promise<ScoringVersionSummary> {
  const row = await requireScoringVersion(db, scoringVersionId)
  if (row.status !== 'approved') throw new ScoringVersionFrozenError(row.id, row.status)

  await db.transaction(async (tx) => {
    await tx
      .update(assessmentScoringVersions)
      .set({ status: 'retired', retiredAt: new Date() })
      .where(eq(assessmentScoringVersions.id, row.id))

    await createAuditRepository(tx as unknown as Db).append({
      ...assessmentAuditEvent({
        event_type: 'assessment.scoring_version_retired',
        scoring_version_id: row.id,
        version_id: row.versionId,
        scoring_no: row.scoringNo,
      }),
      actorUserId,
    })
  })

  return getScoringVersion(db, row.id)
}

/* ------------------------------------------------------------- what the engine reads from --- */

/**
 * The approved formula for an assessment version, in the shape the engine takes.
 *
 * By id rather than "the current one" wherever a historical run is being reproduced: a rescore
 * under the formula that produced the original is the only way to check an incident finding
 * without changing the answer.
 */
export async function getScoringConfig(
  db: Db,
  { versionId, scoringVersionId }: { versionId: string; scoringVersionId?: string }
): Promise<ScoringVersionForScoring> {
  const rows = scoringVersionId
    ? await db
        .select()
        .from(assessmentScoringVersions)
        .where(eq(assessmentScoringVersions.id, scoringVersionId))
        .limit(1)
    : await db
        .select()
        .from(assessmentScoringVersions)
        .where(
          and(
            eq(assessmentScoringVersions.versionId, versionId),
            eq(assessmentScoringVersions.status, 'approved')
          )
        )
        .limit(1)

  const row = rows[0]
  if (!row) throw new NoApprovedScoringVersionError(versionId)

  const rules = await db
    .select({
      id: assessmentScoringRules.id,
      dimensionCode: assessmentScoringRules.dimensionCode,
      weight: assessmentScoringRules.weight,
      kind: assessmentDimensions.kind,
    })
    .from(assessmentScoringRules)
    .innerJoin(
      assessmentDimensions,
      eq(assessmentDimensions.id, assessmentScoringRules.dimensionId)
    )
    .where(eq(assessmentScoringRules.scoringVersionId, row.id))

  const axisCode = async (dimensionId: string | null) => {
    if (!dimensionId) return null
    const found = await db
      .select({ code: assessmentDimensions.code })
      .from(assessmentDimensions)
      .where(eq(assessmentDimensions.id, dimensionId))
      .limit(1)
    return found[0]?.code ?? null
  }

  return {
    id: row.id,
    bands: bandsSchema.parse(JSON.parse(row.bands)),
    dimensions: rules.map((rule) => ({
      code: rule.dimensionCode,
      kind: rule.kind,
      weight: rule.weight,
      scoringRuleId: rule.id,
    })),
    taskAxisCode: await axisCode(row.taskAxisDimensionId),
    peopleAxisCode: await axisCode(row.peopleAxisDimensionId),
  }
}

export interface ScorableSession {
  sessionId: string
  userId: string
  versionId: string
  status: SessionStatus
  submittedAt: Date | null
  version: AssessmentVersionForScoring
  responses: ResponseSet
}

/**
 * One session's frozen response set, flattened to arithmetic.
 *
 * Everything comes from the publish snapshot — `dimension_code_snapshot` and
 * `scale_points_snapshot`, never today's bank. A score has to be reproducible from what the
 * student was actually asked, and the bank is editable by design.
 *
 * `requireSubmitted` is a parameter rather than an assumption because a rescore reads a session
 * that is already `scored`, which is precisely the state an initial run must refuse. `userId` is
 * the row-ownership filter; see the comment on the query.
 */
export async function readScorableSession(
  db: Db,
  {
    sessionId,
    userId,
    requireSubmitted = true,
  }: { sessionId: string; userId?: string; requireSubmitted?: boolean }
): Promise<ScorableSession> {
  const sessions = await db
    .select()
    .from(assessmentSessions)
    .where(
      // `userId` is the row-ownership filter the policy layer cannot apply: a student's cell on
      // the Own Assessment row is `CRUD`, which resolves to an unconditional allow and never
      // reaches a scope predicate (#65). A session belonging to someone else is reported as
      // absent, so an id the caller cannot see is indistinguishable from one that does not exist.
      userId
        ? and(eq(assessmentSessions.id, sessionId), eq(assessmentSessions.userId, userId))
        : eq(assessmentSessions.id, sessionId)
    )
    .limit(1)
  const session = sessions[0]
  if (!session) throw new NotFoundError('Assessment session', sessionId)

  if (requireSubmitted && session.status !== 'submitted') {
    throw new SessionNotScorableError(sessionId, session.status)
  }
  if (session.status === 'in_progress') {
    throw new SessionNotScorableError(sessionId, session.status)
  }

  const itemRows = await db
    .select({
      versionItemId: assessmentVersionItems.id,
      reverseCoded: assessmentVersionItems.reverseCoded,
      scalePointsSnapshot: assessmentVersionItems.scalePointsSnapshot,
      position: assessmentVersionItems.position,
    })
    .from(assessmentVersionItems)
    .where(eq(assessmentVersionItems.versionId, session.versionId))
    .orderBy(asc(assessmentVersionItems.position))

  const dimensionRows = await db
    .select({
      versionItemId: assessmentVersionItemDimensions.versionItemId,
      code: assessmentVersionItemDimensions.dimensionCodeSnapshot,
    })
    .from(assessmentVersionItemDimensions)
    .innerJoin(
      assessmentVersionItems,
      eq(assessmentVersionItems.id, assessmentVersionItemDimensions.versionItemId)
    )
    .where(eq(assessmentVersionItems.versionId, session.versionId))

  const codesByItem = new Map<string, string[]>()
  for (const row of dimensionRows) {
    const codes = codesByItem.get(row.versionItemId) ?? []
    codes.push(row.code)
    codesByItem.set(row.versionItemId, codes)
  }

  const items = itemRows.map((row) => {
    if (!row.scalePointsSnapshot) {
      // The publish gate in migration 0004 refuses a version with a null snapshot, so this is an
      // integrity failure rather than a case to render around.
      throw new Error(`Version item '${row.versionItemId}' is published without a snapshot.`)
    }
    const points = scalePointsSchema.parse(JSON.parse(row.scalePointsSnapshot))
    const values = points.map((point) => point.value)
    return {
      versionItemId: row.versionItemId,
      reverseCoded: row.reverseCoded,
      scaleMin: Math.min(...values),
      scaleMax: Math.max(...values),
      // Sorted so that a version item's dimension list is stable between reads, which keeps the
      // engine's own iteration order stable without it having to sort defensively.
      dimensionCodes: (codesByItem.get(row.versionItemId) ?? []).sort(),
    }
  })

  const answerRows = await db
    .select({
      versionItemId: assessmentResponses.versionItemId,
      answerValue: assessmentResponses.answerValue,
    })
    .from(assessmentResponses)
    .where(eq(assessmentResponses.sessionId, sessionId))

  const responses: Record<string, number> = {}
  for (const row of answerRows) responses[row.versionItemId] = row.answerValue

  return {
    sessionId: session.id,
    userId: session.userId,
    versionId: session.versionId,
    status: session.status,
    submittedAt: session.submittedAt,
    version: { id: session.versionId, items },
    responses,
  }
}

/**
 * Flips `submitted → scored`, the transition `assessment_sessions` has carried as a defined but
 * unimplemented contract since #58.
 *
 * Idempotent: a session already `scored` is left alone rather than refused, because the caller
 * that reaches here twice is a retried sweeper, and failing it would turn a converged state into
 * an error.
 */
export async function markSessionScored(db: Db, sessionId: string): Promise<void> {
  await db
    .update(assessmentSessions)
    .set({ status: 'scored' })
    .where(and(eq(assessmentSessions.id, sessionId), eq(assessmentSessions.status, 'submitted')))
}

/**
 * Does this student have a submitted session that has not been scored?
 *
 * Exists so the profile page can tell two very different empty states apart: a student who has
 * taken nothing yet, and one who finished an assessment whose formula an Academic Lead has not
 * approved. Showing the first message to the second reads as their work having been lost.
 */
export async function hasSessionAwaitingScore(db: Db, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: assessmentSessions.id })
    .from(assessmentSessions)
    .where(and(eq(assessmentSessions.userId, userId), eq(assessmentSessions.status, 'submitted')))
    .limit(1)
  return rows.length > 0
}
