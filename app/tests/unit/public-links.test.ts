import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Every internal link on the public site must resolve to a page that exists.
 *
 * The homepage shipped linking to /knowledge-center, /program, /penelitian, /tentang, /kontak,
 * /privacy and /asesmen. None of the seven had a page, so every nav item, every hero button and
 * the footer's privacy link returned a 404, and vue-router logged VUE_ROUTER_R0004 for each of
 * them during SSR and again on the client. Nothing failed, because nothing was checking.
 *
 * `docs/features/public-website.md` still calls for those pages. Until they land, the affordance
 * belongs to `PublicPlannedLink`, which renders it disabled and labelled "Later" — the pattern
 * `app/layouts/dashboard.vue` already uses for navigation this phase has not built. This test is
 * the thing that keeps a hard-coded `to="/somewhere"` from creeping back in.
 */

const APP = resolve(import.meta.dirname, '../..')
const PAGES = resolve(APP, 'pages')

/** Files that make up the public surface: the layout plus every component the homepage renders. */
const SURFACES = [
  resolve(APP, 'layouts/public.vue'),
  ...readdirSync(resolve(APP, 'components/public'))
    .filter((f) => f.endsWith('.vue'))
    .map((f) => resolve(APP, 'components/public', f)),
]

/**
 * Resolves an app-absolute path against `app/pages/`, honouring Nuxt's route groups: `(public)`
 * is a grouping directory and contributes nothing to the URL, so `/` is `(public)/index.vue`.
 */
function pageExists(path: string): boolean {
  const segments = path.replace(/^\/+|\/+$/g, '')
  const candidates =
    segments === ''
      ? ['index.vue', '(public)/index.vue']
      : [`${segments}.vue`, `${segments}/index.vue`, `(public)/${segments}.vue`]
  return candidates.some((candidate) => existsSync(resolve(PAGES, candidate)))
}

describe('Public site internal links', () => {
  it.each(SURFACES.map((f) => [f.slice(APP.length + 1), f]))(
    '%s links only to pages that exist',
    (_label, file) => {
      const source = readFileSync(file, 'utf-8')
      const targets = [...source.matchAll(/\bto="(\/[^"]*)"/g)].map((m) => m[1]!)
      const missing = targets.filter((target) => !pageExists(target))

      expect(missing).toEqual([])
    }
  )
})
