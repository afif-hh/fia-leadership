import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { createAssessmentRepository } from '../../../../../domain/assessment/index.ts'

/**
 * Replaces a bank item's dimension mapping.
 *
 * PUT rather than PATCH because the body is the complete set, not a delta — the authoring UI's
 * chip picker (#54) sends the resulting selection after each toggle. An empty array is legal and
 * means "measures nothing yet"; the publish gate is what refuses to ship a version in that state,
 * not this endpoint.
 *
 * Bank-level, so it is legal at any version status: a published version keeps its own dimension
 * snapshot (#47) and cannot be altered from here.
 */
const body = z.strictObject({ dimensionIds: z.array(z.string()) })

export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'update',
  domain: 'assessment',
  handler: async (event, _principal, { db }) => {
    const itemId = getRouterParam(event, 'itemId') ?? ''
    const input = body.parse(await readBody(event))
    await createAssessmentRepository(db).setItemDimensions(itemId, input.dimensionIds)
    return { itemId, dimensionIds: [...new Set(input.dimensionIds)] }
  },
})
