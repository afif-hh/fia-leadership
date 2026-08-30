import { marked } from 'marked'

import { CURRENT_POLICY_VERSION, POLICY_TEXT, type PolicyId } from '../../policies/manifest.ts'

/**
 * Resolving a policy document to the exact bytes a student agreed to.
 *
 * Lives in `identity` rather than `assessment` because `identity_consents` is the table these
 * artifacts are recorded against, and CLAUDE.md rule 12 keeps a domain's data behind its own
 * service interface. `assessment` calls in; it never reads the manifest itself.
 *
 * `policy_hash` is the load-bearing idea (#38, #59): a version string identifies a document only
 * if versions are truly immutable, and the realistic failure is a policy amended in place without
 * a version bump, after which the stored record attests to something unreconstructable. So the
 * hash is always derived here, from the bytes that shipped — a hash a human maintains is a hash a
 * human forgets, which would reintroduce exactly the failure the column exists to catch.
 */

export type { PolicyId }

export interface PolicyArtifact {
  policyId: PolicyId
  version: string
  hash: string
  text: string
}

/** Why a policy artifact could not be trusted. Both cases must fail closed (#59). */
export type PolicyArtifactFault = 'unresolvable' | 'hash_mismatch'

export class PolicyArtifactError extends Error {
  readonly policyId: PolicyId
  readonly expectedVersion: string
  readonly fault: PolicyArtifactFault

  constructor(policyId: PolicyId, expectedVersion: string, fault: PolicyArtifactFault) {
    super(
      fault === 'unresolvable'
        ? `No text is bundled for policy '${policyId}' version '${expectedVersion}'.`
        : `The stored hash for policy '${policyId}' version '${expectedVersion}' does not match the bundled text.`
    )
    this.name = 'PolicyArtifactError'
    this.policyId = policyId
    this.expectedVersion = expectedVersion
    this.fault = fault
  }
}

/**
 * Memoised per (policy, version). The bytes are fixed at build time, so the digest can only be
 * computed once — and `crypto.subtle` is the only hashing primitive available on both Workers and
 * Node without a dependency.
 */
const hashCache = new Map<string, Promise<string>>()

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The version of `policyId` currently in force. */
export function currentPolicyVersion(policyId: PolicyId): string {
  return CURRENT_POLICY_VERSION[policyId]
}

/**
 * Resolves one released version. Throws rather than returning null: a policy version that cannot
 * be resolved is a deploy that shipped a manifest entry without its file, and continuing would
 * mean collecting data under a notice nobody can reconstruct.
 */
export async function getPolicyArtifact(
  policyId: PolicyId,
  version: string = currentPolicyVersion(policyId)
): Promise<PolicyArtifact> {
  const text = POLICY_TEXT[policyId]?.[version]
  if (text === undefined) throw new PolicyArtifactError(policyId, version, 'unresolvable')

  const key = `${policyId}@${version}`
  let hash = hashCache.get(key)
  if (!hash) {
    hash = sha256Hex(text)
    hashCache.set(key, hash)
  }

  return { policyId, version, hash: await hash, text }
}

/**
 * Markdown to HTML for the consent page (#72).
 *
 * No sanitizer, deliberately: this content is Academic-Lead-authored and arrives through PR
 * review, not from a runtime user, so it does not carry the trust profile sanitization defends
 * against. `marked` is called synchronously — the async overloads are only needed for async
 * extensions, and none are registered.
 */
export function renderPolicyHtml(text: string): string {
  return marked.parse(text, { async: false })
}
