import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../http/define-policy-handler.ts'
import { createAssessmentRepository } from '../../../../domain/assessment/index.ts'
import { DIMENSION_KINDS } from '../../../../db/schema/assessment.ts'

const body = z.strictObject({
  code: z.optional(z.string()),
  name: z.optional(z.string()),
  kind: z.optional(z.enum(DIMENSION_KINDS)),
  description: z.optional(z.nullable(z.string())),
})

export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'update',
  domain: 'assessment',
  handler: async (event, _principal, { db }) => {
    const dimensionId = getRouterParam(event, 'dimensionId') ?? ''
    await createAssessmentRepository(db).updateDimension(
      dimensionId,
      body.parse(await readBody(event))
    )
    return { dimensionId }
  },
})
