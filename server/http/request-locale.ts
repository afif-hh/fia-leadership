import { getCookie, getQuery, getRequestHeader, type H3Event } from 'h3'

import { DEFAULT_LOCALE, isLocale, type Locale } from '../db/schema/locale.ts'

/**
 * Which language this request is asking to be answered in.
 *
 * A boundary concern, so it lives here and not in the domain: `read.ts` and `taking.ts` take a
 * `Locale` and never look at a header (architecture/patterns.md, and the guard-at-the-boundary
 * rule in CLAUDE.md rule 6's neighbourhood).
 *
 * Three sources, in falling order of how deliberate they are:
 *
 * 1. `?locale=` — the browser sending the locale it is actually rendering. This is the only one
 *    that is certainly right, because with `prefix_except_default` the reader's choice lives in
 *    the URL and the client knows it.
 * 2. The `fia_locale` cookie `@nuxtjs/i18n` writes when a reader switches language. Covers a
 *    request the client made without the parameter.
 * 3. `Accept-Language`, matched loosely — a first visit from a browser that has never been here.
 *
 * An unrecognised value falls back rather than failing the request. A locale is a rendering
 * preference on a read path, and answering in Indonesian is a worse outcome than a 400 only if
 * you think a 400 is readable.
 */
export function requestLocale(event: H3Event): Locale {
  const asked = getQuery(event).locale
  if (isLocale(asked)) return asked

  const cookie = getCookie(event, 'fia_locale')
  if (isLocale(cookie)) return cookie

  return acceptedLocale(getRequestHeader(event, 'accept-language'))
}

/**
 * The first tag in `Accept-Language` whose primary subtag names a locale we serve.
 *
 * Deliberately not a full RFC 4647 negotiation: with two languages, one of which is the fallback,
 * the q-value ordering a browser sends is already the answer. `en-GB` matches `en`; `en` never
 * matches `id`.
 */
function acceptedLocale(header: string | undefined): Locale {
  if (!header) return DEFAULT_LOCALE
  for (const entry of header.split(',')) {
    const tag = entry.split(';')[0]?.trim().toLowerCase()
    const primary = tag?.split('-')[0]
    if (isLocale(primary)) return primary
  }
  return DEFAULT_LOCALE
}
