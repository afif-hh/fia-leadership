import { createClient as createNodeClient } from '@libsql/client'
import { createClient as createWebClient } from '@libsql/client/web'
import { drizzle } from 'drizzle-orm/libsql'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'

import * as identity from './schema/identity'
import * as platform from './schema/platform'

const schema = { ...identity, ...platform }
export type Schema = typeof schema
export type Db = LibSQLDatabase<Schema>

/**
 * The nine domains of the modular monolith. `platform` and `identity` are the only two this
 * map builds; the rest are named so the seam is complete rather than retrofitted later.
 */
export type Domain =
  | 'identity'
  | 'assessment'
  | 'profile'
  | 'learning'
  | 'simulation'
  | 'development'
  | 'feedback360'
  | 'research'
  | 'platform'

export interface DbEnv {
  TURSO_DATABASE_URL?: string
  TURSO_AUTH_TOKEN?: string
}

/**
 * One database, one token, one handle per domain.
 *
 * `domain` is a **seam, not a credential selector** (issue #34). It exists so that repository
 * code is written against a domain-scoped handle and the boundary is legible — and so that if
 * per-domain credentials ever become a real, verified control, this is the one place that
 * changes. No call site may assume the handle is privilege-restricted today: it is not.
 * Per-domain isolation is enforced by TypeScript and the `no-restricted-imports` ESLint
 * boundary, before runtime only. See issues #27 and #34.
 *
 * The Node/Web split is mandatory rather than stylistic: `@libsql/client/web` throws
 * `URL_SCHEME_NOT_SUPPORTED` on a `file:` URL, and the Node entrypoint cannot run on Workers.
 */
export function createDb(env: DbEnv, _domain: Domain): Db {
  const url = env.TURSO_DATABASE_URL ?? 'file:./.data/dev.db'
  const isLocalFile = url.startsWith('file:') || url.startsWith(':memory:')

  const client = isLocalFile
    ? createNodeClient({ url })
    : createWebClient({ url, authToken: env.TURSO_AUTH_TOKEN })

  return drizzle(client, { schema })
}
