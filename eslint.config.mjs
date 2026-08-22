// Flat config. The rules come from .nuxt/eslint.config.mjs, which the @nuxt/eslint
// module generates from this project's own structure — it already knows about Vue
// SFCs, Nuxt auto-imports, the app/ and server/ boundaries, and the TypeScript
// setup, so hand-rolling any of that here would only drift from it.
//
// It also reads .gitignore, so build output and dependencies need no repeating.
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    name: 'fia/ignores',
    // Flat config does not ignore dot-directories the way eslintrc did, and none
    // of these are gitignored, so each has to be named or ESLint walks the
    // vendored agent tooling and reports several hundred issues in third-party
    // scripts.
    ignores: [
      '.agents/**',
      '.claude/**',
      '.codex/**',
      '.impeccable/**',
      '.opencode/**',
      '.pi/**',
      'coverage/**',
    ],
  },
  {
    name: 'fia/unignore-public-components',
    // @nuxt/eslint-config ignores '**/public' to skip Nuxt's static-asset
    // directory. The pattern is unanchored, so it also swallowed
    // app/components/public/ — all seven homepage components silently dropped out
    // of lint coverage while `pnpm lint` still exited 0. Negating it here restores
    // them without touching the real public/ directory, which .gitignore does not
    // cover and which stays ignored by the upstream pattern.
    //
    // Verified with: pnpm exec eslint . --format json | (count files)
    ignores: ['!**/app/components/public/**'],
  },
  {
    name: 'fia/tests',
    // Tests read fixtures off disk and assert against them; app code does not, so
    // this stays scoped rather than global.
    files: ['app/tests/**/*.{ts,spec.ts}'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    name: 'fia/domain-boundary',
    // Per-domain isolation, enforced before runtime only.
    //
    // Turso is SQLite, so there is no `pgSchema()` namespace and — per issues #27 and #34 —
    // fine-grained Turso tokens are NOT a storage-layer security boundary. TypeScript plus this
    // rule is the whole of the enforcement, which is exactly the strength `pgSchema()` alone
    // offers on Postgres. Never describe it as more than that.
    //
    // A domain may import from `server/db/**` and from another domain's public entrypoint, but
    // never reach into another domain's internals.
    files: ['server/domain/*/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Each domain is named explicitly rather than globbed. A wildcard segment also
              // matches the literal `..`, so `../*/*` would have caught legitimate
              // `../../db/client` imports; the domain list is closed by the `Domain` union in
              // server/db/client.ts, so enumerating it costs nothing and says exactly what it
              // means. `../platform` resolves to that domain's index.ts and is allowed;
              // `../platform/audit` reaches past it and is not.
              group: [
                '../assessment/*',
                '../assessment/*/**',
                '../development/*',
                '../development/*/**',
                '../feedback360/*',
                '../feedback360/*/**',
                '../identity/*',
                '../identity/*/**',
                '../learning/*',
                '../learning/*/**',
                '../platform/*',
                '../platform/*/**',
                '../profile/*',
                '../profile/*/**',
                '../research/*',
                '../research/*/**',
                '../simulation/*',
                '../simulation/*/**',
              ],
              message:
                "Cross-domain access must go through the other domain's public entrypoint " +
                '(server/domain/<domain>/index.ts). Domains communicate via service interfaces ' +
                "or domain events, never by reaching into each other's files — CLAUDE.md rule 12.",
            },
          ],
        },
      ],
    },
  },
  {
    name: 'fia/server-tests',
    // Server tests walk the source tree and assert against it, and reach across domains
    // deliberately in order to test the boundaries themselves.
    files: ['server/tests/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-restricted-imports': 'off',
    },
  }
)
