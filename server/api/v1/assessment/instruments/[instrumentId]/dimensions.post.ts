import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { createAssessmentRepository } from '../../../../../domain/assessment/index.ts'
import { DIMENSION_KINDS } from '../../../../../db/schema/assessment.ts'

const body = z.strictObject({
  code: z.string(),
  name: z.string(),
  kind: z.enum(DIMENSION_KINDS),
  description: z.optional(z.nullable(z.string())),
})

export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'create',
  domain: 'assessment',
  handler: async (event, _principal, { db }) => {
    const instrumentId = getRouterParam(event, 'instrumentId') ?? ''
    const input = body.parse(await readBody(event))
    return {
      dimensionId: await createAssessmentRepository(db).createDimension({ instrumentId, ...input }),
    }
  },
})
