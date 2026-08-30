import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'

import { assessmentResponses, assessmentSessions } from '../../db/schema/assessment'
import { seedPublishedVersion, seedSession } from '../fixtures/assessment-taking'
import { freshDb, type TestDb } from '../setup/db'

/**
 * The database-level half of NFR-11: a score is traceable to the response set that produced it,
 * so once a session is submitted its answers must stop moving (#58, migration 0007).
 *
 * Every rejection is asserted through `t.client` rather than Drizzle, so a trigger abort arrives
 * as a `LibsqlError` carrying `.code` instead of Drizzle's wrapper — the same technique
 * `assessment-immutability.test.ts` uses for the version triggers.
 */
describe('assessment_responses freeze', () => {
  let t: TestDb
  beforeEach(async () => {
    t = await freshDb()
  })
  afterEach(async () => {
    await t.drop()
  })

  /**
   * The criterion 0001 and 0004 both set: a BEFORE trigger does not block DROP TABLE and is
   * dropped with the table it guards, so a later rebuild could silently remove the guarantee.
   * This asserts they exist after ALL migrations have run, not merely after 0007.
   */
  it('has its three triggers present after every migration has run', async () => {
    const rows = await t.db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`
    )
    const names = rows.map((r) => r.name)
    expect(names).toContain('assessment_responses_no_insert_frozen')
    expect(names).toContain('assessment_responses_no_update_frozen')
    expect(names).toContain('assessment_responses_no_delete_frozen')
  })

  describe('while the session is in_progress', () => {
    it('accepts an insert, and an upsert that overwrites it', async () => {
      const { versionId, versionItemIds } = await seedPublishedVersion(t)
      const { sessionId } = await seedSession(t, { versionId })
      const versionItemId = versionItemIds[0]!

      await t.db.insert(assessmentResponses).values({ sessionId, versionItemId, answerValue: 2 })

      // The upsert the autosave contract relies on (#64): the composite primary key is the
      // conflict target, which is why that endpoint needs no idempotency mechanism of its own.
      await t.db
        .insert(assessmentResponses)
        .values({ sessionId, versionItemId, answerValue: 5 })
        .onConflictDoUpdate({
          target: [assessmentResponses.sessionId, assessmentResponses.versionItemId],
          set: { answerValue: 5 },
        })

      const rows = await t.db
        .select()
        .from(assessmentResponses)
        .where(eq(assessmentResponses.sessionId, sessionId))

      expect(rows).toHaveLength(1)
      expect(rows[0]!.answerValue).toBe(5)
    })

    it('accepts a delete', async () => {
      const { versionId, versionItemIds } = await seedPublishedVersion(t)
      const { sessionId } = await seedSession(t, { versionId })
      const versionItemId = versionItemIds[0]!

      await t.db.insert(assessmentResponses).values({ sessionId, versionItemId, answerValue: 3 })
      await t.db
        .delete(assessmentResponses)
        .where(
          and(
            eq(assessmentResponses.sessionId, sessionId),
            eq(assessmentResponses.versionItemId, versionItemId)
          )
        )

      const rows = await t.db
        .select()
        .from(assessmentResponses)
        .where(eq(assessmentResponses.sessionId, sessionId))
      expect(rows).toHaveLength(0)
    })
  })

  describe('once the session is submitted', () => {
    /** An answered, in-progress session, then submitted — the real order of events. */
    async function submittedSessionWithAnswer() {
      const { versionId, versionItemIds } = await seedPublishedVersion(t, { itemCount: 2 })
      const { sessionId } = await seedSession(t, { versionId })

      await t.db.insert(assessmentResponses).values({
        sessionId,
        versionItemId: versionItemIds[0]!,
        answerValue: 4,
      })
      await t.db
        .update(assessmentSessions)
        .set({ status: 'submitted', submittedAt: new Date() })
        .where(eq(assessmentSessions.id, sessionId))

      return { sessionId, versionItemIds }
    }

    it('rejects an UPDATE at the database level', async () => {
      const { sessionId, versionItemIds } = await submittedSessionWithAnswer()

      await expect(
        t.client.execute({
          sql: 'UPDATE assessment_responses SET answer_value = ? WHERE session_id = ? AND version_item_id = ?',
          args: [1, sessionId, versionItemIds[0]!],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('rejects a DELETE at the database level', async () => {
      const { sessionId } = await submittedSessionWithAnswer()

      await expect(
        t.client.execute({
          sql: 'DELETE FROM assessment_responses WHERE session_id = ?',
          args: [sessionId],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    /**
     * INSERT extends #58's resolution, which named only UPDATE and DELETE. Adding an answer to a
     * submitted session changes the response set a score was computed from just as much as
     * editing one does, and 0004 blocks INSERT on its child tables for the same reason.
     */
    it('rejects an INSERT of an answer that was never given', async () => {
      const { sessionId, versionItemIds } = await submittedSessionWithAnswer()

      await expect(
        t.client.execute({
          sql: 'INSERT INTO assessment_responses (session_id, version_item_id, answer_value) VALUES (?, ?, ?)',
          args: [sessionId, versionItemIds[1]!, 3],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('surfaces the freeze message rather than an opaque failure', async () => {
      const { sessionId } = await submittedSessionWithAnswer()

      await expect(
        t.client.execute({
          sql: 'DELETE FROM assessment_responses WHERE session_id = ?',
          args: [sessionId],
        })
      ).rejects.toThrow(/frozen once its session is submitted/)
    })

    /**
     * The freeze is per session, not per table — one student submitting must not stop another
     * from answering. A trigger written with a bare `EXISTS` over the table rather than a
     * subselect keyed on the row's own `session_id` would pass every test above and fail this one.
     */
    it('leaves a different, still-open session writable', async () => {
      const { sessionId: submittedId, versionItemIds } = await submittedSessionWithAnswer()
      const { versionId: otherVersionId, versionItemIds: otherItems } = await seedPublishedVersion(
        t,
        { versionNo: 2 }
      )
      const { sessionId: openId } = await seedSession(t, { versionId: otherVersionId })

      await t.db.insert(assessmentResponses).values({
        sessionId: openId,
        versionItemId: otherItems[0]!,
        answerValue: 2,
      })

      const rows = await t.db
        .select()
        .from(assessmentResponses)
        .where(eq(assessmentResponses.sessionId, openId))
      expect(rows).toHaveLength(1)

      // And the submitted one is still frozen, so this is not just a permissive trigger.
      await expect(
        t.client.execute({
          sql: 'UPDATE assessment_responses SET answer_value = ? WHERE session_id = ? AND version_item_id = ?',
          args: [1, submittedId, versionItemIds[0]!],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })
  })

  /**
   * `scored` is the state the scoring effort will move sessions into (#70). It is not reachable
   * through any implemented transition yet, but the freeze must already cover it — a score being
   * computed is not a reason for its inputs to become editable again.
   */
  it('keeps answers frozen once the session is scored', async () => {
    const { versionId, versionItemIds } = await seedPublishedVersion(t)
    const { sessionId } = await seedSession(t, { versionId })

    await t.db.insert(assessmentResponses).values({
      sessionId,
      versionItemId: versionItemIds[0]!,
      answerValue: 4,
    })
    await t.client.execute({
      sql: 'UPDATE assessment_sessions SET status = ?, submitted_at = ? WHERE id = ?',
      args: ['scored', Date.now(), sessionId],
    })

    await expect(
      t.client.execute({
        sql: 'DELETE FROM assessment_responses WHERE session_id = ?',
        args: [sessionId],
      })
    ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
  })
})
