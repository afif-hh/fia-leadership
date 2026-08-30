import { getRouterParam } from 'h3'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { startSession } from '../../../../../domain/assessment/index.ts'
import { resolveConsentForStart } from '../../../../../domain/identity/index.ts'

/**
 * Starts a session on a published version, or returns the one already in flight (#64).
 *
 * Maps to the **Own Assessment** row of rbac.md. A student's cell is `CRUD`, so this resolves to
 * an unconditional `allow` and never reaches a scope predicate — row ownership is enforced in the
 * service, which is the only place that can (see the note in `domain/assessment/taking.ts`).
 *
 * The consent gate runs first and belongs to `identity`: this route never reads
 * `identity_consents` itself (CLAUDE.md rule 12). A `ConsentRequiredError` becomes a 409 telling
 * the client to send the student to the consent page; an unresolvable or tampered policy artifact
 * throws instead, which fails the request closed rather than starting a session under a notice
 * nobody can reconstruct (#59).
 *
 * Not audited: the session row is its own durable record (#65).
 *
 * Returns the whole item set in one payload rather than a page, because #60's single-scrolling-page
 * layout gives the client no way to ask for more.
 */
export default definePolicyHandler({
  resource: 'ownAssessment',
  action: 'create',
  domain: 'assessment',
  handler: async (event, principal, { db }) => {
    const versionId = getRouterParam(event, 'versionId') ?? ''
    const { policyVersion } = await resolveConsentForStart(db, principal.userId)

    return startSession(db, {
      userId: principal.userId,
      versionId,
      consentPolicyVersion: policyVersion,
    })
  },
})
