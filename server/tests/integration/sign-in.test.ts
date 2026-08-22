import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hashPassword } from 'better-auth/crypto'

import { identityAccount, identitySession, identityUser } from '../../db/schema/identity.ts'
import { buildAuth } from '../../utils/auth.ts'
import { createRolesRepository } from '../../domain/identity/roles.ts'
import { freshDb, type TestDb } from '../setup/db.ts'

/**
 * The end-to-end proof that the wiring works: a seeded credential account signs in through
 * better-auth, against the real schema, with the real adapter.
 *
 * Runs in Node against a local SQLite file, so it exercises everything except the Workers runtime
 * itself — which is the part no local test can reach.
 */
describe('sign-in through better-auth', () => {
  let t: TestDb
  let auth: ReturnType<typeof buildAuth>
  const email = 'lab.admin@fia.test'
  const password = 'correct-horse-battery-staple'

  beforeEach(async () => {
    t = await freshDb()
    auth = buildAuth({
      BETTER_AUTH_SECRET: 'test-secret-not-a-real-one',
      BETTER_AUTH_URL: 'http://localhost:3000',
      TURSO_DATABASE_URL: t.url,
    })

    const now = new Date()
    const userId = crypto.randomUUID()
    await t.db.insert(identityUser).values({
      id: userId,
      name: 'Lab Admin',
      email,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    })
    await t.db.insert(identityAccount).values({
      id: crypto.randomUUID(),
      issuer: 'local:credential',
      accountId: userId,
      providerId: 'credential',
      userId,
      password: await hashPassword(password),
      createdAt: now,
      updatedAt: now,
    })
    await createRolesRepository(t.db).setRoles({
      userId,
      roles: ['lab_admin'],
      actorUserId: userId,
    })
  })

  afterEach(async () => {
    await t.drop()
  })

  it('signs a seeded Lab Admin in', async () => {
    const result = await auth.api.signInEmail({ body: { email, password } })
    expect(result.user.email).toBe(email)
  })

  it('rejects a wrong password', async () => {
    await expect(
      auth.api.signInEmail({ body: { email, password: 'wrong-password-x' } })
    ).rejects.toThrow()
  })

  it('rejects an unknown email', async () => {
    await expect(
      auth.api.signInEmail({ body: { email: 'nobody@fia.test', password } })
    ).rejects.toThrow()
  })

  /** disableSignUp: this platform seeds and grants; it does not let people enrol themselves. */
  it('refuses self-service sign-up', async () => {
    await expect(
      auth.api.signUpEmail({
        body: { email: 'intruder@fia.test', password: 'another-long-password', name: 'Intruder' },
      })
    ).rejects.toThrow()
  })

  /**
   * Issue #38 decided neither value is retained. The columns exist only because better-auth's
   * adapter refuses to start without them, so this is the assertion that actually holds the
   * decision in place — if a future upgrade starts populating them, this fails.
   */
  it('stores no ip address and no user agent', async () => {
    await auth.api.signInEmail({ body: { email, password } })
    const rows = await t.db.select().from(identitySession)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.ipAddress ?? '').toBe('')
      expect(row.userAgent ?? '').toBe('')
    }
  })

  /** The projection is what makes authorization cost zero reads, so it has to reach the session. */
  it('carries the roles projection on the session user', async () => {
    const signIn = await auth.api.signInEmail({ body: { email, password }, asResponse: true })
    const cookie = signIn.headers.get('set-cookie')
    expect(cookie).toBeTruthy()

    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookie!.split(';')[0]! }),
    })
    expect((session as { user: { roles?: string } } | null)?.user.roles).toBe('lab_admin')
  })
})
