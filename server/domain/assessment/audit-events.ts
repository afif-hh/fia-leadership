import * as z from 'zod/mini'

import { asAuditEventType } from '../platform/index.ts'

/**
 * The `assessment` domain's audit vocabulary. See the note in `identity/audit-events.ts` for why
 * every domain owns its own module like this one, and why every member is a `z.strictObject`.
 *
 * No item stems, no scale points, no answer content in any detail payload — the PII Rule. Every
 * member below carries only ids and counts.
 */

export const ASSESSMENT_AUDIT_EVENT_TYPES = [
  'assessment.version_created',
  'assessment.version_published',
  'assessment.version_retired',
] as const
export type AssessmentAuditEventType = (typeof ASSESSMENT_AUDIT_EVENT_TYPES)[number]

export const assessmentAuditDetail = z.discriminatedUnion('event_type', [
  z.strictObject({
    event_type: z.literal('assessment.version_created'),
    version_id: z.string(),
    version_no: z.number(),
    source_version_id: z.nullable(z.string()),
    cloned_item_count: z.number(),
  }),
  z.strictObject({
    event_type: z.literal('assessment.version_published'),
    version_id: z.string(),
    version_no: z.number(),
  }),
  z.strictObject({
    event_type: z.literal('assessment.version_retired'),
    version_id: z.string(),
    version_no: z.number(),
  }),
])

export type AssessmentAuditDetail = z.infer<typeof assessmentAuditDetail>

/** Validates the detail and brands the event type, so an unregistered event cannot be appended. */
export function assessmentAuditEvent(detail: AssessmentAuditDetail) {
  const parsed = assessmentAuditDetail.parse(detail)
  return { eventType: asAuditEventType(parsed.event_type), detail: parsed }
}
