import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

/**
 * Applies the generated migrations.
 *
 * Migrations are still *generated* by `drizzle-kit generate` and never hand-edited — the one
 * hand-written file is a `--custom` migration, which is the supported way to ship SQL that a
 * schema diff cannot express (triggers). What differs from the original plan is the *applier*:
 * `drizzle-kit migrate` creates the `__drizzle_migrations` journal table and then applies
 * nothing, exiting 0, for both the `turso` and `sqlite` dialects against a `file:` URL. Drizzle's
 * own programmatic migrator applies the same files correctly, and is also what the test harness
 * needs in `globalSetup`, so there is one code path rather than two.
 *
 * ROLLBACK: see the header of each migration in server/db/migrations. Rolling back is manual and
 * deliberate — per skills/database-migration/SKILL.md, and because 0001's rollback drops the
 * triggers that carry the append-only guarantee, which is never something to do incidentally.
 */
const url = process.env.TURSO_DATABASE_URL ?? 'file:./.data/dev.db'
const authToken = process.env.TURSO_AUTH_TOKEN

const client = url.startsWith('file:') ? createClient({ url }) : createClient({ url, authToken })

try {
  await migrate(drizzle(client), { migrationsFolder: 'server/db/migrations' })
  console.info(`migrations applied to ${url}`)
} finally {
  client.close()
}
