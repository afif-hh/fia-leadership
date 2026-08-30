import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { identityConsents } from '../../db/schema/identity'
import {
  getPolicyArtifact,
  recordConsent,
  resolveConsentForStart,
} from '../../domain/identity/index'
import { freshDb, insertUser, type TestDb } from '../setup/db'

/**
 * Consent, and the language the student actually read it in.
 *
 * `policy_hash` already distinguishes the two renderings — they are different bytes — so the
 * column is not what makes the record correct. What makes it correct is that both are written
 * from the *resolved* artifact: recording the requested language while hashing the shown one
 * would produce a row whose two halves contradict each other, and the gate reads both.
 */
describe('consent in a second language', () => {
  let t: TestDb

  beforeEach(async () => {
    t = await freshDb()
  })
  afterEach(() => t.drop())

  const rowFor = async (userId: string) =>
    (await t.db.select().from(identityConsents).where(eq(identityConsents.userId, userId)))[0]

  it('records the language shown and the hash of that language, together', async () => {
    const userId = await insertUser(t.db)
    await recordConsent(t.db, {
      userId,
      plan: { privacyNotice: true, researchParticipation: false },
      locale: 'en',
    })

    const english = await getPolicyArtifact('assessment-privacy-notice', undefined, 'en')
    const row = await rowFor(userId)
    expect(row?.policyLocale).toBe('en')
    expect(row?.policyHash).toBe(english.hash)
  })

  it('gives the two languages different hashes, which is why the column is not the only signal', async () => {
    const indonesian = await getPolicyArtifact('assessment-privacy-notice', undefined, 'id')
    const english = await getPolicyArtifact('assessment-privacy-notice', undefined, 'en')
    expect(english.hash).not.toBe(indonesian.hash)
  })

  it('defaults to Indonesian when the caller names no language', async () => {
    const userId = await insertUser(t.db)
    await recordConsent(t.db, {
      userId,
      plan: { privacyNotice: true, researchParticipation: false },
    })

    const row = await rowFor(userId)
    expect(row?.policyLocale).toBe('id')
    expect(row?.policyHash).toBe(
      (await getPolicyArtifact('assessment-privacy-notice', undefined, 'id')).hash
    )
  })

  it('opens the gate for a student who consented in either language', async () => {
    // Reading in one language and answering in the other is not a second decision, and must not
    // be reported as a hash mismatch — which fails closed and would lock a student out.
    for (const locale of ['id', 'en'] as const) {
      const userId = await insertUser(t.db, { email: `${locale}@example.test` })
      await recordConsent(t.db, {
        userId,
        plan: { privacyNotice: true, researchParticipation: false },
        locale,
      })

      await expect(resolveConsentForStart(t.db, userId)).resolves.toEqual({ policyVersion: 'v1' })
    }
  })

  it('records one consent per version, whichever language it was read in', async () => {
    // Consent is given once per version. Re-accepting after switching language is a network
    // retry or a second visit, not a second decision, so it must not create a second row.
    const userId = await insertUser(t.db)
    const plan = { privacyNotice: true, researchParticipation: false } as const
    await recordConsent(t.db, { userId, plan, locale: 'id' })
    await recordConsent(t.db, { userId, plan, locale: 'en' })

    const rows = await t.db
      .select()
      .from(identityConsents)
      .where(eq(identityConsents.userId, userId))
    expect(rows).toHaveLength(1)
    // The first acceptance stands: it is the one that actually happened.
    expect(rows[0]?.policyLocale).toBe('id')
  })
})
