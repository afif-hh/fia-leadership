import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { assessmentCodeSchema } from '../../../../../http/assessment-code.ts'
import { createAssessmentRepository } from '../../../../../domain/assessment/index.ts'

/** Creates a bank item. The bank is never frozen (#47), so this is legal at any version status. */
const body = z.strictObject({
  code: assessmentCodeSchema,
  stem: z.string(),
  scaleId: z.string(),
  dimensionIds: z.optional(z.array(z.string())),
  /** Optional: select the new item into this open version, in the same transaction. */
  addTo: z.optional(z.strictObject({ versionId: z.string(), position: z.number() })),
})

export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'create',
  domain: 'assessment',
  handler: async (event, principal, { db }) => {
    const instrumentId = getRouterParam(event, 'instrumentId') ?? ''
    const input = body.parse(await readBody(event))
    const repo = createAssessmentRepository(db)

    // One call, one transaction. This used to create the item and then loop the mappings as
    // separate writes, so a failure part-way left an item created, partly mapped, and — when the
    // caller went on to select it into a version — belonging to no version, with its code already
    // spent against the instrument's unique index.
    const itemId = await repo.createItem({
      instrumentId,
      code: input.code,
      stem: input.stem,
      scaleId: input.scaleId,
      createdBy: principal.userId,
      dimensionIds: input.dimensionIds,
      addTo: input.addTo,
    })

    return { itemId }
  },
})
