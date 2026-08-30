import { describe, expect, it } from 'vitest'

import { assessmentCodeSchema } from '../../http/assessment-code.ts'
import { mapDomainError } from '../../http/domain-errors.ts'
import { DuplicateCodeError } from '../../domain/assessment/index.ts'

/**
 * The two ways `POST /api/v1/assessment/instruments` used to answer 500.
 *
 * Both were reachable from the "Instrumen baru" form with no special effort — a capital letter in
 * the code, or a code the instrument list already showed. Each came back as a 500 whose body
 * carried the failed INSERT, its bound parameters and a stack trace.
 */

describe('assessmentCodeSchema', () => {
  it.each(['likert5', 'kdpgk_v1', 'a', 'x9'])('accepts %s', (code) => {
    expect(assessmentCodeSchema.parse(code)).toBe(code)
  })

  // Every one of these violates the CHECK the four bank tables carry, so without validation here
  // it reaches SQLite and returns a 500 instead of a 422 naming the field.
  it.each(['SMOKE01', 'has space', 'has-hyphen', 'aksen_é', ''])('rejects %s', (code) => {
    expect(() => assessmentCodeSchema.parse(code)).toThrow()
  })

  it('reports the failure as a 422 naming the field, without echoing the value', () => {
    let error: unknown
    try {
      assessmentCodeSchema.parse('NOT-A-CODE')
    } catch (thrown) {
      error = thrown
    }

    const mapped = mapDomainError(error)
    expect(mapped?.status).toBe(422)
    expect(mapped?.code).toBe('VALIDATION_FAILED')
    expect(JSON.stringify(mapped)).not.toContain('NOT-A-CODE')
  })
})

describe('mapDomainError for a taken code', () => {
  it('maps a duplicate code to 409 with the offending field, not a 500', () => {
    const mapped = mapDomainError(new DuplicateCodeError('instrument'))

    expect(mapped?.status).toBe(409)
    expect(mapped?.code).toBe('ASSESSMENT_CODE_TAKEN')
    expect(mapped?.fields).toEqual([{ path: 'code', code: 'TAKEN' }])
    // The old 500 body carried the statement and its parameters. Nothing SQL-shaped goes out.
    expect(mapped?.message).not.toMatch(/SQLITE|insert into/i)
  })
})
