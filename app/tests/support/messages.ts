import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import en from '../../../i18n/locales/en.json'
import id from '../../../i18n/locales/id.json'

/**
 * Reading a component the way a person reads the screen.
 *
 * The a11y specs in this directory assert against source text, which is what makes them survive a
 * refactor that quietly drops a required affordance. Once the strings moved into the message
 * files, a literal search of the source stopped seeing them — the obligations had not changed, the
 * place the words live had.
 *
 * So `readResolved` substitutes every message key the source names with the message itself. A
 * spec keeps asserting the sentence a student reads, and it now asserts it in a named locale, so
 * the same rule can be checked in both.
 */

const LOCALES = { id, en } as const
export type Locale = keyof typeof LOCALES

const APP = resolve(import.meta.dirname, '../..')

export function message(locale: Locale, key: string): string | undefined {
  const found = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      LOCALES[locale]
    )
  return typeof found === 'string' ? found : undefined
}

/**
 * Every message key the source names as a plain string literal.
 *
 * A literal is treated as a key only when it resolves in the Indonesian file, which is the
 * complete one. That keeps a route path or a CSS class from being mistaken for a key, and it is
 * also what `every-key-translated.test.ts` checks the English file against.
 */
export function keysIn(source: string): string[] {
  const literals = source.match(/(['"`])[A-Za-z][\w.-]*\1/g) ?? []
  const keys = literals
    .map((literal) => literal.slice(1, -1))
    .filter((candidate) => candidate.includes('.') && message('id', candidate) !== undefined)
  return [...new Set(keys)]
}

/**
 * The file at `path`, with every message key it names replaced by the message in `locale`.
 *
 * A whole `{{ t('key') }}` interpolation collapses to the message, so the result reads like the
 * markup a person sees and an assertion can still say `<span>Selesai</span>`. Elsewhere only the
 * key literal is swapped, which keeps the surrounding code intact.
 */
export function readResolved(path: string, locale: Locale = 'id'): string {
  return keysIn(readRaw(path)).reduce((text, key) => {
    const rendered = message(locale, key) ?? key
    const quoted = `(['"\`])${key.replaceAll('.', '\\.')}\\1`
    return text
      .replaceAll(new RegExp(`\\{\\{\\s*t\\(${quoted}[^)]*\\)\\s*\\}\\}`, 'g'), () => rendered)
      .replaceAll(new RegExp(quoted, 'g'), (_match, quote: string) => `${quote}${rendered}${quote}`)
  }, readRaw(path))
}

/** The file exactly as written, for the few assertions that are about the code and not the copy. */
export function readRaw(path: string): string {
  return readFileSync(resolve(APP, path), 'utf-8')
}
