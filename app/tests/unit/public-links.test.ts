import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { footerLinks, navLinks } from '../../lib/public-nav'

/**
 * Every internal link on the public site must resolve to a page that exists.
 *
 * The homepage shipped linking to /knowledge-center, /program, /penelitian, /tentang, /kontak,
 * /privacy and /asesmen. None of the seven had a page, so every nav item, every hero button and
 * the footer's privacy link returned a 404, and vue-router logged VUE_ROUTER_R0004 for each of
 * them during SSR and again on the client. Nothing failed, because nothing was checking.
 *
 * Two surfaces, checked two ways, because they are two different kinds of thing. The nav and
 * footer are data, so they are imported and asserted directly. The components write literal
 * `to="/..."` attributes in markup, so those are read as text. An earlier version checked only
 * the second way and therefore covered neither of the two arrays that carried the problem.
 */

const APP = resolve(import.meta.dirname, '../..')
const PAGES = resolve(APP, 'pages')

/** Every `.vue` file under a directory, as paths relative to it. */
function walk(dir: string, base = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(resolve(dir, entry.name), `${base}/${entry.name}`)
      : [`${base}/${entry.name}`]
  )
}

/**
 * The routes Nuxt will publish, derived from the page files themselves.
 *
 * Built in this direction on purpose. Guessing candidate file paths from a route means encoding
 * Nuxt's resolution rules here, and the earlier attempt encoded them wrongly: it knew about one
 * group name, `(public)`, at one level of nesting. Stripping every `(group)` segment instead
 * needs to know no group names at all and handles them at any depth.
 */
const ROUTES = new Set(
  walk(PAGES)
    .filter((file) => file.endsWith('.vue'))
    .map((file) =>
      file
        .replace(/\.vue$/, '')
        .replace(/\/\([^)]+\)/g, '')
        .replace(/\/index$/, '')
    )
    .map((route) => route || '/')
)

/** Components that write their link targets as literal attributes. */
const COMPONENTS = readdirSync(resolve(APP, 'components/public'))
  .filter((file) => file.endsWith('.vue'))
  .map((file) => `components/public/${file}`)

describe('Public site navigation data', () => {
  // One test rather than `it.each`, which errors on an empty list — and the list is empty whenever
  // every planned page is still unbuilt, which is the state this guard has to survive.
  it('links only to pages that exist', () => {
    const targets = [...navLinks, ...footerLinks]
      .map((link) => link.to)
      .filter((to): to is string => to !== null)

    expect(targets.filter((target) => !ROUTES.has(target))).toEqual([])
  })
})

describe('Public site components', () => {
  it.each(COMPONENTS)('%s links only to pages that exist', (file) => {
    const source = readFileSync(resolve(APP, file), 'utf-8')
    const targets = [...source.matchAll(/\bto="(\/[^"]*)"/g)].map((match) => match[1]!)

    expect(targets.filter((target) => !ROUTES.has(target))).toEqual([])
  })
})
