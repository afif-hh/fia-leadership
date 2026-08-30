import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../../../http/define-policy-handler.ts'
import { parseLocaleParam } from '../../../../../../db/schema/locale.ts'
import { createAssessmentRepository } from '../../../../../../domain/assessment/index.ts'

/** An instrument's name and description in one language. See the item route for the PUT reasoning. */
const body = z.strictObject({
  name: z.string().check(z.minLength(1)),
  description: z.nullish(z.string()),
})

export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'update',
  domain: 'assessment',
  handler: async (event, _principal, { db }) => {
    const instrumentId = getRouterParam(event, 'instrumentId') ?? ''
    const locale = parseLocaleParam(getRouterParam(event, 'locale'))
    const input = body.parse(await readBody(event))

    await createAssessmentRepository(db).setInstrumentTranslation({
      instrumentId,
      locale,
      name: input.name,
      description: input.description ?? null,
    })
    return { instrumentId, locale, name: input.name, description: input.description ?? null }
  },
})
