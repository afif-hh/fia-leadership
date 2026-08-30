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
  'assessment.session_submitted',
  'assessment.scoring_version_created',
  'assessment.scoring_version_approved',
  'assessment.scoring_version_retired',
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
  /**
   * The one audited action in the taking flow (#65), and already on rbac.md's mandatory list.
   *
   * Start, autosave and a successful consent acceptance are deliberately **not** audited: each
   * already has its own durable record (the session row, the response row, `identity_consents`),
   * and an audited autosave would write a row per item per student for no investigative gain.
   *
   * `item_count` rather than the items themselves, and no answers at any price — this is the
   * table the PII Rule protects hardest, because `audit_logs` is append-only and a leak into it
   * can never be taken back out.
   */
  z.strictObject({
    event_type: z.literal('assessment.session_submitted'),
    session_id: z.string(),
    version_id: z.string(),
    item_count: z.number(),
  }),
  /**
   * The three scoring-configuration events. rbac.md's mandatory audit list names "Ubah scoring
   * config" outright, and unlike the version events these are audited for what they authorise
   * rather than for being irreversible: approving a formula is the moment a threshold starts
   * deciding what a student is told about themselves, and `/CLAUDE.md` rule 1 puts that decision
   * in one named person's hands. The audit row is where that name is kept.
   *
   * `rule_count` rather than the rules: a weight is not personal data, but the same discipline
   * applies for the same reason it does above — `audit_logs` is append-only, so anything written
   * into it can never be taken back out.
   */
  z.strictObject({
    event_type: z.literal('assessment.scoring_version_created'),
    scoring_version_id: z.string(),
    version_id: z.string(),
    scoring_no: z.number(),
    rule_count: z.number(),
  }),
  z.strictObject({
    event_type: z.literal('assessment.scoring_version_approved'),
    scoring_version_id: z.string(),
    version_id: z.string(),
    scoring_no: z.number(),
  }),
  z.strictObject({
    event_type: z.literal('assessment.scoring_version_retired'),
    scoring_version_id: z.string(),
    version_id: z.string(),
    scoring_no: z.number(),
  }),
])

export type AssessmentAuditDetail = z.infer<typeof assessmentAuditDetail>

/** Validates the detail and brands the event type, so an unregistered event cannot be appended. */
export function assessmentAuditEvent(detail: AssessmentAuditDetail) {
  const parsed = assessmentAuditDetail.parse(detail)
  return { eventType: asAuditEventType(parsed.event_type), detail: parsed }
}
