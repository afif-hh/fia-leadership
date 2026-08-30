import { describe, expect, it } from 'vitest'

import { ScoringConfigInputError, assertUsableBands } from '../../domain/assessment/scoring.ts'
import { bandFor } from '../../services/scoring/index.ts'

/**
 * The band table is ADR-gated configuration that is frozen the moment it is approved, and the
 * draft endpoint is the only place it can still be refused.
 *
 * The failure these guard against is quiet rather than loud. `bandFor` treats the lowest
 * configured `min` as an unconditional floor, so nothing downstream throws on a table that starts
 * at 50 — a student scoring 12 is simply told the wrong band, permanently, by a row nobody can
 * edit again.
 */

const usable = [
  { code: 'emerging', min: 0 },
  { code: 'developing', min: 40 },
  { code: 'established', min: 60 },
  { code: 'advanced', min: 80 },
]

function refusal(bands: { code: string; min: number }[]): ScoringConfigInputError {
  try {
    assertUsableBands(bands)
  } catch (error) {
    if (error instanceof ScoringConfigInputError) return error
    throw error
  }
  throw new Error('Expected that band table to be refused.')
}

describe('a usable band table', () => {
  it('is accepted', () => {
    expect(() => assertUsableBands(usable)).not.toThrow()
  })

  it('classifies every score the engine can produce', () => {
    for (let score = 0; score <= 100; score++) {
      expect(usable.some((band) => band.code === bandFor(usable, score))).toBe(true)
    }
  })
})

describe('a band table that cannot classify every score', () => {
  it('is refused when it has no band starting at 0', () => {
    const floorless = usable.map((band) => (band.min === 0 ? { ...band, min: 20 } : band))

    // The whole point, demonstrated before it is refused: nothing else in the system objects.
    expect(bandFor(floorless, 12)).toBe('emerging')
    expect(refusal(floorless).message).toMatch(/must start at 0/i)
  })

  it('is refused when it is empty', () => {
    expect(refusal([]).message).toMatch(/at least one/i)
  })

  it('is refused when a band starts outside 0–100', () => {
    expect(refusal([...usable, { code: 'beyond', min: 140 }]).message).toMatch(/0–100/)
    expect(refusal([{ code: 'below', min: -1 }]).message).toMatch(/0–100/)
  })

  it('is refused when two bands share a code', () => {
    const duplicated = [...usable, { code: 'advanced', min: 90 }]
    expect(refusal(duplicated).message).toMatch(/share a code/i)
  })

  it('is refused when two bands start at the same score', () => {
    const tied = [...usable, { code: 'peak', min: 80 }]
    expect(refusal(tied).message).toMatch(/same score/i)
  })
})

describe('the refusal', () => {
  it('names the field, so a 422 can carry it and a form can mark it', () => {
    expect(refusal([]).field).toBe('bands')
  })
})
