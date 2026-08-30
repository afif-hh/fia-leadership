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
import assessmentPrivacyNoticeV1Id from './assessment-privacy-notice/v1.md?raw'
import assessmentPrivacyNoticeV1En from './assessment-privacy-notice/v1.en.md?raw'
import researchParticipationV1Id from './research-participation/v1.md?raw'
import researchParticipationV1En from './research-participation/v1.en.md?raw'

import { DEFAULT_LOCALE, LOCALES, type Locale } from '../db/schema/locale.ts'

export const POLICY_IDS = ['assessment-privacy-notice', 'research-participation'] as const
export type PolicyId = (typeof POLICY_IDS)[number]

/**
 * `assessment-privacy-notice` gates `start`; `research-participation` never does. Refusing the
 * research opt-in has to be survivable, or it is not consent (#59).
 */
export const MANDATORY_POLICY_ID: PolicyId = 'assessment-privacy-notice'

/**
 * Every version ever released, keyed by version string and then by language. Entries are
 * append-only.
 *
 * A version is one document in several languages, not several documents: `v1` names the same
 * decision whichever language a student read it in, which is why consent is recorded once per
 * `(policy, version)` and the language is a column beside it rather than part of its identity.
 *
 * Every version must carry `DEFAULT_LOCALE`. A translation may be missing and the reader falls
 * back to Indonesian; the Indonesian text going missing is a version nobody can be shown at all,
 * which `assertBaseLocalePresent` refuses at module load rather than at a student's request.
 */
export const POLICY_TEXT: Readonly<
  Record<PolicyId, Readonly<Record<string, Partial<Record<Locale, string>>>>>
> = {
  'assessment-privacy-notice': {
    v1: { id: assessmentPrivacyNoticeV1Id, en: assessmentPrivacyNoticeV1En },
  },
  'research-participation': {
    v1: { id: researchParticipationV1Id, en: researchParticipationV1En },
  },
}

/**
 * The languages a given version is actually available in, in `LOCALES` order.
 *
 * Used by the consent page to say which translations exist, and by the tests that assert a
 * released version never loses one.
 */
export function availableLocales(policyId: PolicyId, version: string): Locale[] {
  const texts = POLICY_TEXT[policyId]?.[version] ?? {}
  return LOCALES.filter((locale) => texts[locale] !== undefined)
}

for (const policyId of POLICY_IDS) {
  for (const [version, texts] of Object.entries(POLICY_TEXT[policyId])) {
    if (texts[DEFAULT_LOCALE] === undefined) {
      throw new Error(
        `Policy '${policyId}' version '${version}' has no ${DEFAULT_LOCALE} text, so it can be shown to nobody.`
      )
    }
  }
}

/** The version each document is currently served and gated at. */
export const CURRENT_POLICY_VERSION: Readonly<Record<PolicyId, string>> = {
  'assessment-privacy-notice': 'v1',
  'research-participation': 'v1',
}
