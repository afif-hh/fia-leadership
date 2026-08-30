import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { scoreSession } from '../../../../../domain/profile/index.ts'

/**
 * Scores the caller's own submitted session, or reports the score it already has.
 *
 * Maps to rbac.md's **Own Assessment** row, action `update` — the same row and action the submit
 * endpoint uses, because this is the other half of the same act. Row ownership is enforced in the
 * service, not here: the student's cell is `CRUD`, which resolves to an unconditional allow and
 * never reaches a scope predicate, so `userId` is passed down and a session belonging to someone
 * else comes back as a 404 (#65).
 *
 * Idempotent, and that is the whole reason it is a separate endpoint. Submitting scores inline, so
 * in the ordinary case this is never called; it exists for the request that died between the two,
 * which would otherwise leave a session `submitted` for good and a student with no result. Calling
 * it converges — the partial unique index on `profile_score_runs` admits one initial run per
 * session no matter how many callers race.
 *
 * Not audit-classified. An initial score already leaves a durable, timestamped, version-stamped
 * record of its own in `profile_score_runs`, and rbac.md's mandatory list does not name it. A
 * rescore is audited, and a rescore is not reachable from here.
 */
export default definePolicyHandler({
  resource: 'ownAssessment',
  action: 'update',
  domain: 'assessment',
  handler: async (event, principal, { db }) => {
    const sessionId = getRouterParam(event, 'sessionId') ?? ''
    const run = await scoreSession(db, { sessionId, userId: principal.userId })
    return { scoreRunId: run.scoreRunId, report: run.report, alreadyScored: run.alreadyScored }
  },
})
