import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../http/define-policy-handler.ts'
import { requestLocale } from '../../../../http/request-locale.ts'
import { getVersionDetail } from '../../../../domain/assessment/index.ts'

/**
 * One version with its selection, dimension mapping and scale.
 *
 * A frozen version reads its snapshot rather than today's bank text, and carries `frozen: true`
 * so the UI renders it read-only and visibly a different kind of object from a draft (#50).
 */
export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'read',
  domain: 'assessment',
  handler: async (event, _principal, { db }) =>
    getVersionDetail(db, getRouterParam(event, 'versionId') ?? '', requestLocale(event)),
})
