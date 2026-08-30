import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * The PII Rule, enforced rather than merely documented (#65).
 *
 * `responses.answer_value` must never reach an application log, trace or metric — and the
 * realistic failure mode named in `docs/security/privacy-security.md` is an error handler that
 * dumps a request body, not a deliberate `console.log(answer)`.
 *
 * This is a **grep**, not a runtime control, and that is a deliberate copy of the precedent
 * `policy.test.ts` already sets for route handlers ("the grep is the only control"). No
 * structured-logging infrastructure exists yet — `docs/engineering/observability.md` plans
 * pino/OTel and `server/utils/auth.ts` notes there is no email service either — so there is
 * nothing to build a redaction helper *into*. Rather than inventing machinery for absent
 * infrastructure, this fails CI the moment real logging lands and reaches for the one value it
 * must never touch.
 *
 * When logging does arrive, this test should grow to cover the logger's own call shape rather
 * than being deleted.
 */

const SERVER = resolve(import.meta.dirname, '../..')

/** The identifiers that name a student's answer, in either casing convention. */
const FORBIDDEN = ['answerValue', 'answer_value']

/**
 * Anything that emits. `console` is what exists today; the rest are named ahead of time so
 * adding a logger does not silently create a hole in this check.
 */
const SINKS = /\b(console\.\w+|logger\.\w+|log\.\w+|span\.setAttribute\w*|metric\w*\.record)\s*\(/g

/**
 * The text between a call's parentheses, however many lines it spans.
 *
 * A fixed-size window was the obvious first cut and was wrong: 400 characters after
 * `throw new NotFoundError(` runs straight past the end of that statement and into whatever
 * happens to follow, which flagged `saveAnswer`'s perfectly safe error as a leak. Balancing the
 * parens keeps the check on the arguments actually being passed.
 *
 * Quotes are tracked so a paren inside a string literal cannot unbalance the scan. Template
 * literals with nested `${...}` parens are not handled; nothing in this codebase has one inside a
 * log call, and a false *positive* there would be a visible failure rather than a silent hole.
 */
function callArguments(source: string, openParenIndex: number): string {
  let depth = 0
  let quote: string | null = null

  for (let i = openParenIndex; i < source.length; i++) {
    const char = source[i]!
    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '(') depth++
    else if (char === ')') {
      depth--
      if (depth === 0) return source.slice(openParenIndex, i + 1)
    }
  }
  return source.slice(openParenIndex)
}

function tsFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      // Tests are excluded: this file itself has to name the forbidden identifiers to check for
      // them, and fixtures legitimately build answers to exercise the service.
      if (entry === 'tests' || entry === 'node_modules') continue
      out.push(...tsFilesUnder(full))
      continue
    }
    if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('the PII rule, as a grep over server source', () => {
  const files = tsFilesUnder(SERVER)

  it('scans a plausible number of files, so a broken walk cannot pass vacuously', () => {
    // Without this, a bug in tsFilesUnder that returned [] would make every assertion below
    // trivially true — the classic way a guard like this stops guarding anything.
    expect(files.length).toBeGreaterThan(20)
  })

  it('never passes a student answer into a log, trace or metric call', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      for (const match of source.matchAll(SINKS)) {
        const args = callArguments(source, match.index + match[0].length - 1)
        if (FORBIDDEN.some((name) => args.includes(name))) {
          const line = source.slice(0, match.index).split('\n').length
          offenders.push(`${relative(SERVER, file)}:${line} — ${match[1]}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  /**
   * The error path specifically, because it is the one the documentation calls out. An error
   * message is a string that gets logged by whatever catches it, so an answer embedded in one is
   * a leak with extra steps — which is exactly why `InvalidAnswerError` names only the item.
   */
  it('never builds an error message out of a student answer', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      for (const match of source.matchAll(/new \w*Error\s*\(|super\s*\(/g)) {
        const args = callArguments(source, match.index + match[0].length - 1)
        if (FORBIDDEN.some((name) => args.includes(name))) {
          const line = source.slice(0, match.index).split('\n').length
          offenders.push(`${relative(SERVER, file)}:${line}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
