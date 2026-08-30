import { describe, expect, it } from 'vitest'

import {
  ResponseSetError,
  ScoringConfigError,
  bandFor,
  gridCoordinate,
  quadrantFor,
  score,
  shown,
} from '../../services/scoring/index.ts'
import {
  GOLDEN_BANDS,
  MAXIMUM_VECTOR,
  MINIMUM_VECTOR,
  MIXED_EXPECTED,
  MIXED_VECTOR,
  SCALE_MAX,
  SCALE_MIN,
  TIED_VECTOR,
  goldenScoring,
  goldenScoringV2,
  goldenVersion,
} from '../fixtures/scoring/golden-v1.ts'

/**
 * `golden-tests.md` SC-01 … SC-08 plus the property invariants it requires alongside them.
 *
 * SC-06 and SC-07 are the two that cannot be tested here: one is about what the submit endpoint
 * refuses and the other about what the database refuses to store twice. Both live in
 * `server/tests/integration/scoring-run.test.ts`, against a real SQLite file. The engine's half of
 * SC-06 — that an incomplete response set is refused rather than scored around — is here.
 */

describe('SC-01 · every answer at its minimum', () => {
  it('scores the exact lower bound', () => {
    const run = score(goldenVersion, goldenScoring, MINIMUM_VECTOR)

    expect(run.report.overall.score).toBe(0)
    expect(run.report.overall.band).toBe('emerging')
    for (const dimension of [...run.report.domains, ...run.report.styles]) {
      expect(dimension.score).toBe(0)
    }
    expect(run.report.grid).toEqual({ task: 1, people: 1, quadrant: 'impoverished' })
  })

  it('reaches that bound by reversing the reverse-coded item, not by answering 1 everywhere', () => {
    // The failure this catches is reverse coding silently doing nothing: with it3 ignored, an
    // all-1s vector would score 0 and this suite would still be green.
    const allOnes = { it1: 1, it2: 1, it3: 1, it4: 1, it5: 1, it6: 1 }
    expect(score(goldenVersion, goldenScoring, allOnes).report.overall.score).not.toBe(0)
  })
})

describe('SC-02 · every answer at its maximum', () => {
  it('scores the exact upper bound', () => {
    const run = score(goldenVersion, goldenScoring, MAXIMUM_VECTOR)

    expect(run.report.overall.score).toBe(100)
    expect(run.report.overall.band).toBe('advanced')
    for (const dimension of [...run.report.domains, ...run.report.styles]) {
      expect(dimension.score).toBe(100)
    }
    expect(run.report.grid).toEqual({ task: 9, people: 9, quadrant: 'team' })
  })
})

describe('SC-03 · a mixed known vector', () => {
  const run = score(goldenVersion, goldenScoring, MIXED_VECTOR)

  it('matches the hand-computed golden values', () => {
    expect(run.report.overall).toEqual(MIXED_EXPECTED.overall)
    expect(run.report.domains).toEqual(MIXED_EXPECTED.domains)
    expect(run.report.styles).toEqual(MIXED_EXPECTED.styles)
    expect(run.report.dominant).toEqual(MIXED_EXPECTED.dominant)
    expect(run.report.grid).toEqual(MIXED_EXPECTED.grid)
  })

  it('writes the ledger at full precision, unrounded', () => {
    const beta = run.ledger.find(
      (entry) => entry.scoreType === 'normalized' && entry.dimensionCode === 'd_beta'
    )
    // 58.333… is what the report rounds to 58. The ledger keeps the whole thing.
    expect(beta?.scoreValue).toBeCloseTo((7 / 12) * 100, 12)
    expect(beta?.scoreValue).not.toBe(58)
  })

  it('gives every ledger row but readiness a scoring rule to cite', () => {
    for (const entry of run.ledger) {
      if (entry.scoreType === 'readiness') expect(entry.scoringRuleId).toBeNull()
      else expect(entry.scoringRuleId).toBeTruthy()
    }
  })

  it('names a domain as a strength or a priority, never as both', () => {
    const overlap = run.report.strengths.filter((code) =>
      run.report.developmentPriorities.includes(code)
    )
    expect(overlap).toEqual([])
  })
})

describe('ADR-010 §9 · developmental flags on an instrument long enough to have both ends', () => {
  /**
   * The golden fixture has two domains, so `domains.slice(3)` is empty there and the no-overlap
   * rule is never exercised by it — the assertion in SC-03 above compares two empty lists and
   * would pass with the rule deleted. This builds an eight-domain instrument, which is the shape
   * kdpgk-v1.md actually specifies, so the rule has a vector that reaches it.
   */
  const DOMAIN_COUNT = 8
  const wideVersion = {
    id: 'wide-av-1',
    items: Array.from({ length: DOMAIN_COUNT }, (_, index) => ({
      versionItemId: `w${index}`,
      reverseCoded: false,
      scaleMin: 1,
      scaleMax: 5,
      dimensionCodes: [`dom_${index}`, 's_only'],
    })),
  }
  const wideScoring = {
    id: 'wide-sv-1',
    bands: GOLDEN_BANDS,
    dimensions: [
      ...Array.from({ length: DOMAIN_COUNT }, (_, index) => ({
        code: `dom_${index}`,
        kind: 'domain' as const,
        weight: 1,
        scoringRuleId: `rule-dom-${index}`,
      })),
      { code: 's_only', kind: 'style' as const, weight: 1, scoringRuleId: 'rule-style' },
    ],
    taskAxisCode: null,
    peopleAxisCode: null,
  }
  // Descending answers, so the domain order is known: dom_0 highest, dom_7 lowest.
  const descending = Object.fromEntries(
    Array.from({ length: DOMAIN_COUNT }, (_, index) => [`w${index}`, 5 - (index % 5)])
  )

  const run = score(wideVersion, wideScoring, descending)

  it('reports three strengths and three priorities, both non-empty', () => {
    expect(run.report.strengths).toHaveLength(3)
    expect(run.report.developmentPriorities).toHaveLength(3)
  })

  it('draws priorities from what is left after the strengths', () => {
    const overlap = run.report.strengths.filter((code) =>
      run.report.developmentPriorities.includes(code)
    )
    expect(overlap).toEqual([])
  })

  it('orders strengths highest first and priorities lowest first', () => {
    const scoreOf = (code: string) => run.report.domains.find((d) => d.code === code)!.score
    const strengthScores = run.report.strengths.map(scoreOf)
    const priorityScores = run.report.developmentPriorities.map(scoreOf)

    expect([...strengthScores].sort((a, b) => b - a)).toEqual(strengthScores)
    expect([...priorityScores].sort((a, b) => a - b)).toEqual(priorityScores)
    expect(Math.min(...strengthScores)).toBeGreaterThanOrEqual(Math.max(...priorityScores))
  })
})

describe('SC-04 · a dominant tie', () => {
  const run = score(goldenVersion, goldenScoring, TIED_VECTOR)

  it('flags the hybrid rather than picking a winner silently', () => {
    expect(run.report.dominant.hybrid).toBe(true)
  })

  it('breaks the tie deterministically, by code', () => {
    expect(run.report.dominant.primary).toBe('s_one')
    expect(run.report.dominant.secondary).toBe('s_two')
  })

  it('orders the tie the same way whichever order the items arrive in', () => {
    // Sort stability alone would not give this: it defers the question to input order, which is
    // exactly what a re-run must not depend on.
    const reversed = { ...goldenVersion, items: [...goldenVersion.items].reverse() }
    expect(score(reversed, goldenScoring, TIED_VECTOR).report.dominant).toEqual(run.report.dominant)
  })
})

describe('SC-05 · Task and People extremes', () => {
  it('keeps the grid inside 1–9 for every reachable answer combination', () => {
    // Exhaustive over the two axis items, which is what "extremes" means here: 25 combinations,
    // every one of them plotted.
    for (let a = SCALE_MIN; a <= SCALE_MAX; a++) {
      for (let b = SCALE_MIN; b <= SCALE_MAX; b++) {
        const run = score(goldenVersion, goldenScoring, {
          ...MIXED_VECTOR,
          it1: a,
          it2: b,
          it3: a,
          it4: b,
        })
        const grid = run.report.grid!
        expect(grid.task).toBeGreaterThanOrEqual(1)
        expect(grid.task).toBeLessThanOrEqual(9)
        expect(grid.people).toBeGreaterThanOrEqual(1)
        expect(grid.people).toBeLessThanOrEqual(9)
      }
    }
  })

  it('maps a score beyond either end back into range', () => {
    expect(gridCoordinate(-40)).toBe(1)
    expect(gridCoordinate(180)).toBe(9)
  })
})

describe('SC-06 · an incomplete response set', () => {
  it('is refused, naming what is missing and never the answers', () => {
    const { it3: _omitted, ...incomplete } = MIXED_VECTOR

    try {
      score(goldenVersion, goldenScoring, incomplete)
      expect.unreachable('an incomplete response set must not be scored')
    } catch (error) {
      expect(error).toBeInstanceOf(ResponseSetError)
      const responseSetError = error as ResponseSetError
      expect(responseSetError.missingVersionItemIds).toEqual(['it3'])
      // The PII Rule, asserted structurally rather than by string search — the message carries
      // counts, and a count is a number indistinguishable from an answer by any substring test.
      // What matters is that the shape admits nothing else: three counts and no interpolated
      // value, and every carried field an item id.
      expect(responseSetError.message).toMatch(
        /^Response set rejected: \d+ unanswered, \d+ unknown, \d+ outside the item's anchors\.$/
      )
      const carried = [
        ...responseSetError.missingVersionItemIds,
        ...responseSetError.unknownVersionItemIds,
        ...responseSetError.outOfRangeVersionItemIds,
      ]
      for (const id of carried) expect(typeof id).toBe('string')
    }
  })

  it('refuses an answer outside the item’s own anchors', () => {
    const outOfRange = { ...MIXED_VECTOR, it1: 9 }
    expect(() => score(goldenVersion, goldenScoring, outOfRange)).toThrow(ResponseSetError)
  })

  it('refuses an answer for an item this version does not contain', () => {
    const foreign = { ...MIXED_VECTOR, 'item-from-another-version': 3 }
    expect(() => score(goldenVersion, goldenScoring, foreign)).toThrow(ResponseSetError)
  })
})

describe('SC-08 · a new scoring version', () => {
  it('produces different numbers from the same responses', () => {
    const first = score(goldenVersion, goldenScoring, MIXED_VECTOR)
    const second = score(goldenVersion, goldenScoringV2, MIXED_VECTOR)

    // Weights swapped: (1·50 + 2·58.333…)/3 = 55.555… → 56, and the stricter bands put that in
    // `developing` too — so the score has to be compared, not just the band.
    expect(second.report.overall.score).toBe(56)
    expect(second.report.overall.score).not.toBe(first.report.overall.score)
  })

  it('leaves the earlier run untouched', () => {
    // The engine is pure, so this is really a statement about shared state: scoring again must
    // not reach back into a result already handed out. The persisted half of SC-08 — that a
    // stored snapshot is unchanged — is in the integration suite.
    const first = score(goldenVersion, goldenScoring, MIXED_VECTOR)
    const before = structuredClone(first.report)
    score(goldenVersion, goldenScoringV2, MIXED_VECTOR)
    expect(first.report).toEqual(before)
  })
})

describe('property invariants', () => {
  /** Deterministic pseudo-random, so a failure is reproducible from the seed alone. */
  function* vectors(count: number): Generator<Record<string, number>> {
    let state = 20260830
    const next = () => {
      state = (state * 1103515245 + 12345) % 2147483648
      return state / 2147483648
    }
    for (let n = 0; n < count; n++) {
      const vector: Record<string, number> = {}
      for (const item of goldenVersion.items) {
        vector[item.versionItemId] = SCALE_MIN + Math.floor(next() * (SCALE_MAX - SCALE_MIN + 1))
      }
      yield vector
    }
  }

  it('keeps every normalized score within 0–100', () => {
    for (const vector of vectors(400)) {
      const run = score(goldenVersion, goldenScoring, vector)
      expect(run.report.overall.score).toBeGreaterThanOrEqual(0)
      expect(run.report.overall.score).toBeLessThanOrEqual(100)
      for (const entry of run.ledger) {
        if (entry.scoreType === 'raw') continue
        expect(entry.scoreValue).toBeGreaterThanOrEqual(0)
        expect(entry.scoreValue).toBeLessThanOrEqual(100)
      }
    }
  })

  it('keeps every grid coordinate within 1–9 × 1–9', () => {
    for (const vector of vectors(400)) {
      const grid = score(goldenVersion, goldenScoring, vector).report.grid!
      expect(grid.task).toBeGreaterThanOrEqual(1)
      expect(grid.task).toBeLessThanOrEqual(9)
      expect(grid.people).toBeGreaterThanOrEqual(1)
      expect(grid.people).toBeLessThanOrEqual(9)
    }
  })

  it('returns identical output for identical input', () => {
    for (const vector of vectors(200)) {
      expect(score(goldenVersion, goldenScoring, vector)).toEqual(
        score(goldenVersion, goldenScoring, vector)
      )
    }
  })
})

describe('the single rounding rule', () => {
  it('rounds halves upward', () => {
    expect(shown(69.5)).toBe(70)
    expect(shown(69.4999999999)).toBe(69)
  })

  it('assigns the band from the rounded figure, not the raw one', () => {
    // The bug this forbids: showing a student "70" beside a band computed from 69.6.
    expect(bandFor(GOLDEN_BANDS, shown(59.6))).toBe('established')
  })

  it('reads a band table in whatever order it is configured', () => {
    const shuffled = [...GOLDEN_BANDS].reverse()
    expect(bandFor(shuffled, 85)).toBe('advanced')
    expect(bandFor(shuffled, 0)).toBe('emerging')
  })
})

describe('quadrants', () => {
  it('names each corner and the middle', () => {
    expect(quadrantFor(9, 9)).toBe('team')
    expect(quadrantFor(9, 1)).toBe('produce_or_perish')
    expect(quadrantFor(1, 9)).toBe('country_club')
    expect(quadrantFor(1, 1)).toBe('impoverished')
    expect(quadrantFor(5, 5)).toBe('middle_of_road')
    expect(quadrantFor(5, 9)).toBe('middle_of_road')
  })
})

describe('a formula and an instrument that disagree', () => {
  it('refuses a dimension the items measure but no rule weights', () => {
    const withoutBeta = {
      ...goldenScoring,
      dimensions: goldenScoring.dimensions.filter((d) => d.code !== 'd_beta'),
    }
    expect(() => score(goldenVersion, withoutBeta, MIXED_VECTOR)).toThrow(ScoringConfigError)
  })

  it('refuses a rule for a dimension no item feeds', () => {
    const withGhost = {
      ...goldenScoring,
      dimensions: [
        ...goldenScoring.dimensions,
        { code: 'd_ghost', kind: 'domain' as const, weight: 1, scoringRuleId: 'rule-ghost' },
      ],
    }
    expect(() => score(goldenVersion, withGhost, MIXED_VECTOR)).toThrow(ScoringConfigError)
  })
})
