import { definePolicyHandler } from '../../../http/define-policy-handler.ts'
import { listTakeableVersions } from '../../../domain/assessment/index.ts'

/**
 * The student's assessment list (#61) — one row per version, scoped to the caller.
 *
 * Maps to the **Own Assessment** row of rbac.md: this is a list of the caller's own standing with
 * each version, not a catalogue of instruments. The authoring list
 * (`/api/v1/assessment/instruments`) maps to Assessment Configuration and is closed to students,
 * which is exactly why this exists rather than being folded into it.
 *
 * `principal.userId` is the only source of the identity narrowed on — never a query parameter, so
 * there is no id for a caller to swap for someone else's.
 */
export default definePolicyHandler({
  resource: 'ownAssessment',
  action: 'read',
  domain: 'assessment',
  handler: async (_event, principal, { db }) => ({
    versions: await listTakeableVersions(db, principal.userId),
  }),
})
