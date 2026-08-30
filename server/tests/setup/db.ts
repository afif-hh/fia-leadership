import { copyFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import type { Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

import * as identity from '../../db/schema/identity'
import * as platform from '../../db/schema/platform'
import * as assessment from '../../db/schema/assessment'
import * as profile from '../../db/schema/profile'
import type { Db } from '../../db/client'
import { TEMPLATE_DB, TEST_DB_DIR } from './paths'

const schema = { ...identity, ...platform, ...assessment, ...profile }

let counter = 0

export interface TestDb {
  db: Db
  client: Client
  /** `file:` URL of this test's copy, so code that builds its own client can point at it. */
  url: string
  drop: () => Promise<void>
}

/**
 * A fresh copy of the migrated template, per test.
 *
 * Copying rather than cleaning is what makes `audit_logs` testable at all: its BEFORE DELETE
 * trigger aborts any attempt to truncate it, so a delete-based isolation strategy would have to
 * special-case the one table whose correctness matters most, or drop the trigger and stop
 * testing the thing being asserted. Replacing the file deletes nothing. See issue #23.
 */
export async function freshDb(): Promise<TestDb> {
  const path = join(TEST_DB_DIR, `t${process.pid}-${counter++}.db`)
  await copyFile(TEMPLATE_DB, path)

  const client = createClient({ url: `file:${path}` })
  const db = drizzle(client, { schema }) as Db

  return {
    db,
    client,
    url: `file:${path}`,
    async drop() {
      client.close()
      await rm(path, { force: true })
    },
  }
}

/** A minimal user row, so tests do not each re-derive better-auth's required columns. */
export async function insertUser(
  db: Db,
  overrides: Partial<{ id: string; email: string; name: string }> = {}
) {
  const id = overrides.id ?? crypto.randomUUID()
  const now = new Date()
  await db.insert(identity.identityUser).values({
    id,
    name: overrides.name ?? 'Test Person',
    email: overrides.email ?? `${id}@example.test`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  })
  return id
}
