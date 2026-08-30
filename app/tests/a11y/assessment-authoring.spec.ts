import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { message, readRaw, says } from '../support/messages'

import ItemLedger from '../../components/assessment/ItemLedger.vue'
import DimensionMatrix from '../../components/assessment/DimensionMatrix.vue'
import PublishReview from '../../components/assessment/PublishReview.vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import type {
  Dimension,
  VersionDetail,
  VersionDiff,
  VersionItem,
} from '../../lib/assessment-authoring'

/**
 * Accessibility assertions for the assessment authoring UI (#54).
 *
 * These used to read the source text and grep it for `role="tab"`, `scope="col"` and friends. That
 * stopped being able to express the requirement once the markup moved into shadcn-vue's Table,
 * Tabs, Checkbox and ToggleGroup: the attribute is now emitted by the component, not written here,
 * so a source grep would fail on correct code and pass on a hand-rolled `<div role="tab">` that
 * answers no key press. Everything observable is therefore asserted against rendered DOM.
 *
 * What stays source-level is what has no rendered form — a colour literal, a page's
 * `definePageMeta` — plus the copy claims, which go through `says`/`message` for the reason
 * `../support/messages.ts` gives. Neither replaces an axe run against the rendered page, which the
 * DoD requires in CI.
 */

/** The file exactly as written. Copy is asserted through `says`/`message`. */
const read = (path: string) => readRaw(path)

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

const LEDGER = 'components/assessment/ItemLedger.vue'
const REVIEW = 'components/assessment/PublishReview.vue'
const INSTRUMENT = 'pages/dashboard/assessment/[instrumentId].vue'

/* ------------------------------------------------------------------------------- fixtures --- */

const dimension = (id: string, code: string, kind: Dimension['kind'] = 'style'): Dimension => ({
  id,
  code,
  name: code,
  kind,
  description: null,
})

const item = (overrides: Partial<VersionItem> & { itemId: string; code: string }): VersionItem => ({
  versionItemId: `vi-${overrides.itemId}`,
  position: 0,
  reverseCoded: false,
  stem: 'Saya memutuskan sendiri.',
  scalePoints: null,
  scaleCode: 'likert5',
  dimensions: [],
  ...overrides,
})

const diff = (overrides: Partial<VersionDiff> = {}): VersionDiff => ({
  versionId: 'v2',
  sourceVersionId: 'v1',
  blank: false,
  added: [],
  removed: [],
  moved: [],
  reverseCodingChanged: [],
  stemChanged: [],
  totalChanges: 0,
  ...overrides,
})

const version = (overrides: Partial<VersionDetail> = {}): VersionDetail => ({
  id: 'v2',
  instrumentId: 'i1',
  versionNo: 2,
  status: 'review',
  publishedAt: null,
  retiredAt: null,
  sourceVersionId: 'v1',
  frozen: false,
  items: [],
  ...overrides,
})

const mountLedger = (props: Record<string, unknown> = {}) =>
  mount(ItemLedger, {
    props: {
      items: [item({ itemId: 'a', code: 'kd01' })],
      dimensions: [dimension('d1', 'directive')],
      diff: null,
      frozen: false,
      scaleCodes: ['likert5'],
      ...props,
    },
  })

const matrixProps = {
  items: [
    item({
      itemId: 'a',
      code: 'kd01',
      dimensions: [{ id: 'd1', code: 'directive', kind: 'style' }],
    }),
  ],
  dimensions: [dimension('d1', 'directive'), dimension('d2', 'never_used', 'axis')],
}

const mapped = item({
  itemId: 'a',
  code: 'kd01',
  dimensions: [{ id: 'd1', code: 'directive', kind: 'style' }],
})

/* ---------------------------------------------------------------------------------- checks --- */

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
  it('the ledger renders a table with a caption and both header axes', () => {
    // The testid lands on shadcn's scroll container; the `<table>` is one level in.
    const table = mountLedger().find('[data-testid="item-ledger"] table')
    expect(table.exists()).toBe(true)
    expect(table.find('caption').exists()).toBe(true)
    expect(table.findAll('th[scope="col"]').length).toBeGreaterThan(0)
    expect(table.find('th[scope="row"]').text()).toBe('kd01')
  })

  it('the matrix carries a column header per dimension and a row header per item', () => {
    // Both axes, because a cell in an items × dimensions grid means nothing without either.
    const wrapper = mount(DimensionMatrix, { props: matrixProps })
    const columns = wrapper.findAll('thead th[scope="col"]').map((th) => th.text())
    expect(columns).toHaveLength(matrixProps.dimensions.length + 1)
    expect(columns.join(' ')).toContain('never_used')
    expect(wrapper.find('tbody th[scope="row"]').text()).toBe('kd01')
  })
})

describe('state is never carried by colour alone', () => {
  it('the ledger states reverse-coding in words next to the checkbox', () => {
    expect(read(LEDGER)).toContain("t(item.reverseCoded ? 'common.yes' : 'common.no')")
    expect(says(LEDGER, 'common.yes')).toBe('Ya')
    expect(says(LEDGER, 'common.no')).toBe('Tidak')
    expect(mountLedger().text()).toContain('Tidak')
  })

  it('the ledger renders the diff through a text label', () => {
    // `changeLabel` is the carrier; any styling on top is decoration.
    expect(read(LEDGER)).toContain('changeLabel(')
    const wrapper = mountLedger({
      diff: diff({ stemChanged: [{ itemId: 'a', code: 'kd01', before: 'old', after: 'new' }] }),
    })
    expect(wrapper.text()).toContain(message('id', 'authoring.change.stem'))
  })

  it('the matrix says "belum dipetakan" rather than only shading the column', () => {
    const wrapper = mount(DimensionMatrix, { props: matrixProps })
    // `role="status"` survives the Alert wrapper, which would otherwise announce as an assertive
    // alert — this is a finding to read, not an interruption.
    expect(wrapper.find('[role="status"]').text()).toContain('belum dipetakan')
    expect(wrapper.find('tfoot').text()).toContain('belum dipetakan')
  })

  it('the matrix labels each cell instead of leaving a bare glyph', () => {
    const wrapper = mount(DimensionMatrix, { props: matrixProps })
    const named = wrapper.findAll('tbody td .sr-only').map((n) => n.text())
    expect(named.join(' ')).toContain('kd01')
    expect(named.join(' ')).toContain('never_used')
    // The check mark itself is hidden from assistive technology; the label carries the meaning.
    for (const glyph of wrapper.findAll('tbody td span[aria-hidden="true"]')) {
      expect(['✓', '·']).toContain(glyph.text())
    }
  })

  it('the review screen labels the before and after wording in text', () => {
    // Position or strikethrough alone survives neither a screen reader nor high-contrast mode.
    const wrapper = mount(PublishReview, {
      props: {
        version: version(),
        diff: diff({
          stemChanged: [{ itemId: 'a', code: 'kd01', before: 'Lama.', after: 'Baru.' }],
        }),
      },
    })
    expect(wrapper.text()).toContain(says(REVIEW, 'authoring.publish.before'))
    expect(wrapper.text()).toContain(says(REVIEW, 'authoring.publish.after'))
  })

  it('a frozen version says it is read-only in words', () => {
    expect(says(INSTRUMENT, 'authoring.instrument.readOnly')).toMatch(/hanya baca/)
  })
})

describe('the chip picker and disclosure are operable without a pointer', () => {
  it('renders the chips as buttons carrying aria-pressed, above the 24px target floor', async () => {
    // A div with a click handler is not focusable and has no state. reka's multiple-selection
    // ToggleGroup gives each chip a real button, `aria-pressed`, and roving focus, so there is no
    // key handling of our own left to get wrong.
    const wrapper = mountLedger()
    await wrapper.find('button[aria-controls="dimensions-vi-a"]').trigger('click')

    const chip = wrapper.findAll('#dimensions-vi-a button')[0]!
    expect(chip.element.tagName).toBe('BUTTON')
    expect(chip.attributes('aria-pressed')).toBe('false')
    // `h-7` is 28px. accessibility.md's floor is 24px; the toggle size variant is what holds it.
    expect(chip.classes()).toContain('h-7')
    // The kind is spelled out rather than encoded in the chip's colour.
    expect(chip.text()).toContain('directive')
    expect(chip.text()).toContain('style')
  })

  it('ties the disclosure to the row it reveals', async () => {
    const wrapper = mountLedger()
    const toggle = wrapper.find('button[aria-controls="dimensions-vi-a"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    expect(
      wrapper.find('button[aria-controls="dimensions-vi-a"]').attributes('aria-expanded')
    ).toBe('true')
    expect(wrapper.find('#dimensions-vi-a').exists()).toBe(true)
  })

  it('commits the trailing row from the keyboard, not only from a click', async () => {
    const wrapper = mountLedger()
    const inputs = wrapper.find('[data-testid="ledger-trailing-row"]').findAll('input')
    await inputs[0]!.setValue('kd02')
    await inputs[1]!.setValue('Saya bertanya lebih dulu.')
    await inputs[1]!.trigger('keydown.enter')

    expect(wrapper.emitted('appendItem')).toHaveLength(1)
  })

  it('gives every control in the trailing row an accessible name', () => {
    // A placeholder is not a label. The scale picker is a combobox rather than an input, so this
    // walks every focusable control in the row instead of the input tags alone.
    const row = mountLedger().find('[data-testid="ledger-trailing-row"]')
    for (const control of row.findAll('input, button, [role="combobox"]')) {
      const named =
        control.attributes('aria-label') ?? control.attributes('aria-labelledby') ?? control.text()
      expect(named, `unlabelled control: ${control.html().slice(0, 120)}`).toBeTruthy()
    }
  })
})

describe('no alert region is announced while there is nothing wrong', () => {
  /**
   * `FieldError` renders its `role="alert"` container whenever `errors` is a non-empty array, and
   * `[error || undefined]` is non-empty even when the error is absent — so the ledger and both
   * bank forms shipped an empty live region that a screen reader announces on every render.
   */
  it('the ledger has no alert until the trailing row is actually wrong', async () => {
    const wrapper = mountLedger()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    const inputs = wrapper.find('[data-testid="ledger-trailing-row"]').findAll('input')
    await inputs[0]!.setValue('KD-02')
    expect(wrapper.find('[role="alert"]').text()).toBe(
      says(LEDGER, 'authoring.ledger.error.badCode')
    )
  })

  it('the review screen has no alert while nothing blocks publish', () => {
    const wrapper = mount(PublishReview, {
      props: { version: version({ items: [mapped] }), diff: diff() },
    })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('the publish gate states its reasons', () => {
  const withFault = () =>
    mount(PublishReview, {
      props: { version: version({ items: [item({ itemId: 'b', code: 'kd02' })] }), diff: diff() },
    })

  it('announces blockers rather than only disabling the button', () => {
    expect(read(REVIEW)).toContain('blockerMessage(blocker)')
    const alert = withFault().find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('kd02')
  })

  it('names the change count in the acknowledgement', () => {
    // Read raw: the resolved view collapses the interpolation, and what matters here is that the
    // count reaches the message and that the message has somewhere to put it (#49, #50).
    expect(read(REVIEW)).toContain('gate.changeCount')
    for (const locale of ['id', 'en'] as const) {
      expect(message(locale, 'authoring.publish.changeCount'), locale).toContain('{count}')
    }
  })

  it('explains why the button is disabled, next to the button', () => {
    const wrapper = withFault()
    expect(wrapper.find('[data-testid="publish-button"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain(says(REVIEW, 'authoring.publish.clearFaultsFirst'))
  })

  it('ties the acknowledgement checkbox to its label', () => {
    const wrapper = withFault()
    const checkbox = wrapper.find('[data-testid="publish-acknowledge"]')
    expect(checkbox.attributes('role')).toBe('checkbox')
    expect(wrapper.find(`label[for="${checkbox.attributes('id')}"]`).exists()).toBe(true)
  })
})

describe('the tab strip is a tablist', () => {
  const page = read(INSTRUMENT)

  it('the page uses the Tabs component rather than hand-rolled roles', () => {
    // The forty lines of arrow-key handling this replaced were the part most likely to rot. What
    // is asserted here is only that the page delegates; the roles themselves are asserted below,
    // against the component that emits them.
    for (const tag of ['<Tabs', '<TabsList', '<TabsTrigger', '<TabsContent']) {
      expect(page, `page no longer uses ${tag}`).toContain(tag)
    }
    // Named so a reintroduction of the hand-rolled strip shows up as a failure here.
    expect(page).not.toContain('onTabKeydown')
  })

  it('Tabs renders the APG roles and ties each panel to its trigger', () => {
    const wrapper = mount(
      {
        components: { Tabs, TabsList, TabsTrigger, TabsContent },
        template: `
          <Tabs default-value="ledger">
            <TabsList aria-label="Tampilan versi">
              <TabsTrigger value="ledger">Item</TabsTrigger>
              <TabsTrigger value="matrix">Matriks</TabsTrigger>
            </TabsList>
            <TabsContent value="ledger">panel</TabsContent>
          </Tabs>`,
      },
      { attachTo: document.body }
    )

    expect(wrapper.find('[role="tablist"]').attributes('aria-label')).toBe('Tampilan versi')

    const triggers = wrapper.findAll('[role="tab"]')
    expect(triggers).toHaveLength(2)
    expect(triggers[0]!.attributes('aria-selected')).toBe('true')
    expect(triggers[1]!.attributes('aria-selected')).toBe('false')

    const panel = wrapper.find('[role="tabpanel"]')
    expect(panel.attributes('aria-labelledby')).toBe(triggers[0]!.attributes('id'))
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
    // `Alert` renders `role="alert"`; a page that dropped its failure branch would have neither.
    expect(read(page)).toContain('<Alert')
  })
})
