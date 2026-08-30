import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guards the two halves of issue #55, neither of which had any test.
 *
 * The history is worth keeping, because both failures were silent:
 *
 * 1. The whole reset block in main.css was written *outside* any `@layer`. Unlayered CSS outranks
 *    every layered rule regardless of specificity, and Tailwind emits all utilities inside
 *    layers — so `bg-*`, `border-*`, `px-*` and `font-*` were all dead on any `<button>`,
 *    app-wide. Fixed by PR #43 wrapping it in `@layer base`.
 * 2. `min-height`/`min-width: 44px` survived that fix and could not be fixed by it: `min-height`
 *    is a different property from `height`, so no layer order lets an `h-*` utility win. Every
 *    shadcn size variant rendered 44px — measured in the running app, not inferred.
 *
 * Everything here is asserted against **source text**, matching the other tests in this folder.
 * Two reasons, both limits worth naming rather than hiding: jsdom does not implement cascade
 * layers, so a computed-style assertion could not express #55 at all; and the `app` vitest project
 * has no `@vitejs/plugin-vue`, so importing `components/ui/button` (which re-exports a `.vue`
 * file) fails outright. This file therefore proves the *inputs* to the cascade are right, not the
 * cascade itself — the resolved behaviour was verified by measuring the running app when #55 was
 * decided. It is still what catches a reintroduction, which nothing did before.
 */

const mainCss = readFileSync(resolve(import.meta.dirname, '../../assets/css/main.css'), 'utf-8')

/** The body of the blanket `button { ... }` rule in main.css, comments stripped. */
function blanketButtonRule(): string {
  const withoutComments = mainCss.replace(/\/\*[\s\S]*?\*\//g, '')
  // The bare element selector, not `.btn-primary` or `button:hover`.
  const match = withoutComments.match(/(?:^|\n)\s*button\s*\{([^}]*)\}/)
  expect(match, 'no blanket `button { ... }` rule found in main.css').not.toBeNull()
  return match![1]!
}

describe('the reset block stays inside @layer base (PR #43)', () => {
  it('opens an @layer base before declaring the bare element rules', () => {
    const layerIndex = mainCss.indexOf('@layer base {')
    const buttonIndex = mainCss.search(/(?:^|\n)\s*button\s*\{/m)

    expect(layerIndex, 'main.css no longer opens an @layer base').toBeGreaterThan(-1)
    expect(buttonIndex).toBeGreaterThan(layerIndex)
  })

  it('imports tailwindcss before that layer, so `base` joins Tailwind’s layer order', () => {
    // If the repo's `@layer base` were registered first, it would define the layer position and
    // Tailwind's later statement could not reorder it — utilities would stop winning.
    // Quote-agnostic: which quote prettier writes here is not what this test is about.
    const tailwind = mainCss.search(/@import\s+['"]tailwindcss['"]/)
    expect(tailwind).toBeGreaterThan(-1)
    expect(tailwind).toBeLessThan(mainCss.indexOf('@layer base {'))
  })
})

describe('the blanket button rule declares nothing a utility cannot override (#55)', () => {
  /**
   * Properties with no same-property utility counterpart that components use. A blanket
   * declaration of one of these cannot be overridden by `h-*`/`w-*`/`size-*` and therefore
   * silently defeats every size variant — the #55 bug exactly.
   */
  const UNOVERRIDABLE = ['min-height', 'min-width', 'max-height', 'max-width']

  it.each(UNOVERRIDABLE)('does not declare %s', (property) => {
    expect(blanketButtonRule()).not.toMatch(new RegExp(`\\b${property}\\s*:`))
  })

  it('still strips the user-agent chrome, which is what a reset is for', () => {
    // These are same-property defaults, so they remain safe and are deliberately kept.
    const rule = blanketButtonRule()
    expect(rule).toMatch(/background\s*:/)
    expect(rule).toMatch(/border\s*:/)
    expect(rule).toMatch(/cursor\s*:\s*pointer/)
  })

  it('resets padding to zero rather than choosing a size', () => {
    /**
     * The same failure as #55, one property along. `padding` IS overridable by a `p-*` utility, so
     * this stayed invisible for as long as every button-shaped component happened to declare one.
     * reka's Checkbox does not — it is a `<button>` sized purely by `size-4` — and under
     * `box-sizing: border-box` the inherited 12px/24px padding rendered it 50×26px instead of
     * 16×16px. A reset strips chrome; it does not pick a size.
     */
    expect(blanketButtonRule()).toMatch(/padding\s*:\s*0\s*(?:;|$)/)
  })
})

describe('buttonVariants carries the touch-target obligation instead', () => {
  const variantsSource = readFileSync(
    resolve(import.meta.dirname, '../../components/ui/button/index.ts'),
    'utf-8'
  )

  /** Each `'<size>': '<classes>'` entry inside the cva `size: { ... }` block. */
  function sizeClasses(): Record<string, string> {
    const block = variantsSource.match(/size:\s*\{([\s\S]*?)\n {6}\},/)
    expect(block, 'could not locate the cva `size` block in button/index.ts').not.toBeNull()

    const entries = [...block![1]!.matchAll(/'([\w-]+)':\s*'([^']*)'/g)]
    expect(entries.length, 'no size entries parsed').toBeGreaterThan(0)
    return Object.fromEntries(entries.map((m) => [m[1]!, m[2]!]))
  }

  /** Tailwind's `h-N` / `size-N` scale is N × 0.25rem = N × 4px. */
  function heightPx(classes: string): number {
    const match = classes.match(/(?:^|\s)(?:h|size)-(\d+)(?:\s|$)/)
    expect(match, `no h-*/size-* utility found in: ${classes}`).not.toBeNull()
    return Number(match![1]) * 4
  }

  /** WCAG 2.2 AA, SC 2.5.8 Target Size (Minimum). The hard floor, everywhere. */
  const AA_MINIMUM = 24
  /** SC 2.5.5 Target Size (Enhanced), level AAA. This project's choice for touch surfaces. */
  const TOUCH_TARGET = 44

  it.each(['default', 'lg', 'icon', 'icon-lg'])('size=%s meets the 44px touch target', (size) => {
    expect(heightPx(sizeClasses()[size]!)).toBeGreaterThanOrEqual(TOUCH_TARGET)
  })

  it.each(['xs', 'sm', 'icon-xs', 'icon-sm'])(
    'size=%s is compact but never below the AA 24px floor',
    (size) => {
      const height = heightPx(sizeClasses()[size]!)
      expect(height).toBeGreaterThanOrEqual(AA_MINIMUM)
      // Asserted so a well-meaning bump back to 44px shows up as a failing test rather than as
      // dense admin UI quietly becoming unusable again.
      expect(height).toBeLessThan(TOUCH_TARGET)
    }
  )

  it('defaults to a touch-sized variant when no size prop is given', () => {
    const defaultSize = variantsSource.match(/defaultVariants:\s*\{[^}]*size:\s*'([\w-]+)'/)
    expect(defaultSize, 'no defaultVariants.size found').not.toBeNull()
    expect(heightPx(sizeClasses()[defaultSize![1]!]!)).toBeGreaterThanOrEqual(TOUCH_TARGET)
  })
})
