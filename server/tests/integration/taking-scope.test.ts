import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ScopeNotImplementedError, authorize, resolveScope } from '../../domain/identity'
import { seedPublishedVersion, seedSession } from '../fixtures/assessment-taking'
import { freshDb, type TestDb } from '../setup/db'
import { rejectionOf } from '../setup/rejection'
import type { AuthPrincipal } from '../../domain/identity'

/**
 * Who may read *someone else's* assessment session (#65).
 *
 * The asymmetry is the thing worth testing, because getting it backwards is invisible in review:
 * a student's `CRUD` cell resolves to an unconditional `allow` and never reaches a predicate at
 * all, so nothing here protects a student's own row. That is `taking.ts`'s job, covered in
 * `taking-service.test.ts`.
 */
describe('the ownAssessment cell', () => {
  let t: TestDb
  beforeEach(async () => {
    t = await freshDb()
  })
  afterEach(async () => {
    await t.drop()
  })

  const principal = (id: string): AuthPrincipal =>
    ({ userId: id, roles: ['lecturer_coach'] }) as AuthPrincipal

  const scope = (sessionId?: string) =>
    resolveScope('ownAssessment', {
      db: t.db,
      principal: principal('coach'),
      target: sessionId === undefined ? {} : { sessionId },
    })

  describe('the matrix, before any predicate runs', () => {
    it('lets a student straight through without scoping', () => {
      // If this ever becomes `scoped`, the predicate below starts gating students too, and every
      // student read would begin throwing — so it is asserted rather than assumed.
      for (const action of ['create', 'read', 'update', 'delete'] as const) {
        expect(authorize(['student'], 'ownAssessment', action)).toBe('allow')
      }
    })

    it('sends a lecturer/coach to the predicate, and only for reads', () => {
      expect(authorize(['lecturer_coach'], 'ownAssessment', 'read')).toBe('scoped')
      expect(authorize(['lecturer_coach'], 'ownAssessment', 'update')).toBe('deny')
    })

    it('denies a researcher outright', () => {
      expect(authorize(['researcher'], 'ownAssessment', 'read')).toBe('deny')
    })
  })

  describe('what the predicate can answer', () => {
    it('refuses an in-progress session, whatever the assignment would say', async () => {
      // Settled in #65: half-finished answers are visible to nobody but their owner. No
      // assignment could make this readable, so it is a complete answer, not a fallback.
      const { versionId } = await seedPublishedVersion(t)
      const { sessionId } = await seedSession(t, { versionId, status: 'in_progress' })

      await expect(scope(sessionId)).resolves.toBe(false)
    })

    it('refuses a session that does not exist', async () => {
      await expect(scope(crypto.randomUUID())).resolves.toBe(false)
    })

    it('refuses when no session is identified', async () => {
      // A missing target would otherwise read as an unrestricted query — the same trap the
      // `auditLog` predicate guards against.
      await expect(scope(undefined)).resolves.toBe(false)
    })
  })

  /**
   * The half that cannot be answered, and must not be guessed.
   *
   * #65 requires the predicate to check the assignment relationship, but assignment and cohort
   * orchestration are explicitly out of scope on the taking-flow map, so there is no table to
   * read. Returning `false` here would be precisely the mistake `ScopeNotImplementedError`'s own
   * message warns about: `false` is a decision, and this foundation has no basis for one.
   */
  describe('what the predicate cannot answer yet', () => {
    it.each(['submitted', 'scored'] as const)(
      'throws rather than guessing for a %s session',
      async (status) => {
        const { versionId } = await seedPublishedVersion(t)
        const { sessionId } = await seedSession(t, { versionId, status })

        await expect(scope(sessionId)).rejects.toThrow(ScopeNotImplementedError)
      }
    )

    it('names the resource, so the failure points at what is missing', async () => {
      const { versionId } = await seedPublishedVersion(t)
      const { sessionId } = await seedSession(t, { versionId, status: 'submitted' })

      const error = await rejectionOf(scope(sessionId), ScopeNotImplementedError)
      expect(error.resource).toBe('ownAssessment')
    })
  })
})
