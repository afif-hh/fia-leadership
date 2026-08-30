import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import en from '../../../i18n/locales/en.json'
import id from '../../../i18n/locales/id.json'

/**
 * Reading a component's copy without pretending to render it.
 *
 * The a11y specs in this directory assert against source text, which is what makes them survive a
 * refactor that quietly drops a required affordance. Once the strings moved into the message files
 * a literal search of the source stopped seeing them: the obligations had not changed, the place
 * the words live had.
 *
 * An earlier version of this file substituted messages back into the source so those searches kept
 * working. That made assertions look like they checked rendered markup when they checked a string a
 * regular expression had produced. These helpers make the two halves separate and honest instead —
 * `says` asserts that a component names a key and hands back what that key reads as, and
 * `messagesIn` gives the copy a file uses so a negative assertion has something real to search.
 */

const LOCALES = { id, en } as const
export type Locale = keyof typeof LOCALES

const APP = resolve(import.meta.dirname, '../..')

export function readRaw(path: string): string {
  return readFileSync(resolve(APP, path), 'utf-8')
}

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
 * A literal counts as a key only when it resolves in the Indonesian file, which is the complete
 * one. That keeps a route path or a CSS class from being mistaken for a key.
 */
export function keysIn(source: string): string[] {
  const literals = source.match(/(['"`])[A-Za-z][\w.-]*\1/g) ?? []
  const keys = literals
    .map((literal) => literal.slice(1, -1))
    .filter((candidate) => candidate.includes('.') && message('id', candidate) !== undefined)
  return [...new Set(keys)]
}

/**
 * Asserts that `path` names `key`, and returns what `key` reads as.
 *
 * Two claims in one line, and both are real: the component reaches for that message, and the
 * message says what the test expects. Neither claim pretends to be a rendered page.
 */
export function says(path: string, key: string, locale: Locale = 'id'): string {
  const source = readRaw(path)
  if (!source.includes(key)) {
    throw new Error(`${path} does not name the message key '${key}'`)
  }
  const text = message(locale, key)
  if (text === undefined) {
    throw new Error(`no ${locale} message for '${key}'`)
  }
  return text
}

/** All the copy a file uses, for assertions about what its wording must never contain. */
export function messagesIn(path: string, locale: Locale = 'id'): string {
  return keysIn(readRaw(path))
    .map((key) => message(locale, key) ?? '')
    .join('\n')
}
