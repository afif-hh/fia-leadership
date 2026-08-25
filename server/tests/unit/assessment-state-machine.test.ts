import { describe, expect, it } from 'vitest'

import {
  ALLOWED_TRANSITIONS,
  IllegalTransitionError,
  assertTransitionAllowed,
} from '../../domain/assessment/state-machine'
import { VERSION_STATUSES } from '../../db/schema/assessment'

describe('assessment version state machine', () => {
  it('allows exactly the forward chain draft -> review -> published -> retired', () => {
    expect(() => assertTransitionAllowed('draft', 'review')).not.toThrow()
    expect(() => assertTransitionAllowed('review', 'published')).not.toThrow()
    expect(() => assertTransitionAllowed('published', 'retired')).not.toThrow()
  })

  it('rejects every other transition', () => {
    const legal = new Set(['draft->review', 'review->published', 'published->retired'])
    let checked = 0

    for (const from of VERSION_STATUSES) {
      for (const to of VERSION_STATUSES) {
        if (legal.has(`${from}->${to}`)) continue
        expect(() => assertTransitionAllowed(from, to), `${from} -> ${to}`).toThrow(
          IllegalTransitionError
        )
        checked++
      }
    }

    // 4 statuses x 4 statuses = 16 pairs, minus the 3 legal ones.
    expect(checked).toBe(13)
  })

  it('never lets a version go backwards, including published -> draft', () => {
    expect(() => assertTransitionAllowed('published', 'draft')).toThrow(IllegalTransitionError)
    expect(() => assertTransitionAllowed('retired', 'published')).toThrow(IllegalTransitionError)
  })

  it('leaves retired as a dead end', () => {
    expect(ALLOWED_TRANSITIONS.retired).toEqual([])
  })

  it('names the illegal transition in the error', () => {
    expect(() => assertTransitionAllowed('published', 'draft')).toThrow(IllegalTransitionError)

    try {
      assertTransitionAllowed('published', 'draft')
      throw new Error('expected assertTransitionAllowed to throw')
    } catch (error) {
      const illegal = error as IllegalTransitionError
      expect(illegal.from).toBe('published')
      expect(illegal.to).toBe('draft')
      expect(illegal.message).toMatch(/published.*draft/)
    }
  })
})
