import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'

import * as identity from '../schema/identity.ts'
import * as platform from '../schema/platform.ts'
import { ROLE_CODES, type RoleCode } from '../schema/identity.ts'
import { createRolesRepository } from '../../domain/identity/roles.ts'
import type { Db } from '../client.ts'

/**
 * Seeds one account with an explicit set of roles.
 *
 * Generalised from `create-lab-admin.ts`, which could only ever produce a Lab Admin. The e2e suite
 * needs a Student as well, in order to assert that a `deny` cell returns 403 and a `scoped` cell
 * returns 404 against a real running application — the two behaviours no source-level test can
 * reach.
 *
 * Runs under **Node**, not on the Worker: it is a one-off operational script, and there is no
 * reason to pay the scrypt cost inside an isolate for it. That is also why it can bypass the
 * concurrency gate — a single hash, once, in a process of its own.
 *
 * Synthetic data only, without exception (CLAUDE.md §4 and the Seed & Fixture Policy in
 * data-dictionary.md). The password comes from the environment and is never written to a log: see
 * the PII rule. There is no default password, deliberately — a seeded default admin credential is
 * how platforms get owned.
 *
 * Usage:
 *   SEED_EMAIL=... SEED_PASSWORD=... SEED_ROLES=lab_admin node server/db/seed/create-user.ts
 *   SEED_EMAIL=... SEED_PASSWORD=... SEED_ROLES=student SEED_STATUS=disabled node ...
 */

const url = process.env.TURSO_DATABASE_URL ?? 'file:./.data/dev.db'

// LAB_ADMIN_* is still accepted so `pnpm db:seed` and existing runbooks keep working.
const email = process.env.SEED_EMAIL ?? process.env.LAB_ADMIN_EMAIL
const password = process.env.SEED_PASSWORD ?? process.env.LAB_ADMIN_PASSWORD
const name = process.env.SEED_NAME ?? process.env.LAB_ADMIN_NAME ?? 'Lab Admin'
const rolesInput = process.env.SEED_ROLES ?? 'lab_admin'
const status = process.env.SEED_STATUS === 'disabled' ? 'disabled' : 'active'

if (!email || !password) {
  console.error('SEED_EMAIL and SEED_PASSWORD are required.')
  process.exit(1)
}

if (password.length < 12) {
  console.error('SEED_PASSWORD must be at least 12 characters (minPasswordLength).')
  process.exit(1)
}

const roles = rolesInput
  .split(',')
  .map((role) => role.trim())
  .filter(Boolean) as RoleCode[]

const unknown = roles.filter((role) => !ROLE_CODES.includes(role))
if (unknown.length > 0) {
  console.error(`unknown role(s): ${unknown.join(', ')}. Valid: ${ROLE_CODES.join(', ')}`)
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
    status,
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

  if (roles.length > 0) {
    // Through the repository, so the projection, the session revocation and the audit event all
    // happen — a seeded account should not be a special case that skips the invariants.
    await createRolesRepository(db).setRoles({ userId, roles, actorUserId: userId })
  }

  console.info(`seeded ${userId} roles=${roles.join(',') || 'none'} status=${status}`)
} finally {
  client.close()
}
