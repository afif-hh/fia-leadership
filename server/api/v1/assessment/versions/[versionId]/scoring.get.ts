import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { listScoringVersions } from '../../../../../domain/assessment/index.ts'

/**
 * Every scoring version drafted against one assessment version, with its weights.
 *
 * Maps to rbac.md's **Scoring Rules** row, action `read`. Both roles on that row hold it: Lab
 * Admin drafts and Academic Lead approves, and neither can do their half of the work without
 * reading what is there. See the note in `interpret()`.
 *
 * Not audit-classified. Reading a configuration is not on rbac.md's mandatory list, and #20
 * settled that read endpoints are not audited.
 */
export default definePolicyHandler({
  resource: 'scoringRules',
  action: 'read',
  domain: 'assessment',
  handler: async (event, _principal, { db }) => {
    const versionId = getRouterParam(event, 'versionId') ?? ''
    return { scoringVersions: await listScoringVersions(db, versionId) }
  },
})
