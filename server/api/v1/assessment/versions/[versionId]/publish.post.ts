import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { createAssessmentRepository, getVersion } from '../../../../../domain/assessment/index.ts'

/**
 * Publishes a version: fills the snapshots, then flips status, in one transaction (#48).
 *
 * `audit: true` — freezing an instrument is irreversible under FR-005, so the role check must be
 * read fresh rather than from the ≤60s-stale cookie cache.
 * `assessment.version_published` is written inside the same transaction, and is listed in
 * rbac.md's Audit Classification section.
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
