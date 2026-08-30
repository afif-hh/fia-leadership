import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { saveAnswer } from '../../../../../domain/assessment/index.ts'

/**
 * Autosave: **one answer per request** (#64), matching #66's per-item debounce rather than a
 * batch flush.
 *
 * Idempotent through the composite primary key on `assessment_responses` and nothing else — a
 * retried identical request rewrites the same row. #64 ruled out a version check or write token
 * deliberately: the only way to lose a write is two concurrent saves for the same item, and the
 * client has one in flight per item with no offline or multi-tab sync.
 *
 * Not audited: an audited autosave would write a row per item per student for no investigative
 * gain, and `assessment_responses` is already the durable record (#65).
 *
 * Rate limiting is not applied here. The number is fixed (60/min/user in devsecops.md) but no
 * limiter exists for any endpoint yet, and building one bespoke here would produce a second,
 * inconsistent mechanism the moment auth needs the same thing (#71).
 */
const body = z.strictObject({
  versionItemId: z.string(),
  answerValue: z.number(),
})

export default definePolicyHandler({
  resource: 'ownAssessment',
  action: 'update',
  domain: 'assessment',
  handler: async (event, principal, { db }) => {
    const sessionId = getRouterParam(event, 'sessionId') ?? ''
    const input = body.parse(await readBody(event))

    await saveAnswer(db, {
      sessionId,
      userId: principal.userId,
      versionItemId: input.versionItemId,
      answerValue: input.answerValue,
    })

    // Deliberately no echo of the saved value: the response is a receipt, and reflecting an
    // answer back is one more surface it could be logged from (the PII Rule).
    return { saved: true }
  },
})
