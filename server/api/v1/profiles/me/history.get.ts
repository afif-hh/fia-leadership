import { definePolicyHandler } from '../../../../http/define-policy-handler.ts'
import { listProfileHistory } from '../../../../domain/profile/index.ts'

/**
 * Every profile this student has, newest first — the longitudinal view re-assessment produces.
 *
 * A rescore appears as its own entry rather than replacing what it recomputed, which is what makes
 * a corrected result visible as a correction instead of as a silently different number.
 */
export default definePolicyHandler({
  resource: 'ownProfile',
  action: 'read',
  domain: 'profile',
  handler: async (_event, principal, { db }) => ({
    profiles: await listProfileHistory(db, principal.userId),
  }),
})
