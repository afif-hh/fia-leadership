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
)
