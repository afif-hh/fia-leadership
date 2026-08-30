import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { submitSession } from '../../../../../domain/assessment/index.ts'

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
 */
export default definePolicyHandler({
  resource: 'ownAssessment',
  action: 'update',
  domain: 'assessment',
  audit: true,
  handler: async (event, principal, { db }) => {
    const sessionId = getRouterParam(event, 'sessionId') ?? ''
    return { session: await submitSession(db, { sessionId, userId: principal.userId }) }
  },
})
