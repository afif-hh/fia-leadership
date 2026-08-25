import { describe, expect, it } from 'vitest'
import * as z from 'zod/mini'

import { mapDomainError } from '../../http/domain-errors.ts'
import {
  CrossInstrumentError,
  IllegalTransitionError,
  NotFoundError,
  VersionFrozenError,
} from '../../domain/assessment/index.ts'

/**
 * The mapping from a domain error to `docs/architecture/api-design.md`'s status table.
 *
 * Without this, every one of these reached `runPolicyHandler` as an unhandled throw and became a
 * 500 — which would have discarded the actionable message #48 paired its triggers with a service
 * guard to produce.
 */
describe('mapDomainError', () => {
  it('maps a missing row to 404 without echoing the id', () => {
    const mapped = mapDomainError(new NotFoundError('version', 'secret-id-abc'))
    expect(mapped?.status).toBe(404)
    expect(mapped?.code).toBe('NOT_FOUND')
    // A caller who may not see a row must not learn it exists, so the id never comes back.
    expect(JSON.stringify(mapped)).not.toContain('secret-id-abc')
  })

  it('maps a frozen version to 409 with a stable, actionable code', () => {
    const mapped = mapDomainError(new VersionFrozenError('v1', 'published'))
    expect(mapped?.status).toBe(409)
    expect(mapped?.code).toBe('ASSESSMENT_VERSION_IMMUTABLE')
    expect(mapped?.message).toMatch(/new version/i)
    expect(mapped?.message).not.toMatch(/SQLITE/)
  })

  it('maps an illegal status transition to 409', () => {
    const mapped = mapDomainError(new IllegalTransitionError('published', 'draft'))
    expect(mapped?.status).toBe(409)
    expect(mapped?.code).toBe('ASSESSMENT_VERSION_TRANSITION_ILLEGAL')
  })

  it('maps a cross-instrument reference to 422 with a fields array', () => {
    const mapped = mapDomainError(new CrossInstrumentError('item'))
    expect(mapped?.status).toBe(422)
    expect(mapped?.fields).toEqual([])
  })

  it('maps a zod/mini failure to 422 listing paths but never values', () => {
    const schema = z.strictObject({ code: z.string() })
    let error: unknown
    try {
      schema.parse({ code: 123, leaked: 'must-not-appear' })
    } catch (caught) {
      error = caught
    }

    const mapped = mapDomainError(error)
    expect(mapped?.status).toBe(422)
    expect(mapped?.code).toBe('VALIDATION_FAILED')
    expect(mapped?.fields?.some((f) => f.path === 'code')).toBe(true)
    // 422 carries the path and the reason. Echoing the submitted value would reflect whatever the
    // caller sent — the PII Rule's concern, on the one status that reports request content.
    expect(JSON.stringify(mapped)).not.toContain('must-not-appear')
  })

  it('returns null for an error it does not recognise, so a bug stays a 500', () => {
    // Deliberate: dressing an unknown failure as a tidy 4xx would hide it.
    expect(mapDomainError(new Error('something unexpected'))).toBeNull()
    expect(mapDomainError('not even an error')).toBeNull()
  })
})
