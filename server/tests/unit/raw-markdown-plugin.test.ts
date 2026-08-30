import { describe, expect, it } from 'vitest'

import { rawMarkdown } from '../../../build/raw-markdown'

/**
 * The plugin that makes `server/policies/manifest.ts` survive a production build.
 *
 * Tested because the failure it prevents is invisible everywhere else: vitest runs on Vite, which
 * implements `?raw` natively, so every policy test passes with or without this plugin. Only a
 * Nitro/Rollup build fails — and only once a route imports the manifest, which will not happen
 * until the endpoints land in #78. Without this file, the sole thing standing between a broken
 * plugin and a broken deploy is remembering to run `pnpm build` by hand.
 */
describe('the ?raw markdown plugin', () => {
  const plugin = rawMarkdown(async (path) => `# loaded from ${path}`)

  const resolveId = (source: string, importer?: string) => plugin.resolveId(source, importer)
  const load = (id: string) => plugin.load(id)

  describe('resolveId', () => {
    it('resolves the specifier against its importer, keeping the suffix', () => {
      // Rollup's own resolver would look for a file whose name literally ends in "?raw" and fail
      // with ENOENT — the exact error a production build produced before this existed.
      expect(
        resolveId('./assessment-privacy-notice/v1.md?raw', '/repo/server/policies/manifest.ts')
      ).toBe('/repo/server/policies/assessment-privacy-notice/v1.md?raw')
    })

    it('ignores imports it is not responsible for', () => {
      expect(resolveId('marked', '/repo/server/policies/manifest.ts')).toBeNull()
      // A plain .md import is somebody else's problem; only the ?raw form is claimed.
      expect(resolveId('./v1.md', '/repo/server/policies/manifest.ts')).toBeNull()
    })

    it('declines when there is no importer to resolve against', () => {
      expect(resolveId('./v1.md?raw', undefined)).toBeNull()
    })
  })

  describe('load', () => {
    it('inlines the file as a default-exported string', async () => {
      // Inlining is the whole point: Cloudflare Workers has no filesystem, so a runtime read
      // would pass every test here and fail in production.
      await expect(load('/repo/server/policies/x/v1.md?raw')).resolves.toBe(
        'export default "# loaded from /repo/server/policies/x/v1.md"'
      )
    })

    it('escapes content that would otherwise break the generated module', async () => {
      const tricky = rawMarkdown(async () => 'has "quotes", a \\ backslash and\na newline')
      const code = (await tricky.load('/a/v1.md?raw'))!

      // Round-tripping proves the escaping rather than asserting an exact byte sequence.
      expect(JSON.parse(code.replace('export default ', ''))).toBe(
        'has "quotes", a \\ backslash and\na newline'
      )
    })

    it('ignores ids it did not resolve', async () => {
      await expect(load('/repo/server/domain/identity/consent.ts')).resolves.toBeNull()
    })
  })
})
