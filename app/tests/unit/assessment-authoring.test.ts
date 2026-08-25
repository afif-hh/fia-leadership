import { describe, it, expect } from 'vitest'

import {
  changeLabelFor,
  changesByItem,
  dimensionCoverage,
  isValidCode,
  itemMeasures,
  parseBulkPaste,
  publishGate,
  type Dimension,
  type VersionDetail,
  type VersionDiff,
  type VersionItem,
} from '../../lib/assessment-authoring'

/**
 * The rules the ledger, the matrix and the publish gate each render (#54).
 *
 * Kept separate from the component tests on purpose: these are the decisions, and they are worth
 * asserting without a DOM in the way.
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
  stem: 'stem',
  scalePoints: null,
  scaleCode: 'likert5',
  dimensions: [],
  ...overrides,
})

const emptyDiff = (overrides: Partial<VersionDiff> = {}): VersionDiff => ({
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

describe('the ledger diff column', () => {
  it('maps every diff category to the item that carries it', () => {
    const changes = changesByItem(
      emptyDiff({
        added: [{ itemId: 'a', code: 'kd01', position: 0 }],
        moved: [{ itemId: 'b', code: 'kd02', from: 0, to: 1 }],
        reverseCodingChanged: [{ itemId: 'c', code: 'kd03', from: false, to: true }],
        stemChanged: [{ itemId: 'd', code: 'kd04', before: 'old', after: 'new' }],
      })
    )

    expect(changes.get('a')).toEqual(['added'])
    expect(changes.get('b')).toEqual(['moved'])
    expect(changes.get('c')).toEqual(['reverseCoding'])
    expect(changes.get('d')).toEqual(['stem'])
  })

  it('accumulates several changes on one item, because reworded and moved is ordinary', () => {
    const changes = changesByItem(
      emptyDiff({
        moved: [{ itemId: 'a', code: 'kd01', from: 0, to: 3 }],
        stemChanged: [{ itemId: 'a', code: 'kd01', before: 'old', after: 'new' }],
      })
    )
    expect(changes.get('a')).toEqual(['moved', 'stem'])
  })

  it('is empty for a version with no source, which has nothing to differ from', () => {
    expect(changesByItem(emptyDiff({ blank: true, sourceVersionId: null })).size).toBe(0)
    expect(changesByItem(null).size).toBe(0)
  })

  it('renders the change as text, never as a bare marker', () => {
    // WCAG 2.2 AA: the diff may not be carried by colour alone, so the label is the carrier.
    expect(changeLabelFor(['stem'])).toBe('Teks item')
    expect(changeLabelFor(['moved', 'stem'])).toBe('Urutan, Teks item')
    expect(changeLabelFor([])).toBe('')
    expect(changeLabelFor(undefined)).toBe('')
  })
})

describe('the dimension matrix', () => {
  const style = dimension('d1', 'directive')
  const domain = dimension('d2', 'decision_making', 'domain')
  const orphan = dimension('d3', 'never_used', 'axis')

  const items = [
    item({
      itemId: 'a',
      code: 'kd01',
      dimensions: [{ id: 'd1', code: 'directive', kind: 'style' }],
    }),
    item({
      itemId: 'b',
      code: 'kd02',
      dimensions: [
        { id: 'd1', code: 'directive', kind: 'style' },
        { id: 'd2', code: 'decision_making', kind: 'domain' },
      ],
    }),
  ]

  it('counts the items measuring each dimension', () => {
    const coverage = dimensionCoverage([style, domain, orphan], items)
    expect(coverage.map((entry) => [entry.dimension.code, entry.itemCount])).toEqual([
      ['directive', 2],
      ['decision_making', 1],
      ['never_used', 0],
    ])
  })

  /** The finding this view exists to surface: a dimension no item measures scores nothing. */
  it('flags a dimension no item measures', () => {
    const coverage = dimensionCoverage([style, orphan], items)
    expect(coverage.find((e) => e.dimension.code === 'never_used')?.unmapped).toBe(true)
    expect(coverage.find((e) => e.dimension.code === 'directive')?.unmapped).toBe(false)
  })

  it('reports coverage for an empty selection as entirely unmapped', () => {
    expect(dimensionCoverage([style, domain], []).every((e) => e.unmapped)).toBe(true)
  })

  it('answers the per-cell question', () => {
    expect(itemMeasures(items[1]!, 'd2')).toBe(true)
    expect(itemMeasures(items[0]!, 'd2')).toBe(false)
  })
})

describe('the publish gate', () => {
  const mapped = item({
    itemId: 'a',
    code: 'kd01',
    dimensions: [{ id: 'd1', code: 'directive', kind: 'style' }],
  })

  it('arms only when every blocker is cleared and the acknowledgement is ticked', () => {
    const gate = publishGate({
      version: version({ items: [mapped] }),
      diff: emptyDiff({ totalChanges: 3 }),
      acknowledged: true,
    })
    expect(gate.blockers).toEqual([])
    expect(gate.armed).toBe(true)
    expect(gate.changeCount).toBe(3)
  })

  it('refuses until the acknowledgement is ticked, and says so', () => {
    const gate = publishGate({
      version: version({ items: [mapped] }),
      diff: emptyDiff(),
      acknowledged: false,
    })
    expect(gate.armed).toBe(false)
    expect(gate.blockers.map((b) => b.code)).toEqual(['not-acknowledged'])
  })

  it('refuses a version with no items', () => {
    const gate = publishGate({ version: version(), diff: null, acknowledged: true })
    expect(gate.blockers.map((b) => b.code)).toContain('no-items')
    expect(gate.armed).toBe(false)
  })

  it('names the unmapped item codes rather than only counting them', () => {
    const gate = publishGate({
      version: version({ items: [mapped, item({ itemId: 'b', code: 'kd02' })] }),
      diff: null,
      acknowledged: true,
    })
    expect(gate.unmappedItemCodes).toEqual(['kd02'])
    const blocker = gate.blockers.find((b) => b.code === 'unmapped-items')
    expect(blocker?.message).toContain('kd02')
  })

  it('refuses a draft, because draft to published is not a legal transition', () => {
    const gate = publishGate({
      version: version({ status: 'draft', items: [mapped] }),
      diff: null,
      acknowledged: true,
    })
    expect(gate.blockers.map((b) => b.code)).toContain('wrong-status')
  })

  it('refuses a frozen version and distinguishes published from retired', () => {
    for (const [status, expected] of [
      ['published', /dipublikasikan/],
      ['retired', /retire/],
    ] as const) {
      const gate = publishGate({
        version: version({ status, frozen: true, items: [mapped] }),
        diff: null,
        acknowledged: true,
      })
      const blocker = gate.blockers.find((b) => b.code === 'frozen')
      expect(blocker?.message).toMatch(expected)
    }
  })

  it('reports a change count of zero for a version with no source', () => {
    const gate = publishGate({
      version: version({ items: [mapped] }),
      diff: emptyDiff({ blank: true, sourceVersionId: null, totalChanges: 0 }),
      acknowledged: true,
    })
    expect(gate.changeCount).toBe(0)
  })
})

describe('the bulk paste path', () => {
  it('accepts tab-separated rows', () => {
    const { rows, rejectedLines } = parseBulkPaste(
      'kd01\tSaya memutuskan sendiri.\nkd02\tSaya bertanya.'
    )
    expect(rows).toEqual([
      { code: 'kd01', stem: 'Saya memutuskan sendiri.' },
      { code: 'kd02', stem: 'Saya bertanya.' },
    ])
    expect(rejectedLines).toEqual([])
  })

  it('accepts comma-separated rows', () => {
    expect(parseBulkPaste('kd01,Saya memutuskan sendiri.').rows).toEqual([
      { code: 'kd01', stem: 'Saya memutuskan sendiri.' },
    ])
  })

  it('prefers tab when a stem contains commas', () => {
    expect(parseBulkPaste('kd01\tSaya menimbang, lalu memutuskan.').rows).toEqual([
      { code: 'kd01', stem: 'Saya menimbang, lalu memutuskan.' },
    ])
  })

  it('keeps only the first separator, so the stem stays whole', () => {
    expect(parseBulkPaste('kd01,a,b,c').rows).toEqual([{ code: 'kd01', stem: 'a,b,c' }])
  })

  it('skips blank lines and a trailing newline without complaining', () => {
    const { rows, rejectedLines } = parseBulkPaste('kd01\tone\n\nkd02\ttwo\n')
    expect(rows).toHaveLength(2)
    expect(rejectedLines).toEqual([])
  })

  it('reports unparseable lines by number instead of dropping them', () => {
    const { rows, rejectedLines } = parseBulkPaste(
      'kd01\tone\nrubbish-with-no-separator\nkd03\tthree'
    )
    expect(rows.map((r) => r.code)).toEqual(['kd01', 'kd03'])
    expect(rejectedLines).toEqual([2])
  })

  it('rejects a row with an empty code or an empty stem', () => {
    expect(parseBulkPaste('\tstem only').rejectedLines).toEqual([1])
    expect(parseBulkPaste('kd01\t').rejectedLines).toEqual([1])
  })
})

describe('code validation mirrors the engine CHECK', () => {
  it.each(['kd01', 'a', 'decision_making', 'x_9'])('accepts %s', (code) => {
    expect(isValidCode(code)).toBe(true)
  })

  it.each(['KD01', 'kd-01', 'kd 01', '', 'kd.01'])('rejects %s', (code) => {
    expect(isValidCode(code)).toBe(false)
  })
})
