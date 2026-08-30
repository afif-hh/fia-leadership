import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../../../http/define-policy-handler.ts'
import { parseLocaleParam } from '../../../../../../db/schema/locale.ts'
import { createAssessmentRepository } from '../../../../../../domain/assessment/index.ts'

/**
 * The item's wording in one language.
 *
 * PUT on `(item, locale)`, because that pair is the whole resource: a translation is replaced,
 * never patched, and re-sending the same body is the same state (`make-operations-idempotent`).
 *
 * Bank-level, so it is legal at any version status. It cannot alter a published version — that
 * version froze its own translated snapshot at publish, and migration 0010's triggers refuse a
 * write to it. Which is the point: correcting a translation must not silently change what a
 * student who already answered was asked.
 */
const body = z.strictObject({ stem: z.string().check(z.minLength(1)) })

export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'update',
  domain: 'assessment',
  handler: async (event, _principal, { db }) => {
    const itemId = getRouterParam(event, 'itemId') ?? ''
    const locale = parseLocaleParam(getRouterParam(event, 'locale'))
    const input = body.parse(await readBody(event))

    await createAssessmentRepository(db).setItemTranslation({ itemId, locale, stem: input.stem })
    return { itemId, locale, stem: input.stem }
  },
})
