import { defineConfig } from 'drizzle-kit'

/**
 * One config for both targets, per issue #23.
 *
 * `dialect: 'turso'` is used for local file databases as well as the deployed one so that
 * migration SQL has exactly one origin. If a future drizzle-kit refuses a bare `file:` URL with
 * no auth token, the pre-decided fallback is to keep `generate` on this config and add a
 * second, apply-only config for the local file — never to generate under one dialect and apply
 * under another.
 */
export default defineConfig({
  dialect: 'turso',
  schema: './server/db/schema/*.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? 'file:./.data/dev.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
  strict: true,
  verbose: true,
})
