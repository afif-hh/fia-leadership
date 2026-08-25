import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { createAssessmentRepository } from '../../../../../domain/assessment/index.ts'

/** Creates a bank item. The bank is never frozen (#47), so this is legal at any version status. */
const body = z.strictObject({
  code: z.string(),
  stem: z.string(),
  scaleId: z.string(),
  dimensionIds: z.optional(z.array(z.string())),
})

export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'create',
  domain: 'assessment',
  handler: async (event, principal, { db }) => {
    const instrumentId = getRouterParam(event, 'instrumentId') ?? ''
    const input = body.parse(await readBody(event))
    const repo = createAssessmentRepository(db)

    const itemId = await repo.createItem({
      instrumentId,
      code: input.code,
      stem: input.stem,
      scaleId: input.scaleId,
      createdBy: principal.userId,
    })

    for (const dimensionId of input.dimensionIds ?? []) {
      await repo.mapItemToDimension(itemId, dimensionId)
    }

    return { itemId }
  },
})
