import { describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, UnsupportedLocaleError, parseLocaleParam } from '../../db/schema/locale'

/**
 * The two ways a language reaches the server, and why they behave differently.
 *
 * `parseLocaleParam` is strict because the value identifies a resource: `PUT …/translations/fr`
 * asks to store text in a language the platform does not serve, and writing it as Indonesian
 * would be a silent wrong answer. `requestLocale` is lenient because its value is a rendering
 * preference on a read path — it is covered by the e2e suite, which can build a real request.
 */
describe('a locale named in a path', () => {
  it('accepts every language the platform serves', () => {
    expect(parseLocaleParam('id')).toBe('id')
    expect(parseLocaleParam('en')).toBe('en')
  })

  it('refuses a language the platform does not serve, rather than defaulting', () => {
    expect(() => parseLocaleParam('fr')).toThrow(UnsupportedLocaleError)
    expect(() => parseLocaleParam('')).toThrow(UnsupportedLocaleError)
    expect(() => parseLocaleParam(undefined)).toThrow(UnsupportedLocaleError)
  })

  it('refuses a region-qualified tag, which is not how the routes are addressed', () => {
    // `en-GB` is a legitimate Accept-Language value and matches `en` there. As a path segment it
    // would create a second address for one resource.
    expect(() => parseLocaleParam('en-GB')).toThrow(UnsupportedLocaleError)
  })

  it('names Indonesian as the base language', () => {
    // The base row holds the Indonesian text; everything else is a translation beside it.
    expect(DEFAULT_LOCALE).toBe('id')
  })
})
