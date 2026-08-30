import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { approveScoringVersion } from '../../../../../domain/assessment/index.ts'

/**
 * Approves a draft formula, freezing it and putting it into service.
 *
 * Maps to **Scoring Rules** / `approve`, held only by Academic Lead. This is the moment a
 * threshold starts deciding what a student is told about themselves, which is why it is the one
 * action in this domain that a Lab Admin cannot perform.
 */
export default definePolicyHandler({
  resource: 'scoringRules',
  action: 'approve',
  domain: 'assessment',
  audit: true,
  handler: async (event, principal, { db }) => {
    const scoringVersionId = getRouterParam(event, 'scoringVersionId') ?? ''
    return {
      scoringVersion: await approveScoringVersion(db, {
        scoringVersionId,
        actorUserId: principal.userId,
      }),
    }
  },
})
