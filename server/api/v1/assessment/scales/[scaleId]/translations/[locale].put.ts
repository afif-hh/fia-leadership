import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../../../http/define-policy-handler.ts'
import { parseLocaleParam } from '../../../../../../db/schema/locale.ts'
import {
  createAssessmentRepository,
  scalePointsSchema,
} from '../../../../../../domain/assessment/index.ts'

/**
 * A scale's name and its whole anchor ladder in one language.
 *
 * `points` is required and complete rather than a per-label patch: the anchors are one calibrated
 * ladder, and a half-translated ladder is a scale that has stopped measuring what it measured.
 * See the note on `assessment_scale_translations`.
 */
const body = z.strictObject({
  name: z.string().check(z.minLength(1)),
  points: scalePointsSchema,
})

export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'update',
  domain: 'assessment',
  handler: async (event, _principal, { db }) => {
    const scaleId = getRouterParam(event, 'scaleId') ?? ''
    const locale = parseLocaleParam(getRouterParam(event, 'locale'))
    const input = body.parse(await readBody(event))

    await createAssessmentRepository(db).setScaleTranslation({ scaleId, locale, ...input })
    return { scaleId, locale, ...input }
  },
})
