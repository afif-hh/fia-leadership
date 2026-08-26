import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { createAssessmentRepository } from '../../../../../domain/assessment/index.ts'

const body = z.strictObject({
  code: z.string(),
  name: z.string(),
  points: z.array(z.strictObject({ value: z.number(), label: z.string() })),
})

export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'create',
  domain: 'assessment',
  handler: async (event, _principal, { db }) => {
    const instrumentId = getRouterParam(event, 'instrumentId') ?? ''
    const input = body.parse(await readBody(event))
    return { scaleId: await createAssessmentRepository(db).createScale({ instrumentId, ...input }) }
  },
})
