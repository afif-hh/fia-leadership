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

// Seeding only runs when credentials are supplied. There is deliberately no default password: a
// seeded default admin credential is how platforms get owned.
if (process.env.LAB_ADMIN_EMAIL && process.env.LAB_ADMIN_PASSWORD) {
  await import('./seed/create-lab-admin.ts')
} else {
  console.info(
    'reset complete (no Lab Admin seeded). Set LAB_ADMIN_EMAIL and LAB_ADMIN_PASSWORD to seed one.'
  )
}
