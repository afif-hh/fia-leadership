import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { createAssessmentRepository, getVersion } from '../../../../../domain/assessment/index.ts'

/** Retires a published version — the one mutation #48's trigger permits on a frozen row. */
export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'update',
  domain: 'assessment',
  audit: true,
  handler: async (event, principal, { db }) => {
    const versionId = getRouterParam(event, 'versionId') ?? ''
    await createAssessmentRepository(db).retire(versionId, principal.userId)
    return { version: await getVersion(db, versionId) }
  },
})
