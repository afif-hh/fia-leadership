import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { retireScoringVersion } from '../../../../../domain/assessment/index.ts'

/**
 * Retires an approved formula so a replacement can be approved in its place.
 *
 * The `approve` action rather than a fourth one: withdrawing a formula from service is the same
 * academic judgement as putting it there, and rbac.md's row has no token that would give it to
 * anyone else. Scores it already produced are untouched — retiring means "stop scoring with
 * this", never "recompute what it scored".
 */
export default definePolicyHandler({
  resource: 'scoringRules',
  action: 'approve',
  domain: 'assessment',
  audit: true,
  handler: async (event, principal, { db }) => {
    const scoringVersionId = getRouterParam(event, 'scoringVersionId') ?? ''
    return {
      scoringVersion: await retireScoringVersion(db, {
        scoringVersionId,
        actorUserId: principal.userId,
      }),
    }
  },
})
