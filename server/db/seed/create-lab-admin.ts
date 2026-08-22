import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'

import * as identity from '../schema/identity.ts'
import * as platform from '../schema/platform.ts'
import { createRolesRepository } from '../../domain/identity/roles.ts'
import type { Db } from '../client.ts'

/**
 * Seeds the first Lab Admin.
 *
 * Runs under **Node**, not on the Worker: it is a one-off operational script, and there is no
 * reason to pay the scrypt cost inside an isolate for it. This is also why it can bypass the
 * concurrency gate — a single hash, once, in a process of its own.
 *
 * Synthetic data only, without exception (CLAUDE.md §4 and the Seed & Fixture Policy in
 * data-dictionary.md). The password comes from the environment and is never written to a log:
 * see the PII rule. There is no default password, deliberately — a seeded default admin password
 * is how platforms get owned.
 *
 * Usage:
 *   LAB_ADMIN_EMAIL=... LAB_ADMIN_PASSWORD=... node server/db/seed/create-lab-admin.ts
 */

const url = process.env.TURSO_DATABASE_URL ?? 'file:./.data/dev.db'
const email = process.env.LAB_ADMIN_EMAIL
const password = process.env.LAB_ADMIN_PASSWORD
const name = process.env.LAB_ADMIN_NAME ?? 'Lab Admin'

if (!email || !password) {
  console.error('LAB_ADMIN_EMAIL and LAB_ADMIN_PASSWORD are required.')
  process.exit(1)
}

if (password.length < 12) {
  console.error('LAB_ADMIN_PASSWORD must be at least 12 characters (minPasswordLength).')
  process.exit(1)
}

const client = url.startsWith('file:')
  ? createClient({ url })
  : createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })

const db = drizzle(client, { schema: { ...identity, ...platform } }) as Db

try {
  const existing = await db
    .select({ id: identity.identityUser.id })
    .from(identity.identityUser)
    .where(eq(identity.identityUser.email, email))

  if (existing.length > 0) {
    console.info('a user with that email already exists; nothing to do')
    process.exit(0)
  }

  const now = new Date()
  const userId = crypto.randomUUID()

  await db.insert(identity.identityUser).values({
    id: userId,
    name,
    email,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  })

  /**
   * `providerId: 'credential'` and `issuer: 'local:credential'` are what better-auth's
   * email-and-password path looks for. `accountId` is the user's own id for a credential account.
   */
  await db.insert(identity.identityAccount).values({
    id: crypto.randomUUID(),
    issuer: 'local:credential',
    accountId: userId,
    providerId: 'credential',
    userId,
    password: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
  })

  // Through the repository, so the projection, the session revocation and the audit event all
  // happen — a seeded admin should not be a special case that skips the invariants.
  await createRolesRepository(db).setRoles({
    userId,
    roles: ['lab_admin'],
    actorUserId: userId,
  })

  console.info(`seeded Lab Admin ${userId}`)
} finally {
  client.close()
}
