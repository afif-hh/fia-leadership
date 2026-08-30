import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../http/define-policy-handler.ts'
import { getSession } from '../../../../domain/assessment/index.ts'

/**
 * Reads a session back, for resume (#64). Returns the session, its whole item set, and every
 * answer saved so far.
 *
 * `target` supplies `sessionId` because a **lecturer/coach** reaching this route is `scoped` and
 * dispatches to `SCOPE_PREDICATES['ownAssessment']`. A student is not — their `CRUD` cell is an
 * unconditional `allow` — so the predicate protects nobody's own row and the service still filters
 * on `user_id` itself. Both halves are needed; neither substitutes for the other.
 */
export default definePolicyHandler({
  resource: 'ownAssessment',
  action: 'read',
  domain: 'assessment',
  target: (event) => ({ sessionId: getRouterParam(event, 'sessionId') }),
  handler: async (event, principal, { db }) => {
    const sessionId = getRouterParam(event, 'sessionId') ?? ''
    return getSession(db, { sessionId, userId: principal.userId })
  },
})
