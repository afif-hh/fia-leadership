import { defineConfig } from 'vitest/config'

/**
 * Two projects, one config (issue #23).
 *
 * `app` is unchanged from before this map: jsdom, component and token tests.
 * `server` runs under Node against a real SQLite file, using the same schema, migrations and
 * repository code as the deployed Worker — only the `createClient` import differs, behind
 * `createDb()`. No Docker, no Miniflare, no Workers test pool.
 *
 * `pnpm test` runs both. `pnpm test --project server` runs the database suite alone.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'app',
          environment: 'jsdom',
          globals: true,
          include: ['app/tests/**/*.{test,spec}.{js,ts}'],
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          globals: true,
          include: ['server/tests/**/*.{test,spec}.ts'],
          globalSetup: ['server/tests/setup/global.ts'],
        },
      },
    ],
  },
})
