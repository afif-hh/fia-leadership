import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import ItemLedger from '../../components/assessment/ItemLedger.vue'
import DimensionMatrix from '../../components/assessment/DimensionMatrix.vue'
import PublishReview from '../../components/assessment/PublishReview.vue'
import BankEditor from '../../components/assessment/BankEditor.vue'
import type {
  Dimension,
  VersionDetail,
  VersionDiff,
  VersionItem,
} from '../../lib/assessment-authoring'

/**
 * Component tests for the ledger, the matrix and the review gate (#54's definition of done).
 *
 * These mount the real components — the first tests in this project to do so, which is why
 * `@vitejs/plugin-vue` had to be added to the `app` vitest project. They assert the things review
 * cannot catch reliably: that a table carries its header scopes, that state reaches the DOM as
 * text and not only as a class, and that the publish button stays disabled until it should not.
 */

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

/** shadcn wrappers pull in reka-ui; stubbing them keeps these tests about our own markup. */
const global = {
  stubs: {
    Input: {
      template:
        '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
      props: ['modelValue'],
    },
    Button: {
      template: '<button :disabled="disabled"><slot /></button>',
      props: ['disabled', 'size', 'variant'],
    },
  },
}

describe('ItemLedger', () => {
  const mountLedger = (props: Partial<InstanceType<typeof ItemLedger>['$props']> = {}) =>
    mount(ItemLedger, {
      props: {
        items: [item({ itemId: 'a', code: 'kd01' })],
        dimensions: [dimension('d1', 'directive')],
        diff: null,
        frozen: false,
        scaleCodes: ['likert5'],
        ...props,
      },
      global,
    })

  it('is a real table with column and row headers', () => {
    const wrapper = mountLedger()
    // A grid of divs would read as nothing to a screen reader; the DoD requires the real thing.
    expect(wrapper.find('table caption').exists()).toBe(true)
    expect(wrapper.findAll('thead th[scope="col"]').length).toBeGreaterThan(0)
    expect(wrapper.find('tbody th[scope="row"]').text()).toBe('kd01')
  })

  it('renders the diff as text, not as a class alone', () => {
    const wrapper = mountLedger({
      diff: diff({ stemChanged: [{ itemId: 'a', code: 'kd01', before: 'old', after: 'new' }] }),
    })
    expect(wrapper.text()).toContain('Teks item')
  })

  it('shows an em dash for an unchanged row rather than an empty cell', () => {
    expect(mountLedger({ diff: diff() }).text()).toContain('—')
  })

  it('states reverse-coding in words next to the checkbox', () => {
    const off = mountLedger()
    expect(off.text()).toContain('Tidak')
    const on = mountLedger({ items: [item({ itemId: 'a', code: 'kd01', reverseCoded: true })] })
    expect(on.text()).toContain('Ya')
  })

  it('emits toggleReverse with the new value when the checkbox changes', async () => {
    const wrapper = mountLedger()
    await wrapper.find('input[type="checkbox"]').setValue(true)
    expect(wrapper.emitted('toggleReverse')).toEqual([['a', true]])
  })

  it('discloses the dimension picker, and says so with aria-expanded', async () => {
    const wrapper = mountLedger()
    const toggle = wrapper.find('button[aria-controls="dimensions-vi-a"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.text()).toContain('0 dimensi')

    await toggle.trigger('click')
    expect(
      wrapper.find('button[aria-controls="dimensions-vi-a"]').attributes('aria-expanded')
    ).toBe('true')
    expect(wrapper.find('#dimensions-vi-a').exists()).toBe(true)
  })

  it('makes each chip a button carrying aria-pressed, so it is keyboard-operable', async () => {
    const wrapper = mountLedger()
    await wrapper.find('button[aria-controls="dimensions-vi-a"]').trigger('click')

    const chip = wrapper.findAll('#dimensions-vi-a button')[0]!
    expect(chip.attributes('aria-pressed')).toBe('false')
    // The kind is spelled out rather than encoded in the chip's colour.
    expect(chip.text()).toContain('directive')
    expect(chip.text()).toContain('style')

    await chip.trigger('click')
    expect(wrapper.emitted('setDimensions')).toEqual([['a', ['d1']]])
  })

  it('emits the remaining ids when a selected chip is toggled off', async () => {
    const wrapper = mountLedger({
      items: [
        item({
          itemId: 'a',
          code: 'kd01',
          dimensions: [
            { id: 'd1', code: 'directive', kind: 'style' },
            { id: 'd2', code: 'other', kind: 'domain' },
          ],
        }),
      ],
      dimensions: [dimension('d1', 'directive'), dimension('d2', 'other', 'domain')],
    })
    await wrapper.find('button[aria-controls="dimensions-vi-a"]').trigger('click')
    await wrapper.findAll('#dimensions-vi-a button')[0]!.trigger('click')
    expect(wrapper.emitted('setDimensions')).toEqual([['a', ['d2']]])
  })

  describe('the trailing row', () => {
    it('exists on an open version and is absent on a frozen one', () => {
      expect(mountLedger().find('[data-testid="ledger-trailing-row"]').exists()).toBe(true)
      expect(
        mountLedger({ frozen: true }).find('[data-testid="ledger-trailing-row"]').exists()
      ).toBe(false)
    })

    it('appends an item once code and stem are valid', async () => {
      const wrapper = mountLedger()
      const inputs = wrapper.find('[data-testid="ledger-trailing-row"]').findAll('input')
      await inputs[0]!.setValue('kd02')
      await inputs[1]!.setValue('Saya bertanya lebih dulu.')

      await wrapper.find('[data-testid="ledger-trailing-row"] button').trigger('click')
      expect(wrapper.emitted('appendItem')).toEqual([
        [{ code: 'kd02', stem: 'Saya bertanya lebih dulu.', scaleCode: 'likert5' }],
      ])
    })

    it('refuses a code the engine CHECK would reject, and says why', async () => {
      const wrapper = mountLedger()
      const inputs = wrapper.find('[data-testid="ledger-trailing-row"]').findAll('input')
      await inputs[0]!.setValue('KD-02')
      await inputs[1]!.setValue('stem')

      expect(wrapper.find('[role="alert"]').text()).toContain('huruf kecil')
      await wrapper.find('[data-testid="ledger-trailing-row"] button').trigger('click')
      expect(wrapper.emitted('appendItem')).toBeUndefined()
    })

    it('refuses a code already used in this version', async () => {
      const wrapper = mountLedger()
      const inputs = wrapper.find('[data-testid="ledger-trailing-row"]').findAll('input')
      await inputs[0]!.setValue('kd01')
      await inputs[1]!.setValue('stem')
      expect(wrapper.find('[role="alert"]').text()).toContain('sudah dipakai')
    })
  })

  it('renders a frozen version without inputs and says the text is a snapshot', () => {
    const wrapper = mountLedger({ frozen: true })
    expect(wrapper.find('table caption').text()).toContain('Snapshot')
    expect(wrapper.find('input[type="checkbox"]').attributes('disabled')).toBeDefined()
  })

  it('tells the author what to do when the selection is empty', () => {
    expect(mountLedger({ items: [] }).text()).toContain('Belum ada item')
  })
})

describe('DimensionMatrix', () => {
  const items = [
    item({
      itemId: 'a',
      code: 'kd01',
      dimensions: [{ id: 'd1', code: 'directive', kind: 'style' }],
    }),
  ]
  const dimensions = [dimension('d1', 'directive'), dimension('d2', 'never_used', 'axis')]

  it('is a real table with both row and column headers', () => {
    const wrapper = mount(DimensionMatrix, { props: { items, dimensions }, global })
    expect(wrapper.findAll('thead th[scope="col"]').length).toBe(dimensions.length + 1)
    expect(wrapper.find('tbody th[scope="row"]').text()).toBe('kd01')
    expect(wrapper.find('tfoot th[scope="row"]').text()).toContain('Jumlah item')
  })

  /** The whole reason this view exists as its own screen (#50). */
  it('names the dimensions no item measures, in text', () => {
    const wrapper = mount(DimensionMatrix, { props: { items, dimensions }, global })
    const status = wrapper.find('[role="status"]')
    expect(status.text()).toContain('1 dimensi belum dipetakan')
    expect(status.text()).toContain('never_used')
    expect(wrapper.find('tfoot').text()).toContain('belum dipetakan')
  })

  it('says so plainly when every dimension is covered', () => {
    const wrapper = mount(DimensionMatrix, {
      props: { items, dimensions: [dimension('d1', 'directive')] },
      global,
    })
    expect(wrapper.find('[role="status"]').text()).toContain('Setiap dimensi dipetakan')
  })

  it('gives every cell an accessible name rather than a bare glyph', () => {
    const wrapper = mount(DimensionMatrix, { props: { items, dimensions }, global })
    const labels = wrapper
      .findAll('tbody td span[aria-label]')
      .map((n) => n.attributes('aria-label'))
    expect(labels).toContain('kd01 mengukur directive')
    expect(labels).toContain('kd01 tidak mengukur never_used')
  })

  it('shows the per-dimension count', () => {
    const wrapper = mount(DimensionMatrix, { props: { items, dimensions }, global })
    const footCells = wrapper.findAll('tfoot td').map((n) => n.text())
    expect(footCells[0]).toContain('1')
    expect(footCells[1]).toContain('0')
  })
})

describe('PublishReview', () => {
  const mapped = item({
    itemId: 'a',
    code: 'kd01',
    dimensions: [{ id: 'd1', code: 'directive', kind: 'style' }],
  })

  const mountReview = (props: Record<string, unknown> = {}) =>
    mount(PublishReview, {
      props: { version: version({ items: [mapped] }), diff: diff(), ...props },
      global,
    })

  /**
   * The condition #49's rewording decision depends on: the old wording has to be on screen, not
   * merely the fact that it changed.
   */
  it('shows the source wording and the current wording verbatim', () => {
    const wrapper = mountReview({
      diff: diff({
        stemChanged: [
          { itemId: 'a', code: 'kd01', before: 'Kalimat lama.', after: 'Kalimat baru.' },
        ],
        totalChanges: 1,
      }),
    })
    expect(wrapper.text()).toContain('Kalimat lama.')
    expect(wrapper.text()).toContain('Kalimat baru.')
    // Labelled, not conveyed by position or strikethrough alone.
    expect(wrapper.text()).toContain('Sebelum')
    expect(wrapper.text()).toContain('Sesudah')
  })

  it('lists added, removed, moved and reverse-coding changes', () => {
    const wrapper = mountReview({
      diff: diff({
        added: [{ itemId: 'b', code: 'kd02', position: 1 }],
        removed: [{ itemId: 'c', code: 'kd03', position: 2 }],
        moved: [{ itemId: 'a', code: 'kd01', from: 0, to: 1 }],
        reverseCodingChanged: [{ itemId: 'a', code: 'kd01', from: false, to: true }],
        totalChanges: 4,
      }),
    })
    const text = wrapper.text()
    expect(text).toContain('Ditambahkan')
    expect(text).toContain('Dihapus')
    expect(text).toContain('Dipindah')
    expect(text).toContain('Reverse-coding')
  })

  it('keeps publish disabled until the acknowledgement is ticked', async () => {
    const wrapper = mountReview({ diff: diff({ totalChanges: 2 }) })
    const button = wrapper.find('[data-testid="publish-button"]')
    expect(button.attributes('disabled')).toBeDefined()
    // The reason is stated next to the button, not left to be inferred.
    expect(wrapper.text()).toContain('Centang konfirmasi')

    await wrapper.find('[data-testid="publish-acknowledge"]').setValue(true)
    expect(wrapper.find('[data-testid="publish-button"]').attributes('disabled')).toBeUndefined()
  })

  it('names the change count in the acknowledgement', () => {
    expect(mountReview({ diff: diff({ totalChanges: 7 }) }).text()).toContain('7 perubahan')
  })

  it('emits publish only once armed', async () => {
    const wrapper = mountReview()
    await wrapper.find('[data-testid="publish-acknowledge"]').setValue(true)
    await wrapper.find('[data-testid="publish-button"]').trigger('click')
    expect(wrapper.emitted('publish')).toHaveLength(1)
  })

  it('stays disabled and states the fault when an item has no dimension', async () => {
    const wrapper = mountReview({
      version: version({ items: [item({ itemId: 'b', code: 'kd02' })] }),
    })
    await wrapper.find('[data-testid="publish-acknowledge"]').setValue(true)

    expect(wrapper.find('[data-testid="publish-button"]').attributes('disabled')).toBeDefined()
    const alert = wrapper.find('[role="alert"]')
    expect(alert.text()).toContain('kd02')
    expect(wrapper.text()).toContain('Selesaikan hal di atas')
  })

  it('says a version with no source has nothing to compare against', () => {
    const wrapper = mountReview({ diff: diff({ blank: true, sourceVersionId: null }) })
    expect(wrapper.text()).toContain('tidak diturunkan dari versi lain')
  })

  it('warns that publishing is irreversible', () => {
    expect(mountReview().text()).toContain('tidak dapat diubah')
  })
})

describe('ItemLedger with no scale on the instrument', () => {
  /**
   * The dead end this suite originally missed: a freshly created instrument has no scale, so no
   * item can reference one. Add used to sit enabled and the failure came back blaming the item
   * code, which is the wrong cause.
   */
  const mountEmpty = () =>
    mount(ItemLedger, {
      props: {
        items: [],
        dimensions: [],
        diff: null,
        frozen: false,
        scaleCodes: [],
      },
      global,
    })

  it('keeps Add disabled even with a valid code and stem typed in', async () => {
    // Filled in deliberately: with the fields empty the button is disabled anyway, so asserting on
    // an untouched row would pass with the bug present and prove nothing.
    const wrapper = mountEmpty()
    const inputs = wrapper.find('[data-testid="ledger-trailing-row"]').findAll('input')
    await inputs[0]!.setValue('kd01')
    await inputs[1]!.setValue('a perfectly good stem')

    const button = wrapper.find('[data-testid="ledger-trailing-row"] button')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('says a scale is missing, and where to make one', () => {
    const alert = mountEmpty().find('[role="alert"]')
    expect(alert.text()).toContain('belum punya scale')
    expect(alert.text()).toContain('Skala & dimensi')
  })

  it('does not emit appendItem even if the button is invoked', async () => {
    const wrapper = mountEmpty()
    const inputs = wrapper.find('[data-testid="ledger-trailing-row"]').findAll('input')
    await inputs[0]!.setValue('kd01')
    await inputs[1]!.setValue('a stem')
    await wrapper.find('[data-testid="ledger-trailing-row"] button').trigger('click')
    expect(wrapper.emitted('appendItem')).toBeUndefined()
  })
})

describe('BankEditor', () => {
  const mountBank = (props: Record<string, unknown> = {}) =>
    mount(BankEditor, { props: { scales: [], dimensions: [], ...props }, global })

  it('tells an empty instrument that an item needs a scale first', () => {
    const text = mountBank().text()
    expect(text).toContain('Belum ada scale')
    expect(text).toContain('Belum ada dimensi')
  })

  it('lists existing scales with their anchor points as readable text', () => {
    const wrapper = mountBank({
      scales: [
        {
          id: 's1',
          code: 'likert5',
          name: 'Likert 5',
          points: [
            { value: 1, label: 'Sangat tidak sesuai' },
            { value: 5, label: 'Sangat sesuai' },
          ],
        },
      ],
    })
    expect(wrapper.find('[data-testid="scale-table"] th[scope="row"]').text()).toBe('likert5')
    expect(wrapper.text()).toContain('1 = Sangat tidak sesuai')
    expect(wrapper.text()).toContain('5 = Sangat sesuai')
  })

  it('survives a stored points value that is not the expected shape', () => {
    // The column is `text` with only a `json_valid` CHECK behind it, so a malformed-but-valid JSON
    // value is reachable. Rendering "[object Object]" would be worse than showing it plainly.
    const wrapper = mountBank({
      scales: [{ id: 's1', code: 'odd', name: 'Odd', points: 'not-an-array' }],
    })
    expect(wrapper.text()).toContain('—')
  })

  it('emits createScale with numeric anchor values', async () => {
    const wrapper = mountBank()
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('likert5')
    await inputs[1]!.setValue('Likert 5')
    // Two anchor rows are present by default: value/label, value/label.
    await inputs[3]!.setValue('Sangat tidak sesuai')
    await inputs[5]!.setValue('Sangat sesuai')

    const save = wrapper.findAll('button').find((b) => b.text() === 'Simpan scale')!
    expect(save.attributes('disabled')).toBeUndefined()
    await save.trigger('click')

    expect(wrapper.emitted('createScale')).toEqual([
      [
        {
          code: 'likert5',
          name: 'Likert 5',
          points: [
            { value: 1, label: 'Sangat tidak sesuai' },
            { value: 5, label: 'Sangat sesuai' },
          ],
        },
      ],
    ])
  })

  it('refuses a scale with fewer than two labelled anchor points', async () => {
    const wrapper = mountBank()
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('likert5')
    await inputs[1]!.setValue('Likert 5')
    await inputs[3]!.setValue('only one')

    expect(wrapper.find('[role="alert"]').text()).toContain('minimal dua anchor point')
    const save = wrapper.findAll('button').find((b) => b.text() === 'Simpan scale')!
    await save.trigger('click')
    expect(wrapper.emitted('createScale')).toBeUndefined()
  })

  it('refuses duplicate anchor values', async () => {
    const wrapper = mountBank()
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('likert5')
    await inputs[1]!.setValue('Likert 5')
    await inputs[2]!.setValue('1')
    await inputs[3]!.setValue('a')
    await inputs[4]!.setValue('1')
    await inputs[5]!.setValue('b')
    expect(wrapper.find('[role="alert"]').text()).toContain('tidak boleh berulang')
  })

  it('refuses a scale code the engine CHECK would reject', async () => {
    const wrapper = mountBank()
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('Likert-5')
    await inputs[1]!.setValue('Likert 5')
    expect(wrapper.find('[role="alert"]').text()).toContain('huruf kecil')
  })

  it('refuses a scale code already used on this instrument', async () => {
    const wrapper = mountBank({
      scales: [{ id: 's1', code: 'likert5', name: 'Likert 5', points: [] }],
    })
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('likert5')
    await inputs[1]!.setValue('Another')
    expect(wrapper.find('[role="alert"]').text()).toContain('sudah dipakai')
  })

  it('emits createDimension with the chosen kind', async () => {
    const wrapper = mountBank()
    const dimensionFieldset = wrapper.findAll('fieldset')[1]!
    const inputs = dimensionFieldset.findAll('input')
    await inputs[0]!.setValue('directive')
    await inputs[1]!.setValue('Directive')
    await dimensionFieldset.find('select').setValue('axis')

    await wrapper.findAll('button').find((b) => b.text() === 'Simpan dimensi')!.trigger('click')
    expect(wrapper.emitted('createDimension')).toEqual([
      [{ code: 'directive', name: 'Directive', kind: 'axis' }],
    ])
  })

  it('keeps both tables real, with row headers', () => {
    const wrapper = mountBank({
      scales: [{ id: 's1', code: 'likert5', name: 'L', points: [] }],
      dimensions: [{ id: 'd1', code: 'directive', name: 'D', kind: 'style', description: null }],
    })
    for (const testid of ['scale-table', 'dimension-table']) {
      const table = wrapper.find(`[data-testid="${testid}"]`)
      expect(table.find('caption').exists()).toBe(true)
      expect(table.findAll('th[scope="col"]').length).toBeGreaterThan(0)
      expect(table.find('th[scope="row"]').exists()).toBe(true)
    }
  })
})
