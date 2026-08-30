import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { identityConsents } from '../../db/schema/identity'
import { auditLogs } from '../../db/schema/platform'
import {
  ConsentRequiredError,
  PolicyArtifactError,
  getPolicyArtifact,
  hasLiveConsent,
  recordConsent,
  renderPolicyHtml,
  resolveConsentForStart,
} from '../../domain/identity'
import { POLICY_TEXT } from '../../policies/manifest'
import { freshDb, insertUser, type TestDb } from '../setup/db'
import { rejectionOf } from '../setup/rejection'

describe('consent gate', () => {
  let t: TestDb
  let userId: string
  beforeEach(async () => {
    t = await freshDb()
    userId = await insertUser(t.db)
  })
  afterEach(async () => {
    await t.drop()
  })

  const consentRows = () =>
    t.db.select().from(identityConsents).where(eq(identityConsents.userId, userId))

  describe('the policy artifact', () => {
    /**
     * The point of `policy_hash` (#38, #59): a version string identifies a document only if
     * versions are immutable, and the failure it exists to catch is a policy amended in place
     * without a version bump. A hash a human maintains is a hash a human forgets, so this asserts
     * it is derived from the shipped bytes and nothing else.
     */
    it('derives the hash from the bundled bytes rather than a stored constant', async () => {
      const artifact = await getPolicyArtifact('assessment-privacy-notice')
      const bytes = new TextEncoder().encode(POLICY_TEXT['assessment-privacy-notice']!.v1!.id!)
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      const expected = [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      expect(artifact.hash).toBe(expected)
    })

    it('refuses a version that has no bundled text', async () => {
      // A deploy that shipped a manifest entry without its file. Continuing would mean collecting
      // data under a notice nobody can reconstruct.
      await expect(getPolicyArtifact('assessment-privacy-notice', 'v99')).rejects.toThrow(
        PolicyArtifactError
      )
    })

    it('renders markdown to html for the consent page', () => {
      const html = renderPolicyHtml('# Judul\n\nParagraf.')
      expect(html).toContain('<p>Paragraf.</p>')
    })

    /**
     * Each `.md` is a valid standalone document and opens with `#`, but the consent page already
     * has its own `<h1>` and gives each document an `<h2>` section heading. Rendering `#`
     * verbatim put three `<h1>`s on one page, with a document heading nested under an `<h2>` — a
     * broken outline for anyone navigating by heading level. Caught by reading the rendered
     * page's outline; axe does not flag it, and no source-level grep could.
     */
    it('pushes document headings below the page’s own heading levels', () => {
      const html = renderPolicyHtml('# Judul\n\n## Bagian\n\nParagraf.')

      expect(html).not.toContain('<h1')
      expect(html).not.toContain('<h2')
      expect(html).toContain('<h3>Judul</h3>')
      expect(html).toContain('<h4>Bagian</h4>')
    })

    it('clamps at h6 rather than emitting a tag no browser understands', () => {
      const html = renderPolicyHtml('##### Dalam\n\n###### Lebih dalam')
      expect(html).toContain('<h6>Dalam</h6>')
      expect(html).toContain('<h6>Lebih dalam</h6>')
      expect(html).not.toMatch(/<h[7-9]/)
    })

    it('keeps the real privacy notice free of h1 and h2', () => {
      // The committed document, not a synthetic one — this is the thing the page actually renders.
      const html = renderPolicyHtml(POLICY_TEXT['assessment-privacy-notice']!.v1!.id!)
      expect(html).not.toMatch(/<h[12][\s>]/)
      expect(html).toContain('<h3>')
    })
  })

  describe('recording', () => {
    it('writes no research row when the opt-in is refused', async () => {
      // Refusing has to be survivable or it is not consent (#59), and a refusal is the *absence*
      // of a row rather than a row meaning "no" — which is what keeps the research domain's
      // eligibility filter a simple "has a live row".
      await recordConsent(t.db, {
        userId,
        plan: { privacyNotice: true, researchParticipation: false },
      })

      const rows = await consentRows()
      expect(rows.map((r) => r.policyId)).toEqual(['assessment-privacy-notice'])
    })

    it('writes both rows when the opt-in is accepted', async () => {
      await recordConsent(t.db, {
        userId,
        plan: { privacyNotice: true, researchParticipation: true },
      })

      const rows = await consentRows()
      expect(rows.map((r) => r.policyId).sort()).toEqual([
        'assessment-privacy-notice',
        'research-participation',
      ])
    })

    it('stores the artifact hash, not a hand-supplied one', async () => {
      await recordConsent(t.db, {
        userId,
        plan: { privacyNotice: true, researchParticipation: false },
      })
      const artifact = await getPolicyArtifact('assessment-privacy-notice')
      const rows = await consentRows()

      expect(rows[0]!.policyHash).toBe(artifact.hash)
      expect(rows[0]!.withdrawnAt).toBeNull()
    })

    it('treats a resubmitted form as a no-op rather than an error', async () => {
      // A double-submitted consent form is a network retry, not something the student should see
      // a unique-constraint failure for.
      const plan = { privacyNotice: true, researchParticipation: true } as const
      await recordConsent(t.db, { userId, plan })
      await expect(recordConsent(t.db, { userId, plan })).resolves.toBeDefined()

      expect(await consentRows()).toHaveLength(2)
    })
  })

  describe('hasLiveConsent', () => {
    it('is false before anything is accepted', async () => {
      expect(await hasLiveConsent(t.db, userId, 'research-participation')).toBe(false)
    })

    it('is true once accepted', async () => {
      await recordConsent(t.db, {
        userId,
        plan: { privacyNotice: true, researchParticipation: true },
      })
      expect(await hasLiveConsent(t.db, userId, 'research-participation')).toBe(true)
    })

    it('is false again once withdrawn, and the row survives', async () => {
      // Withdrawal never deletes: the row still attests truthfully that consent was given, and
      // additionally that it was revoked. Erasing it would leave the platform holding assessment
      // data with no surviving proof it was permitted to collect it (#59).
      await recordConsent(t.db, {
        userId,
        plan: { privacyNotice: true, researchParticipation: true },
      })
      await t.db
        .update(identityConsents)
        .set({ withdrawnAt: new Date() })
        .where(eq(identityConsents.policyId, 'research-participation'))

      expect(await hasLiveConsent(t.db, userId, 'research-participation')).toBe(false)
      expect(await consentRows()).toHaveLength(2)
    })
  })

  describe('resolveConsentForStart', () => {
    it('refuses, unaudited, when the student has not consented yet', async () => {
      // Ordinary and expected — the caller sends them to the consent page. A student who has not
      // consented is not an incident, so this must not write an audit row.
      await expect(resolveConsentForStart(t.db, userId)).rejects.toThrow(ConsentRequiredError)
      expect(await t.db.select().from(auditLogs)).toHaveLength(0)
    })

    it('returns the version in force once accepted', async () => {
      await recordConsent(t.db, {
        userId,
        plan: { privacyNotice: true, researchParticipation: false },
      })
      await expect(resolveConsentForStart(t.db, userId)).resolves.toEqual({ policyVersion: 'v1' })
    })

    it('is unaffected by refusing the research opt-in', async () => {
      await recordConsent(t.db, {
        userId,
        plan: { privacyNotice: true, researchParticipation: false },
      })
      await expect(resolveConsentForStart(t.db, userId)).resolves.toBeDefined()
    })

    /**
     * The failure `policy_hash` was added for: the document was amended in place without a version
     * bump, so the stored acceptance attests to text that no longer exists. It must never be
     * treated as consent, and it must fail **closed** — no session starts.
     */
    it('fails closed and audits when the stored hash no longer matches the bundled text', async () => {
      await recordConsent(t.db, {
        userId,
        plan: { privacyNotice: true, researchParticipation: false },
      })
      await t.db
        .update(identityConsents)
        .set({ policyHash: 'a-hash-from-a-document-that-was-edited-in-place' })
        .where(eq(identityConsents.policyId, 'assessment-privacy-notice'))

      const error = await rejectionOf(resolveConsentForStart(t.db, userId), PolicyArtifactError)
      expect(error.fault).toBe('hash_mismatch')

      const audits = await t.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.eventType, 'identity.consent_artifact_invalid'))
      expect(audits).toHaveLength(1)
      expect(audits[0]!.actorUserId).toBe(userId)
      expect(JSON.parse(audits[0]!.detail!)).toEqual({
        event_type: 'identity.consent_artifact_invalid',
        policy_id: 'assessment-privacy-notice',
        expected_version: 'v1',
        fault: 'hash_mismatch',
      })
    })

    it('records no policy text or hash in the audit detail', async () => {
      // audit_logs is append-only, so anything that lands there can never be taken back out.
      await recordConsent(t.db, {
        userId,
        plan: { privacyNotice: true, researchParticipation: false },
      })
      await t.db
        .update(identityConsents)
        .set({ policyHash: 'mismatched' })
        .where(eq(identityConsents.policyId, 'assessment-privacy-notice'))
      await resolveConsentForStart(t.db, userId).catch(() => undefined)

      const audits = await t.db.select().from(auditLogs)
      const detail = audits[0]!.detail!
      expect(detail).not.toContain('Pemberitahuan Privasi')
      expect(detail).not.toContain('mismatched')
    })
  })
})
