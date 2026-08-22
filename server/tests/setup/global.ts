import { mkdir, rm } from 'node:fs/promises'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

import { TEMPLATE_DB, TEST_DB_DIR } from './paths'

/**
 * Builds the migrated template once for the whole run (issue #23).
 *
 * The template is produced by running the real migrations rather than restoring a snapshot,
 * because the interesting behaviour lives in the migrations: the append-only triggers, the
 * role-exclusion triggers and the CHECK constraints all arrive as SQL. A snapshot would let the
 * schema and the migrations that produce it drift apart silently, and a suite that never runs
 * the migration path cannot catch a broken migration.
 *
 * Each test then copies this file, so the cost is paid once rather than per test.
 */
export async function setup() {
  await rm(TEST_DB_DIR, { recursive: true, force: true })
  await mkdir(TEST_DB_DIR, { recursive: true })

  const client = createClient({ url: `file:${TEMPLATE_DB}` })
  try {
    await migrate(drizzle(client), { migrationsFolder: 'server/db/migrations' })
  } finally {
    client.close()
  }
}

export async function teardown() {
  await rm(TEST_DB_DIR, { recursive: true, force: true })
}
