import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../http/define-policy-handler.ts'
import { requestLocale } from '../../../../http/request-locale.ts'
import {
  getInstrument,
  listBankItems,
  listDimensions,
  listScales,
  listVersions,
} from '../../../../domain/assessment/index.ts'

/**
 * One instrument with everything the authoring UI needs to open it: its versions, and the bank
 * (items, dimensions, scales) the ledger and the dimension matrix are built from (#50).
 */
export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'read',
  domain: 'assessment',
  handler: async (event, _principal, { db }) => {
    const instrumentId = getRouterParam(event, 'instrumentId') ?? ''
    const locale = requestLocale(event)
    const instrument = await getInstrument(db, instrumentId, locale)

    return {
      instrument,
      versions: await listVersions(db, instrumentId),
      items: await listBankItems(db, instrumentId, locale),
      dimensions: await listDimensions(db, instrumentId, locale),
      scales: await listScales(db, instrumentId, locale),
    }
  },
})
