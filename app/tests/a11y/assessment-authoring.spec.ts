import { describe, it, expect } from 'vitest'
import { message, readRaw, readResolved } from '../support/messages'

/**
 * Source-level accessibility assertions for the assessment authoring UI (#54), matching the shape
 * of `dashboard.spec.ts`.
 *
 * Complementary to `app/tests/unit/assessment-components.test.ts`, which mounts these components
 * and asserts rendered behaviour. This file catches the class of omission that is invisible in
 * review and cheap to grep for: a colour literal, a table without header scopes, a page that
 * forgets its middleware. Neither replaces an axe run against the rendered page, which the DoD
 * already requires in CI.
 */

/**
 * Reads the file with every message key it names replaced by the Indonesian message, so an
 * assertion below can still name the sentence a person reads. See `../support/messages.ts`.
 */
const read = (path: string) => readResolved(path)

const COMPONENTS = [
  'components/assessment/ItemLedger.vue',
  'components/assessment/DimensionMatrix.vue',
  'components/assessment/PublishReview.vue',
] as const

const PAGES = [
  'pages/dashboard/assessment/index.vue',
  'pages/dashboard/assessment/[instrumentId].vue',
] as const

const ALL = [...COMPONENTS, ...PAGES]

describe('tokens own every colour', () => {
  it.each(ALL)('%s contains no colour literal', (path) => {
    // `tokens.css` owns every value (CLAUDE.md §4 and the layout's own note). A hex or rgb() here
    // would bypass the theme and would not flip under [data-theme="dark"].
    const source = read(path)
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(source).not.toMatch(/\brgba?\(/)
    expect(source).not.toMatch(/\bhsla?\(/)
  })
})

describe('both tables are real tables with header scopes', () => {
  it.each(['components/assessment/ItemLedger.vue', 'components/assessment/DimensionMatrix.vue'])(
    '%s uses th/scope rather than a grid of divs',
    (path) => {
      const source = read(path)
      expect(source).toContain('<table')
      expect(source).toContain('<caption')
      expect(source).toContain('scope="col"')
      expect(source).toContain('scope="row"')
    }
  )

  it('the matrix carries a column header per dimension and a row header per item', () => {
    // Both axes, because a cell in an items × dimensions grid means nothing without either.
    const source = read('components/assessment/DimensionMatrix.vue')
    expect(source).toMatch(/v-for="entry in coverage"[\s\S]{0,200}scope="col"/)
    expect(source).toMatch(/scope="row"[\s\S]{0,120}item\.code/)
  })
})

describe('state is never carried by colour alone', () => {
  it('the ledger states reverse-coding in words next to the checkbox', () => {
    expect(read('components/assessment/ItemLedger.vue')).toContain(
      "item.reverseCoded ? 'Ya' : 'Tidak'"
    )
  })

  it('the ledger renders the diff through a text label', () => {
    // `changeLabel` is the carrier; any styling on top is decoration.
    expect(read('components/assessment/ItemLedger.vue')).toContain('changeLabel(')
  })

  it('the matrix says "belum dipetakan" rather than only shading the column', () => {
    const source = read('components/assessment/DimensionMatrix.vue')
    expect(source).toContain('belum dipetakan')
    expect(source).toMatch(/role="status"/)
  })

  it('the matrix labels each cell instead of leaving a bare glyph', () => {
    const source = read('components/assessment/DimensionMatrix.vue')
    expect(source).toContain('aria-label')
    // The check mark itself is hidden from assistive technology; the label carries the meaning.
    expect(source).toContain('aria-hidden="true"')
  })

  it('the review screen labels the before and after wording in text', () => {
    // Position or strikethrough alone survives neither a screen reader nor high-contrast mode.
    const source = read('components/assessment/PublishReview.vue')
    expect(source).toContain('Sebelum')
    expect(source).toContain('Sesudah')
  })

  it('a frozen version says it is read-only in words', () => {
    expect(read('pages/dashboard/assessment/[instrumentId].vue')).toMatch(/hanya baca/)
  })
})

describe('the chip picker and disclosure are operable without a pointer', () => {
  const ledger = read('components/assessment/ItemLedger.vue')

  it('uses real buttons carrying aria-pressed for the chips', () => {
    // A div with a click handler is not focusable and has no state; a button needs no key handling
    // of our own. Sliced to the chip element rather than matched with a windowed regex — the
    // attribute list is long enough that any fixed window is a guess.
    const chipStart = ledger.indexOf('v-for="dimension in dimensions"')
    expect(chipStart, 'chip v-for not found').toBeGreaterThan(-1)

    // Sliced to the closing tag, not to the next `>`: an arrow function inside a `:class` ternary
    // contains `>`, which truncated the tag mid-attribute.
    const openingTag = ledger.lastIndexOf('<', chipStart)
    const chip = ledger.slice(openingTag, ledger.indexOf('</Button>', chipStart))
    // `<Button>` rather than a styled `<button>`: it renders a native button and carries the 24px
    // target floor from `buttonVariants`, which a raw `py-0.5 text-xs` chip missed by 2px. That it
    // really is a button in the DOM is asserted in assessment-components.test.ts.
    expect(chip.startsWith('<Button')).toBe(true)
    expect(chip).toContain(':aria-pressed=')
    expect(chip).toContain('size="xs"')
  })

  it('ties the disclosure to the row it reveals', () => {
    expect(ledger).toContain(':aria-expanded=')
    expect(ledger).toContain(':aria-controls=')
    expect(ledger).toMatch(/:id="`dimensions-\$\{item\.versionItemId\}`"/)
  })

  it('commits the trailing row from the keyboard, not only from a click', () => {
    expect(ledger).toContain('@keydown.enter.prevent="commitDraft"')
  })

  it('gives every bare input an accessible name', () => {
    // A placeholder is not a label.
    const inputs = [...ledger.matchAll(/<(?:Input|input|select|textarea)\b[^>]*>/g)].map(
      (m) => m[0]
    )
    for (const tag of inputs) {
      const named = /aria-label|:aria-label|aria-labelledby|\bid=/.test(tag)
      expect(named, `unlabelled control: ${tag}`).toBe(true)
    }
  })
})

describe('the publish gate states its reasons', () => {
  const review = read('components/assessment/PublishReview.vue')

  it('announces blockers rather than only disabling the button', () => {
    expect(review).toContain('role="alert"')
    expect(review).toContain('blockerMessage(blocker)')
  })

  it('names the change count in the acknowledgement', () => {
    // Read raw: the resolved view collapses the interpolation, and what matters here is that the
    // count reaches the message and that the message has somewhere to put it (#49, #50).
    expect(readRaw('components/assessment/PublishReview.vue')).toContain('gate.changeCount')
    for (const locale of ['id', 'en'] as const) {
      expect(message(locale, 'authoring.publish.changeCount'), locale).toContain('{count}')
    }
  })

  it('explains why the button is disabled, next to the button', () => {
    expect(review).toMatch(/!gate\.armed/)
    expect(review).toContain('Centang konfirmasi')
  })
})

describe('the tab strip is a tablist', () => {
  const page = read('pages/dashboard/assessment/[instrumentId].vue')

  it('declares roles and ties each panel to its tab', () => {
    expect(page).toContain('role="tablist"')
    expect(page).toContain('role="tab"')
    expect(page).toContain('role="tabpanel"')
    expect(page).toContain(':aria-selected=')
    expect(page).toContain(':aria-controls=')
    expect(page).toContain('aria-labelledby="tab-ledger"')
  })
})

describe('every page is behind auth and the policy layer', () => {
  it.each(PAGES)('%s declares the auth middleware', (page) => {
    // Defence in depth only — the endpoints are independently gated — but a protected page that
    // renders an empty shell to a signed-out visitor is a bug worth preventing.
    expect(read(page)).toContain("middleware: 'auth'")
  })

  it.each(PAGES)('%s uses the dashboard layout', (page) => {
    expect(read(page)).toContain("layout: 'dashboard'")
  })

  it('no page declares a title slot the layout cannot fill', () => {
    for (const page of PAGES) {
      expect(read(page), page).not.toMatch(/<template\s+#title/)
    }
  })
})

describe('failures reach the user', () => {
  it.each(PAGES)('%s reports a load or write failure in an alert', (page) => {
    const source = read(page)
    expect(source).toContain('role="alert"')
  })
})
