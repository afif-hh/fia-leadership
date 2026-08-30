import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { assessmentSessions, assessmentVersions } from '../../db/schema/assessment'
import { auditLogs } from '../../db/schema/platform'
import {
  IncompleteResponseSetError,
  InvalidAnswerError,
  NotFoundError,
  SessionAlreadySubmittedError,
  VersionNotTakeableError,
  getSession,
  saveAnswer,
  startSession,
  submitSession,
} from '../../domain/assessment'
import { seedPublishedVersion, seedUnpublishedVersion } from '../fixtures/assessment-taking'
import { freshDb, type TestDb } from '../setup/db'
import { rejectionOf } from '../setup/rejection'

const CONSENT_VERSION = 'v1'

describe('taking service', () => {
  let t: TestDb
  beforeEach(async () => {
    t = await freshDb()
  })
  afterEach(async () => {
    await t.drop()
  })

  const start = (versionId: string, userId: string) =>
    startSession(t.db, { userId, versionId, consentPolicyVersion: CONSENT_VERSION })

  /** Answers every item, so the session is submittable. */
  async function answerAll(sessionId: string, userId: string, versionItemIds: string[]) {
    for (const versionItemId of versionItemIds) {
      await saveAnswer(t.db, { sessionId, userId, versionItemId, answerValue: 3 })
    }
  }

  describe('start', () => {
    it('returns the whole item set in position order, not a page', async () => {
      // #60's one-long-page layout is what forces this: the client has no way to ask for more.
      const { versionId, versionItemIds } = await seedPublishedVersion(t, { itemCount: 4 })
      const detail = await start(versionId, 'u1')

      expect(detail.items.map((i) => i.versionItemId)).toEqual(versionItemIds)
      expect(detail.items.map((i) => i.position)).toEqual([0, 1, 2, 3])
      expect(detail.items[0]!.scalePoints).toHaveLength(5)
    })

    it('stamps the consent version that authorised it', async () => {
      const { versionId } = await seedPublishedVersion(t)
      const detail = await start(versionId, 'u1')
      expect(detail.session.consentPolicyVersion).toBe(CONSENT_VERSION)
    })

    it('resumes the existing session rather than creating a second one', async () => {
      const { versionId, versionItemIds } = await seedPublishedVersion(t)
      const first = await start(versionId, 'u1')
      await saveAnswer(t.db, {
        sessionId: first.session.id,
        userId: 'u1',
        versionItemId: versionItemIds[0]!,
        answerValue: 4,
      })

      const second = await start(versionId, 'u1')

      expect(second.session.id).toBe(first.session.id)
      expect(second.answers[versionItemIds[0]!]).toBe(4)

      const rows = await t.db
        .select()
        .from(assessmentSessions)
        .where(eq(assessmentSessions.versionId, versionId))
      expect(rows).toHaveLength(1)
    })

    it.each(['draft', 'review'] as const)('refuses a %s version', async (status) => {
      const { versionId } = await seedUnpublishedVersion(t, { status })
      await expect(start(versionId, 'u1')).rejects.toThrow(VersionNotTakeableError)
    })

    it('refuses a retired version', async () => {
      const { versionId } = await seedPublishedVersion(t)
      await t.db
        .update(assessmentVersions)
        .set({ status: 'retired', retiredAt: new Date() })
        .where(eq(assessmentVersions.id, versionId))

      await expect(start(versionId, 'u1')).rejects.toThrow(VersionNotTakeableError)
    })

    it('reports an unknown version as not found', async () => {
      await expect(start(crypto.randomUUID(), 'u1')).rejects.toThrow(NotFoundError)
    })
  })

  /**
   * The asymmetry #58 called out as easy to implement wrongly: retirement means "stop handing this
   * out", not "cancel what is in flight". A student 35 items into 40 must not lose that work to an
   * administrative decision unrelated to them.
   */
  describe('a version retired mid-session', () => {
    async function startThenRetire() {
      const { versionId, versionItemIds } = await seedPublishedVersion(t, { itemCount: 2 })
      const { session } = await start(versionId, 'u1')
      await t.db
        .update(assessmentVersions)
        .set({ status: 'retired', retiredAt: new Date() })
        .where(eq(assessmentVersions.id, versionId))
      return { sessionId: session.id, versionItemIds }
    }

    it('still accepts saves', async () => {
      const { sessionId, versionItemIds } = await startThenRetire()
      await expect(
        saveAnswer(t.db, {
          sessionId,
          userId: 'u1',
          versionItemId: versionItemIds[0]!,
          answerValue: 2,
        })
      ).resolves.toBeUndefined()
    })

    it('still accepts submit', async () => {
      const { sessionId, versionItemIds } = await startThenRetire()
      await answerAll(sessionId, 'u1', versionItemIds)
      const session = await submitSession(t.db, { sessionId, userId: 'u1' })
      expect(session.status).toBe('submitted')
    })
  })

  describe('ownership', () => {
    /**
     * Row ownership is this layer's job, not the policy layer's: the student's `CRUD` cell
     * resolves to an unconditional `allow` and never reaches a scope predicate (#65). A mismatch
     * reads as absent so an id the caller cannot see is indistinguishable from one that is gone.
     */
    it.each([
      ['getSession', (id: string) => getSession(t.db, { sessionId: id, userId: 'intruder' })],
      [
        'saveAnswer',
        (id: string) =>
          saveAnswer(t.db, {
            sessionId: id,
            userId: 'intruder',
            versionItemId: 'whatever',
            answerValue: 1,
          }),
      ],
      ['submitSession', (id: string) => submitSession(t.db, { sessionId: id, userId: 'intruder' })],
    ])("reports another user's session as not found via %s", async (_name, call) => {
      const { versionId } = await seedPublishedVersion(t)
      const { session } = await start(versionId, 'owner')

      await expect(call(session.id)).rejects.toThrow(NotFoundError)
    })
  })

  describe('saveAnswer', () => {
    it('upserts, so a retry overwrites rather than duplicating', async () => {
      const { versionId, versionItemIds } = await seedPublishedVersion(t)
      const { session } = await start(versionId, 'u1')
      const versionItemId = versionItemIds[0]!

      await saveAnswer(t.db, { sessionId: session.id, userId: 'u1', versionItemId, answerValue: 2 })
      await saveAnswer(t.db, { sessionId: session.id, userId: 'u1', versionItemId, answerValue: 5 })

      const detail = await getSession(t.db, { sessionId: session.id, userId: 'u1' })
      expect(detail.answers).toEqual({ [versionItemId]: 5 })
    })

    it('rejects a value that is not one of the item’s anchors', async () => {
      const { versionId, versionItemIds } = await seedPublishedVersion(t)
      const { session } = await start(versionId, 'u1')

      await expect(
        saveAnswer(t.db, {
          sessionId: session.id,
          userId: 'u1',
          versionItemId: versionItemIds[0]!,
          answerValue: 9,
        })
      ).rejects.toThrow(InvalidAnswerError)
    })

    /**
     * #58 named this the single most likely PII leak in the flow: the reflexive phrasing is
     * `Invalid answer value: 9`, and that string goes straight into a log the moment anything
     * catches and reports it.
     */
    it('never names the rejected answer in the error', async () => {
      const { versionId, versionItemIds } = await seedPublishedVersion(t)
      const { session } = await start(versionId, 'u1')

      const error = await rejectionOf(
        saveAnswer(t.db, {
          sessionId: session.id,
          userId: 'u1',
          versionItemId: versionItemIds[0]!,
          answerValue: 9,
        }),
        InvalidAnswerError
      )

      expect(error.message).not.toMatch(/\b9\b/)
      expect(JSON.stringify(error)).not.toMatch(/\b9\b/)
      // The item id is what a debugger actually needs, and it is not the protected value.
      expect(error.message).toContain(versionItemIds[0]!)
    })

    it('reports an item from another version as not found', async () => {
      const { versionId } = await seedPublishedVersion(t)
      const other = await seedPublishedVersion(t, { versionNo: 2 })
      const { session } = await start(versionId, 'u1')

      await expect(
        saveAnswer(t.db, {
          sessionId: session.id,
          userId: 'u1',
          versionItemId: other.versionItemIds[0]!,
          answerValue: 3,
        })
      ).rejects.toThrow(NotFoundError)
    })

    it('refuses once the session is submitted', async () => {
      const { versionId, versionItemIds } = await seedPublishedVersion(t, { itemCount: 1 })
      const { session } = await start(versionId, 'u1')
      await answerAll(session.id, 'u1', versionItemIds)
      await submitSession(t.db, { sessionId: session.id, userId: 'u1' })

      await expect(
        saveAnswer(t.db, {
          sessionId: session.id,
          userId: 'u1',
          versionItemId: versionItemIds[0]!,
          answerValue: 1,
        })
      ).rejects.toThrow(SessionAlreadySubmittedError)
    })
  })

  describe('submit', () => {
    it('refuses an incomplete response set and names what is missing', async () => {
      // SC-06 in docs/assessment/golden-tests.md. The names are what the HTTP layer turns into
      // the 422 envelope's `fields` array, so an empty or wrong list is a user-visible bug.
      const { versionId, versionItemIds } = await seedPublishedVersion(t, { itemCount: 3 })
      const { session } = await start(versionId, 'u1')
      await saveAnswer(t.db, {
        sessionId: session.id,
        userId: 'u1',
        versionItemId: versionItemIds[0]!,
        answerValue: 3,
      })

      const error = await rejectionOf(
        submitSession(t.db, { sessionId: session.id, userId: 'u1' }),
        IncompleteResponseSetError
      )

      expect(error.missingVersionItemIds).toEqual([versionItemIds[1]!, versionItemIds[2]!])
    })

    it('records submitted_at, which the CHECK requires', async () => {
      const { versionId, versionItemIds } = await seedPublishedVersion(t, { itemCount: 2 })
      const { session } = await start(versionId, 'u1')
      await answerAll(session.id, 'u1', versionItemIds)

      const submitted = await submitSession(t.db, { sessionId: session.id, userId: 'u1' })
      expect(submitted.status).toBe('submitted')
      expect(submitted.submittedAt).toBeInstanceOf(Date)
    })

    it('refuses a second submit', async () => {
      const { versionId, versionItemIds } = await seedPublishedVersion(t, { itemCount: 1 })
      const { session } = await start(versionId, 'u1')
      await answerAll(session.id, 'u1', versionItemIds)
      await submitSession(t.db, { sessionId: session.id, userId: 'u1' })

      await expect(submitSession(t.db, { sessionId: session.id, userId: 'u1' })).rejects.toThrow(
        SessionAlreadySubmittedError
      )
    })

    it('audits with ids and a count, and no answer content', async () => {
      const { versionId, versionItemIds } = await seedPublishedVersion(t, { itemCount: 2 })
      const { session } = await start(versionId, 'u1')
      await answerAll(session.id, 'u1', versionItemIds)
      await submitSession(t.db, { sessionId: session.id, userId: 'u1' })

      const rows = await t.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.eventType, 'assessment.session_submitted'))

      expect(rows).toHaveLength(1)
      expect(rows[0]!.actorUserId).toBe('u1')
      expect(JSON.parse(rows[0]!.detail!)).toEqual({
        event_type: 'assessment.session_submitted',
        session_id: session.id,
        version_id: versionId,
        item_count: 2,
      })
    })

    it('audits nothing for start or save', async () => {
      // Each already has its own durable record; an audited autosave would write a row per item
      // per student for no investigative gain (#65).
      const { versionId, versionItemIds } = await seedPublishedVersion(t)
      const { session } = await start(versionId, 'u1')
      await saveAnswer(t.db, {
        sessionId: session.id,
        userId: 'u1',
        versionItemId: versionItemIds[0]!,
        answerValue: 3,
      })

      const rows = await t.db.select().from(auditLogs)
      expect(rows).toHaveLength(0)
    })
  })
})
