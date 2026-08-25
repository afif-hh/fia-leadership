import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../http/define-policy-handler.ts'
import { createAssessmentRepository } from '../../../../domain/assessment/index.ts'

/**
 * Rewords a bank item in place — legal even when the item appears in a published version.
 *
 * #49 chose this deliberately, accepting that item code `KD01` can then mean different wording in
 * two versions, because snapshots keep every published version honest. The drift is governed by
 * making it visible: see the diff endpoint.
 */
const body = z.strictObject({ code: z.optional(z.string()), stem: z.optional(z.string()) })

export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'update',
  domain: 'assessment',
  handler: async (event, _principal, { db }) => {
    const itemId = getRouterParam(event, 'itemId') ?? ''
    await createAssessmentRepository(db).updateItem(itemId, body.parse(await readBody(event)))
    return { itemId }
  },
})
