import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'

import * as identity from '../../db/schema/identity'
import * as platform from '../../db/schema/platform'
import * as assessment from '../../db/schema/assessment'
import { createRolesRepository } from '../../domain/identity/roles'
import type { Db } from '../../db/client'
import type { RoleCode } from '../../db/schema/identity'

/**
 * Builds a real, migrated, seeded database for the e2e project.
 *
 *   labadmin@e2e.test   lab_admin, active     the `allow` cells
 *   student@e2e.test    student,   active     the `deny` cell (403) and the `scoped` cell (404)
 *   disabled@e2e.test   lab_admin, disabled   a valid session on a deactivated account (FR-023)
 *
 * Synthetic only (CLAUDE.md §4). Passwords are literals because this database is created and
 * deleted inside one test run; the production seed script still has no default.
 */

export const E2E_DB_DIR = join(process.cwd(), '.data', 'e2e')
export const E2E_DB = join(E2E_DB_DIR, 'e2e.db')

export const E2E_PASSWORD = 'e2e-fixture-password-1234'

export const ACCOUNTS = {
  labAdmin: { email: 'labadmin@e2e.test', roles: ['lab_admin'] as RoleCode[], disabled: false },
  student: { email: 'student@e2e.test', roles: ['student'] as RoleCode[], disabled: false },
  disabled: { email: 'disabled@e2e.test', roles: ['lab_admin'] as RoleCode[], disabled: true },
  /**
   * Added for the assessment API (#53). Exists to prove #45's decision end to end rather than
   * only in the matrix: Academic Lead's Assessment Configuration cell became `CRUD`, so this
   * account must be able to author instruments, not merely read them. It cannot be combined with
   * `lab_admin` — the role-exclusion trigger forbids that pair (#37).
   */
  academicLead: {
    email: 'academiclead@e2e.test',
    roles: ['academic_lead'] as RoleCode[],
    disabled: false,
  },
} as const

async function seedAccount(
  db: Db,
  spec: { email: string; roles: RoleCode[]; disabled: boolean }
): Promise<string> {
  const now = new Date()
  const userId = crypto.randomUUID()

  await db.insert(identity.identityUser).values({
    id: userId,
    name: spec.email,
    email: spec.email,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(identity.identityAccount).values({
    id: crypto.randomUUID(),
    issuer: 'local:credential',
    accountId: userId,
    providerId: 'credential',
    userId,
    password: await hashPassword(E2E_PASSWORD),
    createdAt: now,
    updatedAt: now,
  })

  // Through the repository, so the projection and the audit event happen exactly as in production.
  await createRolesRepository(db).setRoles({ userId, roles: spec.roles, actorUserId: userId })

  // Disable AFTER granting roles: setRoles revokes sessions, and the status column is what the
  // middleware and requireSession read.
  if (spec.disabled) {
    await db
      .update(identity.identityUser)
      .set({ status: 'disabled' })
      .where(eq(identity.identityUser.id, userId))
  }

  return userId
}

export async function setup() {
  await rm(E2E_DB_DIR, { recursive: true, force: true })
  await mkdir(E2E_DB_DIR, { recursive: true })

  const client = createClient({ url: `file:${E2E_DB}` })
  try {
    const db = drizzle(client, { schema: { ...identity, ...platform, ...assessment } }) as Db
    await migrate(drizzle(client), { migrationsFolder: 'server/db/migrations' })

    for (const spec of Object.values(ACCOUNTS)) {
      await seedAccount(db, spec)
    }
  } finally {
    client.close()
  }

  // The application reads these through runtimeConfig. Set before Nuxt boots.
  process.env.NUXT_TURSO_DATABASE_URL = `file:${E2E_DB}`
  process.env.TURSO_DATABASE_URL = `file:${E2E_DB}`
  process.env.NUXT_BETTER_AUTH_SECRET = 'e2e-fixture-secret-not-used-anywhere-real'
  process.env.NUXT_PUBLIC_BETTER_AUTH_URL = 'http://localhost:3000'
}

export async function teardown() {
  await rm(E2E_DB_DIR, { recursive: true, force: true })
}
