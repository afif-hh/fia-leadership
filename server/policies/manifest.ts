/**
 * The policy documents, and which version of each is currently in force.
 *
 * #59 settled that the text lives as one repo file per `(policy_id, version)` and that publishing
 * a version is a deploy — so this manifest is the deploy artifact, and a released file is never
 * edited in place. Adding v2 means adding a file and an entry here, never touching v1.
 *
 * The `?raw` imports are not a stylistic choice. The deploy target is Cloudflare Workers
 * (`nitro.preset: 'cloudflare_module'`), which has no filesystem, so a runtime `readFile` would
 * work in tests and fail in production. Importing inlines the bytes at build time, which is also
 * what lets `policy_hash` be derived from exactly the bytes that shipped.
 */
import assessmentPrivacyNoticeV1 from './assessment-privacy-notice/v1.md?raw'
import researchParticipationV1 from './research-participation/v1.md?raw'

export const POLICY_IDS = ['assessment-privacy-notice', 'research-participation'] as const
export type PolicyId = (typeof POLICY_IDS)[number]

/**
 * `assessment-privacy-notice` gates `start`; `research-participation` never does. Refusing the
 * research opt-in has to be survivable, or it is not consent (#59).
 */
export const MANDATORY_POLICY_ID: PolicyId = 'assessment-privacy-notice'

/** Every version ever released, keyed by version string. Entries are append-only. */
export const POLICY_TEXT: Readonly<Record<PolicyId, Readonly<Record<string, string>>>> = {
  'assessment-privacy-notice': { v1: assessmentPrivacyNoticeV1 },
  'research-participation': { v1: researchParticipationV1 },
}

/** The version each document is currently served and gated at. */
export const CURRENT_POLICY_VERSION: Readonly<Record<PolicyId, string>> = {
  'assessment-privacy-notice': 'v1',
  'research-participation': 'v1',
}
