import { and, eq, isNull } from 'drizzle-orm'

import { identityConsents } from '../../db/schema/identity.ts'
import type { ConsentMethod } from '../../db/schema/identity.ts'
import { DEFAULT_LOCALE, type Locale } from '../../db/schema/locale.ts'
import { MANDATORY_POLICY_ID, type PolicyId } from '../../policies/manifest.ts'
import { createAuditRepository } from '../platform/index.ts'
import { identityAuditEvent } from './audit-events.ts'
import { PolicyArtifactError, currentPolicyVersion, getPolicyArtifact } from './policy-documents.ts'
import type { Db } from '../../db/client.ts'

/**
 * Recording and checking consent — `identity`'s public surface for the gate that sits in front of
 * `assessment`'s `start` (#59). `assessment` calls these; it never touches `identity_consents`.
 */

export { MANDATORY_POLICY_ID }

/** The gate refused because this user has not accepted the version currently in force. */
export class ConsentRequiredError extends Error {
  readonly policyId: PolicyId
  readonly version: string

  constructor(policyId: PolicyId, version: string) {
    super(`Consent to '${policyId}' version '${version}' is required.`)
    this.name = 'ConsentRequiredError'
    this.policyId = policyId
    this.version = version
  }
}

export interface AcceptancePlan {
  /** Always accepted — the gate does not open without it. */
  privacyNotice: true
  /** The optional opt-in. `false` records nothing, which is what refusing means. */
  researchParticipation: boolean
}

/**
 * Records a consent decision. One transaction: either both documents' rows land or neither does,
 * so a student can never end up gated by a half-written acceptance (#59).
 *
 * Refusing `research-participation` writes **no row at all**, rather than a row meaning "no".
 * `identity_consents` is a record of consents *given*; a refusal is the absence of one, and
 * writing "declined" rows would make the research domain's eligibility filter read as
 * "has a row" instead of the simpler, harder-to-get-wrong "has a live row".
 *
 * `locale` is the language the consent page **rendered**, and the row records the language the
 * artifact actually resolved to — which is not always the one asked for, because an untranslated
 * version falls back to Indonesian. Storing the request instead of the resolution would file an
 * Indonesian acceptance as an English one, and the hash beside it would then contradict the
 * column claiming to describe it.
 */
export async function recordConsent(
  db: Db,
  {
    userId,
    plan,
    method = 'web_form',
    locale = DEFAULT_LOCALE,
  }: { userId: string; plan: AcceptancePlan; method?: ConsentMethod; locale?: Locale }
): Promise<{ privacyNoticeVersion: string; privacyNoticeLocale: Locale }> {
  const privacy = await getPolicyArtifact(MANDATORY_POLICY_ID, undefined, locale)
  const research = plan.researchParticipation
    ? await getPolicyArtifact('research-participation', undefined, locale)
    : null

  const acceptedAt = new Date()
  const rows = [privacy, ...(research ? [research] : [])].map((artifact) => ({
    id: crypto.randomUUID(),
    userId,
    policyId: artifact.policyId,
    policyVersion: artifact.version,
    policyLocale: artifact.locale,
    policyHash: artifact.hash,
    acceptedAt,
    method,
    withdrawnAt: null,
  }))

  await db.transaction(async (tx) => {
    for (const row of rows) {
      // Re-accepting the same version is a no-op rather than a unique-constraint failure: a
      // double-submitted consent form is a network retry, not an error the student should see.
      await tx
        .insert(identityConsents)
        .values(row)
        .onConflictDoNothing({
          target: [
            identityConsents.userId,
            identityConsents.policyId,
            identityConsents.policyVersion,
          ],
        })
    }
  })

  return { privacyNoticeVersion: privacy.version, privacyNoticeLocale: privacy.locale }
}

/**
 * Whether this user holds a live acceptance of `policyId`'s current version.
 *
 * "Live" means accepted and not withdrawn. Only `research-participation` is ever withdrawable, so
 * for the mandatory notice the `withdrawn_at` clause is always satisfied — it is written anyway,
 * because a filter that silently depends on which document it is asked about is the kind of thing
 * that stops being true when a second withdrawable document appears.
 */
export async function hasLiveConsent(db: Db, userId: string, policyId: PolicyId): Promise<boolean> {
  const version = currentPolicyVersion(policyId)
  const rows = await db
    .select({ id: identityConsents.id })
    .from(identityConsents)
    .where(
      and(
        eq(identityConsents.userId, userId),
        eq(identityConsents.policyId, policyId),
        eq(identityConsents.policyVersion, version),
        isNull(identityConsents.withdrawnAt)
      )
    )
    .limit(1)

  return rows.length > 0
}

/**
 * The gate itself. Returns the version to stamp onto the session; throws otherwise.
 *
 * Three outcomes, and the difference between them matters:
 *
 * - **No acceptance row** → `ConsentRequiredError`. Ordinary and expected; the caller sends the
 *   student to the consent page. Not audited — a student who has not consented yet is not an
 *   incident.
 * - **Artifact unresolvable** → `PolicyArtifactError`, audited. The deploy shipped a manifest
 *   entry without its text.
 * - **Stored hash ≠ bundled hash** → `PolicyArtifactError`, audited. The document was amended in
 *   place without a version bump, so the stored acceptance attests to text that no longer exists.
 *   This is the failure `policy_hash` was added for, and it must never be treated as consent.
 *
 * The hash is checked against the artifact for the **stored** locale, never the one the current
 * request happens to be reading in. A student who consented in Indonesian and later browses in
 * English has not consented to anything different, and comparing against the English bytes would
 * report that as tampering — a false alarm that fails closed and locks them out of their own
 * assessment.
 *
 * Both artifact faults fail **closed** (#59): no session starts, because starting would mean
 * collecting data under a notice nobody can reconstruct.
 */
export async function resolveConsentForStart(
  db: Db,
  userId: string
): Promise<{ policyVersion: string }> {
  const version = currentPolicyVersion(MANDATORY_POLICY_ID)

  // Resolvability is checked before the row lookup, and deliberately so: a deploy that shipped a
  // manifest entry without its text is an incident for every student, including one who has not
  // consented yet, and reporting it as "please consent" would send them to a page that cannot
  // render either. Unchanged from before the notice became bilingual.
  try {
    await getPolicyArtifact(MANDATORY_POLICY_ID, version)
  } catch (error) {
    if (error instanceof PolicyArtifactError) await auditArtifactFault(db, userId, error)
    throw error
  }

  const rows = await db
    .select({
      policyHash: identityConsents.policyHash,
      policyLocale: identityConsents.policyLocale,
    })
    .from(identityConsents)
    .where(
      and(
        eq(identityConsents.userId, userId),
        eq(identityConsents.policyId, MANDATORY_POLICY_ID),
        eq(identityConsents.policyVersion, version),
        isNull(identityConsents.withdrawnAt)
      )
    )
    .limit(1)

  const accepted = rows[0]
  if (!accepted) throw new ConsentRequiredError(MANDATORY_POLICY_ID, version)

  // Against the language this student read, not the one this request is being made in.
  let acceptedArtifact
  try {
    acceptedArtifact = await getPolicyArtifact(MANDATORY_POLICY_ID, version, accepted.policyLocale)
  } catch (error) {
    if (error instanceof PolicyArtifactError) await auditArtifactFault(db, userId, error)
    throw error
  }

  if (accepted.policyHash !== acceptedArtifact.hash) {
    const fault = new PolicyArtifactError(MANDATORY_POLICY_ID, version, 'hash_mismatch')
    await auditArtifactFault(db, userId, fault)
    throw fault
  }

  return { policyVersion: version }
}

async function auditArtifactFault(db: Db, userId: string, error: PolicyArtifactError) {
  await createAuditRepository(db).append({
    ...identityAuditEvent({
      event_type: 'identity.consent_artifact_invalid',
      policy_id: error.policyId,
      expected_version: error.expectedVersion,
      fault: error.fault,
    }),
    actorUserId: userId,
  })
}
