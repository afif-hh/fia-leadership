import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

/**
 * Two projects, one config (issue #23).
 *
 * `app` is unchanged from before this map: jsdom, component and token tests.
 * `server` runs under Node against a real SQLite file, using the same schema, migrations and
 * repository code as the deployed Worker — only the `createClient` import differs, behind
 * `createDb()`. No Docker, no Miniflare, no Workers test pool.
 *
 * `e2e` boots the real application and makes real HTTP requests. It exists because neither of the
 * other two can: every test in them reads source or calls a function. Two defects shipped on this
 * branch past a fully green suite for that reason — /dashboard returned 500 for every protected
 * route, and /api/v1/audit-logs returned every row to a student entitled to one. Both were found by
 * hand with curl, which is not repeatable and is not run by anything.
 *
 * `pnpm test` runs all three. `pnpm test --project server` runs the database suite alone;
 * `--project e2e` runs the request suite alone.
 */
export default defineConfig({
  test: {
    projects: [
      {
        // `plugin-vue` is needed to mount components (#54); without it a .vue test fails with
        // "Install @vitejs/plugin-vue". `@` is resolved here because Nuxt's alias is not in scope
        // for vitest.
        plugins: [vue()],
        resolve: {
          alias: { '@': fileURLToPath(new URL('./app', import.meta.url)) },
        },
        test: {
          name: 'app',
          environment: 'jsdom',
          globals: true,
          include: ['app/tests/**/*.{test,spec}.{js,ts}'],
        },
      },
      {
        test: {
          name: 'e2e',
          environment: 'node',
          globals: true,
          include: ['server/tests/e2e/**/*.test.ts'],
          globalSetup: ['server/tests/e2e/setup.ts'],
          // Booting Nuxt in dev mode is not fast. The alternative is a production build, which
          // cannot be used: nuxt.config.ts sets nitro.preset 'cloudflare_module', whose output is
          // a Worker module rather than a Node listener, so the harness has nothing to start.
          testTimeout: 120_000,
          hookTimeout: 180_000,
          // One file at a time. Each e2e file calls `setup()`, which boots its own dev server, and
          // two of those race for the HMR WebSocket port (24678) — the loser dies with "Server
          // process exited before becoming ready", naming the child process rather than the
          // collision. Same root cause as the project-overlap note above, one level down: the
          // constraint is one dev server at a time, so adding a second e2e file requires this.
          fileParallelism: false,
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          globals: true,
          include: ['server/tests/**/*.{test,spec}.ts'],
          // The e2e project lives under server/tests/ too, and this glob matched it. Both projects
          // then ran the same file concurrently, each spawning its own dev server on the same
          // port, and the loser reported "Server process exited before becoming ready" — a message
          // that points at the child process rather than at the overlap that caused it.
          exclude: ['server/tests/e2e/**'],
          globalSetup: ['server/tests/setup/global.ts'],
        },
      },
    ],
  },
})
