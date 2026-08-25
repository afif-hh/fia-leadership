import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../http/define-policy-handler.ts'
import { createAssessmentRepository } from '../../../../domain/assessment/index.ts'

const body = z.strictObject({
  code: z.optional(z.string()),
  name: z.optional(z.string()),
  points: z.optional(z.array(z.strictObject({ value: z.number(), label: z.string() }))),
})

export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'update',
  domain: 'assessment',
  handler: async (event, _principal, { db }) => {
    const scaleId = getRouterParam(event, 'scaleId') ?? ''
    await createAssessmentRepository(db).updateScale(scaleId, body.parse(await readBody(event)))
    return { scaleId }
  },
})
