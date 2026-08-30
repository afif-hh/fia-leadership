import * as z from 'zod/mini'

import { asAuditEventType } from '../platform/index.ts'

/**
 * The `profile` domain's audit vocabulary. One member, and the restraint is the point.
 *
 * An initial score is not audited: the `profile_score_runs` row is already an append-only,
 * timestamped, version-stamped record of exactly that event, and a second copy in `audit_logs`
 * would add a row per student per assessment with nothing to investigate. #65 made the same call
 * about autosave for the same reason.
 *
 * A rescore is audited, because it is a person deciding that a result a student has already seen
 * must be recomputed. `observability.md`'s incident-scoring procedure requires that trail.
 *
 * Ids only. No score value, no dimension, no band — `audit_logs` is append-only, so anything
 * written into it can never be taken back out (the PII Rule).
 */

export const PROFILE_AUDIT_EVENT_TYPES = ['profile.session_rescored'] as const
export type ProfileAuditEventType = (typeof PROFILE_AUDIT_EVENT_TYPES)[number]

export const profileAuditDetail = z.discriminatedUnion('event_type', [
  z.strictObject({
    event_type: z.literal('profile.session_rescored'),
    score_run_id: z.string(),
    session_id: z.string(),
    assessment_version_id: z.string(),
    scoring_version_id: z.string(),
  }),
])

export type ProfileAuditDetail = z.infer<typeof profileAuditDetail>

/** Validates the detail and brands the event type, so an unregistered event cannot be appended. */
export function profileAuditEvent(detail: ProfileAuditDetail) {
  const parsed = profileAuditDetail.parse(detail)
  return { eventType: asAuditEventType(parsed.event_type), detail: parsed }
}
