import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { createAssessmentRepository, getVersion } from '../../../../../domain/assessment/index.ts'

/**
 * `draft → review`. Not audit-classified: it freezes nothing and is reversible by publishing or
 * abandoning the version, so it is not on rbac.md's Audit Classification list.
 */
export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'update',
  domain: 'assessment',
  handler: async (event, _principal, { db }) => {
    const versionId = getRouterParam(event, 'versionId') ?? ''
    await createAssessmentRepository(db).advanceToReview(versionId)
    return { version: await getVersion(db, versionId) }
  },
})
