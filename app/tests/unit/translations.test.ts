import { describe, expect, it } from 'vitest'
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import en from '../../../i18n/locales/en.json'
import id from '../../../i18n/locales/id.json'
import { DEFAULT_LOCALE, LOCALES } from '../../../server/db/schema/locale'
import { BASE_CONTENT_LOCALE, TRANSLATABLE_LOCALES } from '../../lib/content-locale'
import { keysIn, message } from '../support/messages'

/**
 * The lever that keeps the two languages honest.
 *
 * A missing English key does not crash: `fallbackLocale: 'id'` renders the Indonesian sentence, so
 * a half-translated screen ships looking fine to whoever wrote it. This turns that into a failing
 * test instead, which is the only way a second language stays complete as the app grows.
 *
 * Indonesian is the reference because it is the default locale and the one every new string is
 * written in first.
 */

const APP = resolve(import.meta.dirname, '../..')

const SOURCES = globSync('**/*.{vue,ts}', { cwd: APP }).filter((path) => !path.startsWith('tests/'))

function flatten(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix]
  if (!node || typeof node !== 'object') return []
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    flatten(value, prefix ? `${prefix}.${key}` : key)
  )
}

describe('the message files', () => {
  it('define exactly the same keys in both languages', () => {
    const idKeys = flatten(id).sort()
    const enKeys = flatten(en).sort()
    expect(enKeys.filter((key) => !idKeys.includes(key))).toEqual([])
    expect(idKeys.filter((key) => !enKeys.includes(key))).toEqual([])
  })

  it('leaves no message empty in either language', () => {
    for (const key of flatten(id)) {
      for (const locale of ['id', 'en'] as const) {
        expect(message(locale, key)?.trim(), `${locale}: ${key}`).toBeTruthy()
      }
    }
  })

  /**
   * Catches the reverse mistake: a component naming `dashboard.overview.tital`, which
   * `missingWarn: false` would render silently as the raw key.
   */
  it('is named only by keys that exist, across every source file', () => {
    const unknown: string[] = []
    for (const path of SOURCES) {
      const source = readFileSync(resolve(APP, path), 'utf-8')
      for (const call of source.matchAll(/\bt\(\s*(['"])([\w.-]+)\1/g)) {
        const key = call[2]!
        if (message('id', key) === undefined) unknown.push(`${path}: ${key}`)
      }
    }
    expect(unknown).toEqual([])
  })

  it('finds keys in the components, so the resolver in the a11y specs is not looking at nothing', () => {
    expect(
      keysIn(readFileSync(resolve(APP, 'layouts/public.vue'), 'utf-8')).length
    ).toBeGreaterThan(0)
  })
})

/**
 * The languages are configured in three places — `nuxt.config.ts` for the browser,
 * `server/db/schema/locale.ts` for the database, and `app/lib/content-locale.ts` for the authoring
 * screens. They cannot be one file: the first is Nuxt configuration, the second is a schema
 * constant a CHECK is built from, and the third must not drag a server import into a component.
 *
 * So they are checked against each other here instead. Drift between them is not a type error and
 * would surface as a locale that renders but cannot be stored, or the reverse.
 */
describe('the configured languages', () => {
  const nuxtConfig = readFileSync(resolve(APP, '../nuxt.config.ts'), 'utf-8')

  it('are the same set in the browser and in the database', () => {
    const configured = [...nuxtConfig.matchAll(/\{\s*code:\s*'([a-z]{2})'/g)].map((m) => m[1])
    expect(configured.sort()).toEqual([...LOCALES].sort())
  })

  it('share one base language, which the browser also serves without a prefix', () => {
    expect(BASE_CONTENT_LOCALE).toBe(DEFAULT_LOCALE)
    expect(nuxtConfig).toContain(`defaultLocale: '${DEFAULT_LOCALE}'`)
  })

  it('offer every non-base language as a translation target', () => {
    // A language that renders but cannot be authored into is a language the platform claims to
    // support and then cannot fill.
    expect([...TRANSLATABLE_LOCALES].sort()).toEqual(
      LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).sort()
    )
  })

  it('each have a message file', () => {
    const files: Record<string, unknown> = { id, en }
    for (const locale of LOCALES) expect(files[locale], locale).toBeDefined()
  })
})
