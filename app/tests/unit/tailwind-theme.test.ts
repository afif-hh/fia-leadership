import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guards the Tailwind v4 migration.
 *
 * v4 replaced tailwind.config.ts with @theme blocks in main.css. Two hazards came
 * with that, and both bit during the migration itself:
 *
 *  1. Namespace collision. Tailwind v4 generates utilities from CSS variables in
 *     reserved namespaces (--color-*, --radius-*, --text-*, ...) and emits them
 *     into :root. tokens.css is imported after Tailwind, so any variable it
 *     declares in one of those namespaces silently overrides Tailwind's — and
 *     therefore silently changes every utility built from it. This is exactly how
 *     rounded-lg started rendering 0.75rem instead of 0.5rem.
 *
 *  2. Value drift. The static scale (type ramp, named spacing) is declared as
 *     literals in main.css's @theme and again as variables in tokens.css. Nothing
 *     in the build makes them agree.
 */

const css = (p: string) => readFileSync(resolve(import.meta.dirname, '../../assets/css', p), 'utf-8')
const tokens = css('tokens.css')
const main = css('main.css')

/** Variables declared in tokens.css, in declaration order. */
function declaredVars(source: string): string[] {
  return [...source.matchAll(/(--[\w-]+)\s*:/g)]
    .map(m => m[1])
    .filter((v): v is string => v !== undefined)
}

describe('Tailwind v4 theme namespace collisions', () => {
  // Namespaces Tailwind v4 reads to generate utilities. A tokens.css variable
  // landing in one of these overrides Tailwind's own value for every utility
  // derived from it.
  const RESERVED = [
    '--color-', '--font-', '--text-', '--spacing-', '--radius-', '--leading-',
    '--tracking-', '--shadow-', '--breakpoint-', '--container-', '--inset-shadow-',
    '--drop-shadow-', '--blur-', '--perspective-', '--aspect-', '--ease-', '--animate-',
  ]

  /**
   * Collisions that exist on purpose. Each entry is a name tokens.css owns that
   * also sits in a Tailwind namespace, together with why it is safe. Anything not
   * on this list is a new collision and fails.
   *
   * Safe here means one of: Tailwind has no default under that key, so the only
   * effect is an extra unused utility; or the two values are equal so no utility
   * changes; or the derived utility is provably unused by any component.
   */
  const KNOWN_SAFE = new Set([
    // Type ramp. Values match the @theme literals below, which the drift test
    // enforces. Keys Tailwind has no default for merely add unused utilities.
    '--text-display-lg', '--text-display-md', '--text-heading-lg', '--text-heading-md',
    '--text-heading-sm', '--text-body-lg', '--text-body-md', '--text-body-sm',
    '--text-caption', '--text-button-md', '--text-data-value', '--text-code-sm',
    // Font families and weights. --font-sans / --font-mono generate font-sans /
    // font-mono, neither of which any component uses. The weight names do not
    // collide: Tailwind builds font-bold from --font-weight-bold, not --font-bold.
    '--font-sans', '--font-mono', '--font-normal', '--font-semibold', '--font-bold',
    // Elevation. level1..4 are keys Tailwind has no default for.
    '--shadow-level1', '--shadow-level2', '--shadow-level3', '--shadow-level4',
  ])

  it('tokens.css declares no unreviewed variable in a Tailwind theme namespace', () => {
    const offenders = [...new Set(declaredVars(tokens))]
      .filter(v => RESERVED.some(ns => v.startsWith(ns)))
      .filter(v => !KNOWN_SAFE.has(v))

    expect(
      offenders,
      `These tokens.css variables sit in a Tailwind v4 theme namespace and will `
      + `override Tailwind's own value for every utility built from them. Either `
      + `rename them (see --shape-* for the pattern) or add them to KNOWN_SAFE with `
      + `a note explaining why the override is harmless.`,
    ).toEqual([])
  })

  it('the shape scale stays out of the --radius-* namespace', () => {
    // The specific collision that broke rounded-lg and rounded-xl.
    expect(tokens).not.toMatch(/--radius-[\w-]+\s*:/)
    expect(tokens).toContain('--shape-lg:')
    expect(main).not.toMatch(/var\(--radius-/)
  })

  it('line height and letter spacing stay out of Tailwind namespaces', () => {
    // --leading-tight here would have redefined the leading-tight utility the
    // hero h1 relies on, changing the headline from 1.25 to 1.15.
    expect(tokens).not.toMatch(/--leading-[\w-]+\s*:/)
    expect(tokens).not.toMatch(/--tracking-[\w-]+\s*:/)
    expect(tokens).toContain('--lh-tight:')
    expect(tokens).toContain('--ls-tight:')
    expect(main).not.toMatch(/var\(--leading-/)
    expect(main).not.toMatch(/var\(--tracking-/)
  })
})

describe('static scale does not drift between tokens.css and @theme', () => {
  /** Reads a variable's value out of a CSS source. */
  function valueOf(source: string, name: string): string | undefined {
    const m = source.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
    return m?.[1]?.trim()
  }

  /** px or rem to a number of px, so 3rem and 48px compare equal. */
  function toPx(v: string): number | undefined {
    const m = /^([\d.]+)(px|rem)$/.exec(v)
    if (!m) return undefined
    const [, num, unit] = m
    if (num === undefined) return undefined
    return unit === 'rem' ? parseFloat(num) * 16 : parseFloat(num)
  }

  // Every type-ramp key the @theme block declares as a literal and tokens.css
  // declares as a variable. Both must resolve to the same size.
  const RAMP = [
    '--text-display-lg', '--text-display-md', '--text-heading-lg',
    '--text-body-lg', '--text-body-md',
  ]

  it.each(RAMP)('%s agrees between tokens.css and the @theme block', (name) => {
    const inTokens = valueOf(tokens, name)
    const inTheme = valueOf(main, name)
    expect(inTokens, `${name} missing from tokens.css`).toBeDefined()
    expect(inTheme, `${name} missing from the @theme block in main.css`).toBeDefined()

    const a = toPx(inTokens!)
    const b = toPx(inTheme!)
    expect(a, `could not parse ${name} = ${inTokens} from tokens.css`).toBeDefined()
    expect(b, `could not parse ${name} = ${inTheme} from main.css`).toBeDefined()
    expect(b).toBe(a)
  })
})

describe('the v3 build config is gone', () => {
  it('main.css owns the theme', () => {
    expect(main).toContain("@import 'tailwindcss'")
    expect(main).toContain('@theme inline')
    // Colour utilities must reference tokens.css variables rather than baking in
    // a hex, otherwise they cannot follow [data-theme="dark"] — which is precisely
    // what the v3 config did wrong.
    expect(main).toMatch(/--color-primary-600:\s*var\(--primary-600\)/)
    expect(main).toMatch(/--color-surface:\s*var\(--m3-surface\)/)
  })

  it('declares the dark variant against the data-theme attribute', () => {
    expect(main).toContain('@custom-variant dark')
    expect(main).toContain('[data-theme="dark"]')
  })
})
