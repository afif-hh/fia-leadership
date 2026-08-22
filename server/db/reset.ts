import { rm, mkdir } from 'node:fs/promises'

/**
 * The one-command local setup (issue #23): drop the dev database, migrate, seed.
 *
 * Refuses to run against anything but a local file, because "reset" against the deployed
 * database is never what anyone means.
 */
const url = process.env.TURSO_DATABASE_URL ?? 'file:./.data/dev.db'

if (!url.startsWith('file:')) {
  console.error(`refusing to reset a non-file database: ${url}`)
  process.exit(1)
}

const path = url.slice('file:'.length)
await rm(path, { force: true })
await rm(`${path}-journal`, { force: true })
await mkdir('.data', { recursive: true })

await import('./migrate.ts')

// The Lab Admin seed lives on the auth build (issue #40), which owns password hashing. Until it
// lands, reset produces an empty migrated database rather than pretending otherwise.
console.info('reset complete. Lab Admin seeding arrives with the better-auth wiring (issue #40).')
