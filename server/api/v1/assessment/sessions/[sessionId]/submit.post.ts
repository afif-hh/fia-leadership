import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import {
  NoApprovedScoringVersionError,
  submitSession,
} from '../../../../../domain/assessment/index.ts'
import { scoreSession } from '../../../../../domain/profile/index.ts'

/**
 * Submits, closing the session for good (#64).
 *
 * `audit: true` — submitting is on rbac.md's mandatory audit list. It also forces
 * `requireFreshSession`, so an audited action can never read roles from the ≤60s-stale cookie
 * cache. The event itself carries ids and a count, never answers (#65).
 *
 * Refuses an incomplete response set with 422 and a `fields` array naming the unanswered items
 * (SC-06), which the service derives so this layer does not have to.
 *
 * `Idempotency-Key` is accepted by convention (api-design.md) but nothing here consults it: a
 * second submit is already refused with 409 by the session's own status, which is a stronger
 * guarantee than a key cache and cannot expire.
 *
 * Scoring runs inline, straight after the submit commits, so an ordinary student sees their
 * profile the moment they finish rather than at some later sweep. #70 left the triggering
 * mechanism to the scoring effort and this is it: a direct call, no queue, no outbox, none of
 * which exist on this deployment.
 *
 * Two things make that safe to do in the request. The submit has already committed, so nothing
 * about scoring can undo it. And `POST .../score` scores the same session idempotently, so a
 * request that dies between the two leaves work that converges on the next call rather than a
 * session stuck in `submitted` for good.
 *
 * Only the one operational failure is caught. A version whose formula an Academic Lead has not yet
 * approved is a state outside this request's control, and it returns `scored: false` so the client
 * can say "not ready yet". Anything else is a bug and is left to surface as a 500 — wrapping it
 * would hide a broken formula behind a cheerful response, and the submit itself is already safe.
 */
export default definePolicyHandler({
  resource: 'ownAssessment',
  action: 'update',
  domain: 'assessment',
  audit: true,
  handler: async (event, principal, { db }) => {
    const sessionId = getRouterParam(event, 'sessionId') ?? ''
    const session = await submitSession(db, { sessionId, userId: principal.userId })

    try {
      await scoreSession(db, { sessionId, userId: principal.userId })
      return { session, scored: true }
    } catch (error) {
      if (error instanceof NoApprovedScoringVersionError) return { session, scored: false }
      throw error
    }
  },
})
