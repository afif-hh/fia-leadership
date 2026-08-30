import { describe, expect, it } from 'vitest'

import {
  ALLOWED_SESSION_TRANSITIONS,
  IllegalSessionTransitionError,
  assertSessionTransitionAllowed,
  isOpenForAnswers,
} from '../../domain/assessment/taking-state-machine'
import { SESSION_STATUSES } from '../../db/schema/assessment'

describe('session transitions', () => {
  it('allows in_progress → submitted', () => {
    expect(() => assertSessionTransitionAllowed('in_progress', 'submitted')).not.toThrow()
  })

  it('declares submitted → scored without anything reaching it yet', () => {
    // The contract #58 left waiting for the scoring effort. It is legal in the map, and migration
    // 0007 already freezes `scored` rows, so the two must agree even though no caller exists.
    expect(ALLOWED_SESSION_TRANSITIONS.submitted).toContain('scored')
  })

  it.each([
    ['submitted', 'in_progress'],
    ['scored', 'submitted'],
    ['scored', 'in_progress'],
  ] as const)('refuses to go backwards from %s to %s', (from, to) => {
    expect(() => assertSessionTransitionAllowed(from, to)).toThrow(IllegalSessionTransitionError)
  })

  it('refuses to skip in_progress → scored', () => {
    // The CHECK constraint holds membership in the three values, never the order between them,
    // so this skip would pass the database untouched. This function is the only thing stopping it.
    expect(() => assertSessionTransitionAllowed('in_progress', 'scored')).toThrow(
      IllegalSessionTransitionError
    )
  })

  it('leaves scored terminal', () => {
    expect(ALLOWED_SESSION_TRANSITIONS.scored).toEqual([])
  })

  it('covers every status the schema declares', () => {
    // If someone widens SESSION_STATUSES without adding a row here, the map stops being total and
    // `ALLOWED_SESSION_TRANSITIONS[status]` starts returning undefined at runtime.
    for (const status of SESSION_STATUSES) {
      expect(ALLOWED_SESSION_TRANSITIONS[status]).toBeDefined()
    }
  })
})

describe('isOpenForAnswers', () => {
  it('is true only while in progress', () => {
    expect(isOpenForAnswers('in_progress')).toBe(true)
    expect(isOpenForAnswers('submitted')).toBe(false)
    // Scoring does not make its own inputs editable again.
    expect(isOpenForAnswers('scored')).toBe(false)
  })
})
