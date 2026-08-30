import * as z from 'zod/mini'

import { ROLE_CODES } from '../../db/schema/identity.ts'
import { asAuditEventType } from '../platform/index.ts'

/**
 * The `identity` domain's audit vocabulary. Each domain owns its own module like this one; a
 * repo-wide test asserts values are unique across domains and that every value's prefix matches
 * the folder that declares it. See issue #28 and its amendment.
 *
 * Only one event is reachable from what this map builds: a role change, on
 * IdentityService.setRoles(). Authentication events and audit-log reads were considered and
 * declined (issue #20).
 */

export const IDENTITY_AUDIT_EVENT_TYPES = [
  'identity.role_change',
  'identity.consent_artifact_invalid',
] as const
export type IdentityAuditEventType = (typeof IDENTITY_AUDIT_EVENT_TYPES)[number]

const roleCode = z.enum(ROLE_CODES)

/**
 * Every member is a `z.strictObject`, which under `zod/mini` is the only strict form — `.strict()`
 * does not exist there. Strictness is load-bearing rather than stylistic: a plain `z.object()`
 * *strips* unknown keys, so a stray `answer_value` would never land in the row but the attempt to
 * log it would be invisible. On an append-only table there is no UPDATE to take a PII leak back
 * out, so a PII-RULE violation would be permanent by construction. Rejecting makes the attempt
 * loud; stripping makes it silent.
 *
 * `event_type` is repeated inside the detail because `discriminatedUnion` needs a discriminator
 * in the object it validates. It duplicates the column of the same name, deliberately.
 */
export const identityAuditDetail = z.discriminatedUnion('event_type', [
  z.strictObject({
    event_type: z.literal('identity.role_change'),
    before: z.array(roleCode),
    after: z.array(roleCode),
  }),
  /**
   * A consent gate refused to open because the policy artifact could not be trusted (#59) —
   * either no text is bundled for the version in force, or a stored acceptance's hash no longer
   * matches the bundled bytes, which is the "amended in place without a version bump" failure
   * `policy_hash` exists to catch.
   *
   * Carries no policy text and no hash: an operator needs to know *which document, which version,
   * and which way it broke* to go and look, and a digest in an append-only row is a value that
   * can never be corrected if the artifact is later fixed.
   */
  z.strictObject({
    event_type: z.literal('identity.consent_artifact_invalid'),
    policy_id: z.string(),
    expected_version: z.string(),
    fault: z.enum(['unresolvable', 'hash_mismatch']),
  }),
])

export type IdentityAuditDetail = z.infer<typeof identityAuditDetail>

/** Validates the detail and brands the event type, so an unregistered event cannot be appended. */
export function identityAuditEvent(detail: IdentityAuditDetail) {
  const parsed = identityAuditDetail.parse(detail)
  return { eventType: asAuditEventType(parsed.event_type), detail: parsed }
}
