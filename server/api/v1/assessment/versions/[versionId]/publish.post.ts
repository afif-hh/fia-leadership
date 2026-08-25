import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { createAssessmentRepository, getVersion } from '../../../../../domain/assessment/index.ts'

/**
 * Publishes a version: fills the snapshots, then flips status, in one transaction (#48).
 *
 * `audit: true` — publish is on rbac.md's Audit Classification list ("Ubah scoring config" is the
 * neighbouring case, and freezing an instrument is at least as consequential), so the role check
 * must not come from the ≤60s-stale cookie cache. `assessment.version_published` is written
 * inside the same transaction.
 */
export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'update',
  domain: 'assessment',
  audit: true,
  handler: async (event, principal, { db }) => {
    const versionId = getRouterParam(event, 'versionId') ?? ''
    await createAssessmentRepository(db).publish(versionId, principal.userId)
    return { version: await getVersion(db, versionId) }
  },
})
