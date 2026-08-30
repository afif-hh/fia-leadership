import { definePolicyHandler } from '../../../http/define-policy-handler.ts'
import { requestLocale } from '../../../http/request-locale.ts'
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
  handler: async (event, principal, { db }) => {
    const locale = requestLocale(event)
    const [mandatory, research] = await Promise.all([
      getPolicyArtifact(MANDATORY_POLICY_ID, undefined, locale),
      getPolicyArtifact('research-participation', undefined, locale),
    ])

    // `locale` on each document is the language it *resolved* to, which is Indonesian when that
    // version has no translation. The page marks a fallback with `lang` so a screen reader does
    // not read Indonesian prose in an English voice, and so the student can see which language
    // they are agreeing in.
    return {
      documents: [
        {
          policyId: mandatory.policyId,
          version: mandatory.version,
          locale: mandatory.locale,
          required: true,
          html: renderPolicyHtml(mandatory.text),
          accepted: await hasLiveConsent(db, principal.userId, mandatory.policyId),
        },
        {
          policyId: research.policyId,
          version: research.version,
          locale: research.locale,
          required: false,
          html: renderPolicyHtml(research.text),
          accepted: await hasLiveConsent(db, principal.userId, research.policyId),
        },
      ],
    }
  },
})
