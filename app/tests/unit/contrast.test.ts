import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Contrast verification for the shadcn-vue reskin.
 *
 * `docs/design/design.md`'s Iteration Guide requires re-verifying contrast
 * whenever a colour changes, and remapping a token to a different surface is a
 * change. The reskin created pairs design.md never checked, and one of them
 * failed: `muted-500` is verified at 4.76:1 on white, already near the 4.5:1
 * floor, and reaches only 4.34:1 on `surface-sunken` — which is the surface
 * shadcn's `muted` maps to, and `text-muted-foreground` on `bg-muted` is a
 * combination its components produce constantly.
 *
 * These assertions compute the ratios from tokens.css rather than trusting the
 * numbers written in design.md, so editing a hex fails the build instead of
 * quietly dropping a pair below AA.
 */

const tokens = readFileSync(resolve(import.meta.dirname, '../../assets/css/tokens.css'), 'utf-8')

/** Light-mode declarations, then dark-mode overrides layered on top. */
function palette(): { light: Record<string, string>; dark: Record<string, string> } {
  const [lightSrc, rest] = tokens.split(/\[data-theme=['"]dark['"]\]/)
  const darkSrc = rest?.split('\n}')[0] ?? ''
  const read = (src: string) =>
    Object.fromEntries(
      [...src.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()])
    )
  const light = read(lightSrc!)
  return { light, dark: { ...light, ...read(darkSrc) } }
}

/** Follows var() indirection to a literal hex. */
function hexOf(value: string, vars: Record<string, string>, depth = 0): string | null {
  if (depth > 8) return null
  const ref = /^var\((--[\w-]+)(?:,.*)?\)$/.exec(value.trim())
  if (ref) return hexOf(vars[ref[1]!] ?? '', vars, depth + 1)
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim())
  return hex ? hex[1]!.toLowerCase() : null
}

function relativeLuminance(hex: string): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)]
  return (Math.max(x!, y!) + 0.05) / (Math.min(x!, y!) + 0.05)
}

/** Every foreground/background pair the shadcn mapping in main.css creates. */
const PAIRS: [label: string, fg: string, bg: string][] = [
  ['foreground on background', '--ink-900', '--background'],
  ['card-foreground on card', '--ink-900', '--surface'],
  ['popover-foreground on popover', '--ink-900', '--surface-raised'],
  ['primary-foreground on primary', '--on-primary', '--primary-600'],
  ['secondary-foreground on secondary', '--ink-900', '--surface-sunken'],
  ['accent-foreground on accent', '--ink-900', '--surface-sunken'],
  ['muted-foreground on muted', '--muted-600', '--surface-sunken'],
  ['muted-foreground on background', '--muted-600', '--background'],
  ['muted-foreground on surface', '--muted-600', '--surface'],
  ['destructive on background', '--danger-700', '--background'],
  ['sidebar-foreground on sidebar', '--body-700', '--surface'],
  ['sidebar-accent-fg on sidebar-accent', '--ink-900', '--surface-sunken'],
  ['sidebar-primary-fg on sidebar-primary', '--on-primary', '--primary-600'],
]

const AA_NORMAL_TEXT = 4.5

describe.each(['light', 'dark'] as const)('%s mode meets WCAG 2.2 AA', (mode) => {
  const vars = palette()[mode]

  it.each(PAIRS)('%s', (_label, fg, bg) => {
    const f = hexOf(`var(${fg})`, vars)
    const b = hexOf(`var(${bg})`, vars)
    expect(f, `${fg} does not resolve to a hex in ${mode} mode`).not.toBeNull()
    expect(b, `${bg} does not resolve to a hex in ${mode} mode`).not.toBeNull()
    expect(contrast(f!, b!)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })
})

describe('the muted step exists in both modes', () => {
  it('--muted-600 is declared for light and dark', () => {
    // Omitting the dark override leaves the light value (#475569) on a dark
    // surface at 2.36:1 — a hard failure, and an easy one to miss because the
    // light mode looks fine.
    const { light, dark } = palette()
    expect(light['--muted-600']).toBeDefined()
    expect(dark['--muted-600']).toBeDefined()
    expect(dark['--muted-600']).not.toBe(light['--muted-600'])
  })
})
