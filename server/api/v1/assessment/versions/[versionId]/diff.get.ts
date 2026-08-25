import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { diffVersionAgainstSource } from '../../../../../domain/assessment/index.ts'

/**
 * The diff against `source_version_id`: items added, removed, moved, reverse-coding changed, and
 * stems changed since the source froze.
 *
 * Mandatory, not a nicety. #49 permitted in-place rewording of bank items only on the condition
 * that the drift is visible for the Academic Lead to judge, and this endpoint is that condition.
 */
export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'read',
  domain: 'assessment',
  handler: async (event, _principal, { db }) =>
    diffVersionAgainstSource(db, getRouterParam(event, 'versionId') ?? ''),
})
