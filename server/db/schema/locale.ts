/**
 * The languages the platform serves, in one place.
 *
 * Every locale column in the schema CHECKs against this list, `app/../nuxt.config.ts` configures
 * the same two codes for the browser, and `translations.test.ts` fails if the two lists drift.
 * A locale is part of the domain, not a display preference: a consent record attests to the text
 * a student actually read, and a published version's snapshot is frozen per language.
 *
 * Adding a third language is therefore a migration (the CHECKs are engine-held, ADR-005), which
 * is the correct weight for a decision that changes what the institution is legally offering.
 */
export const LOCALES = ['id', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/**
 * Indonesian. The institution's language, the one every string is authored in first, and the
 * authoritative text where a translation and the original disagree.
 */
export const DEFAULT_LOCALE: Locale = 'id'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * A locale that identifies a resource rather than expressing a preference — the `{locale}` segment
 * of a translation route.
 *
 * Strict, unlike `requestLocale` in the HTTP layer. `PUT …/translations/fr` asks to store text in
 * a language the platform does not serve, and quietly writing it as Indonesian would be worse
 * than refusing. Lives here rather than beside `requestLocale` because it needs no request: that
 * module imports `h3`, which the plain-Node test project cannot resolve, and `domain-errors.ts`
 * has to name this error.
 */
export function parseLocaleParam(value: string | undefined): Locale {
  if (isLocale(value)) return value
  throw new UnsupportedLocaleError(value ?? '')
}

export class UnsupportedLocaleError extends Error {
  readonly locale: string

  constructor(locale: string) {
    super(`'${locale}' is not a language this platform serves.`)
    this.name = 'UnsupportedLocaleError'
    this.locale = locale
  }
}
