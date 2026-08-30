import { definePolicyHandler } from '../../../http/define-policy-handler.ts'
import { requestLocale } from '../../../http/request-locale.ts'
import { listInstruments } from '../../../domain/assessment/index.ts'

/**
 * Maps to the **Assessment Configuration** row of rbac.md, whose Lab Admin and Academic Lead
 * cells are both `CRUD` (#45). Reading is not audit-classified, so this takes the cached session.
 */
export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'read',
  domain: 'assessment',
  handler: async (event, _principal, { db }) => ({
    instruments: await listInstruments(db, requestLocale(event)),
  }),
})
