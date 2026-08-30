import { definePolicyHandler } from '../../../http/define-policy-handler.ts'
import {
  MANDATORY_POLICY_ID,
  getPolicyArtifact,
  hasLiveConsent,
  renderPolicyHtml,
} from '../../../domain/identity/index.ts'

/**
 * The documents the consent page renders, and whether this student already holds each (#59, #72).
 *
 * Maps to the **Own Profile** row of rbac.md — a consent is a fact about the caller, and it is the
 * only row that describes one. The matrix has no Consent row of its own; if one is ever added,
 * this route moves with it.
 *
 * Markdown is rendered here rather than in the client: `marked` stays server-side, and the page
 * receives HTML it can insert directly. No sanitizer, per #72 — the content is Academic-Lead
 * authored and PR-reviewed, not runtime user input.
 */
export default definePolicyHandler({
  resource: 'ownProfile',
  action: 'read',
  handler: async (_event, principal, { db }) => {
    const [mandatory, research] = await Promise.all([
      getPolicyArtifact(MANDATORY_POLICY_ID),
      getPolicyArtifact('research-participation'),
    ])

    return {
      documents: [
        {
          policyId: mandatory.policyId,
          version: mandatory.version,
          required: true,
          html: renderPolicyHtml(mandatory.text),
          accepted: await hasLiveConsent(db, principal.userId, mandatory.policyId),
        },
        {
          policyId: research.policyId,
          version: research.version,
          required: false,
          html: renderPolicyHtml(research.text),
          accepted: await hasLiveConsent(db, principal.userId, research.policyId),
        },
      ],
    }
  },
})
