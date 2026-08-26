import { readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../http/define-policy-handler.ts'
import { createAssessmentRepository, getInstrument } from '../../../domain/assessment/index.ts'

const body = z.strictObject({
  code: z.string(),
  name: z.string(),
  description: z.optional(z.nullable(z.string())),
})

export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'create',
  domain: 'assessment',
  handler: async (event, principal, { db }) => {
    const input = body.parse(await readBody(event))
    const id = await createAssessmentRepository(db).createInstrument({
      ...input,
      createdBy: principal.userId,
    })
    return { instrument: await getInstrument(db, id) }
  },
})
