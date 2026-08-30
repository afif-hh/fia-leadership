import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../../../http/define-policy-handler.ts'
import { parseLocaleParam } from '../../../../../../db/schema/locale.ts'
import { getInstrumentTranslations } from '../../../../../../domain/assessment/index.ts'

/**
 * Every translation this instrument holds in one language, unresolved.
 *
 * Distinct from the resolved reads: those answer what a reader sees, this answers what has been
 * translated. The authoring screen needs the second, because it shows the translation beside the
 * original and a resolved read cannot tell a real translation from a fallback.
 */
export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'read',
  domain: 'assessment',
  handler: async (event, _principal, { db }) =>
    getInstrumentTranslations(
      db,
      getRouterParam(event, 'instrumentId') ?? '',
      parseLocaleParam(getRouterParam(event, 'locale'))
    ),
})
