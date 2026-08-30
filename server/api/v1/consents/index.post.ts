import { readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../http/define-policy-handler.ts'
import { recordConsent } from '../../../domain/identity/index.ts'

/**
 * Records a consent decision (#59). The gap #78 left: its four routes read consent but none of
 * them writes one.
 *
 * `privacyNotice` is `z.literal(true)` rather than a boolean, so "accept the mandatory notice" is
 * unrepresentable as false — a request that tries is a 422 from the schema rather than a silently
 * half-recorded acceptance. Refusing it is expressed by not calling this endpoint at all, which is
 * what leaving the page means (#59).
 *
 * `researchParticipation: false` is honoured by writing **no row**, not a row meaning "no".
 *
 * Not audited: `identity_consents` is itself the durable record, and #65 kept audit for submit
 * alone. The fail-closed artifact path inside the domain keeps its own audit event.
 */
const body = z.strictObject({
  privacyNotice: z.literal(true),
  researchParticipation: z.boolean(),
})

export default definePolicyHandler({
  resource: 'ownProfile',
  action: 'create',
  handler: async (event, principal, { db }) => {
    const input = body.parse(await readBody(event))
    return recordConsent(db, {
      userId: principal.userId,
      plan: {
        privacyNotice: input.privacyNotice,
        researchParticipation: input.researchParticipation,
      },
    })
  },
})
