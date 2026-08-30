import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { assessmentVersions } from '../../db/schema/assessment'
import { listTakeableVersions } from '../../domain/assessment'
import {
  seedPublishedVersion,
  seedSession,
  seedUnpublishedVersion,
} from '../fixtures/assessment-taking'
import { freshDb, type TestDb } from '../setup/db'

/**
 * The student assessment list (#61). Version-oriented, scoped to one student, and shaped by two
 * rules that pull in opposite directions: a retired version must disappear from the list, *unless*
 * this student is mid-session on it.
 */
describe('listTakeableVersions', () => {
  let t: TestDb
  beforeEach(async () => {
    t = await freshDb()
  })
  afterEach(async () => {
    await t.drop()
  })

  const retire = (versionId: string) =>
    t.db
      .update(assessmentVersions)
      .set({ status: 'retired', retiredAt: new Date() })
      .where(eq(assessmentVersions.id, versionId))

  it('is empty when nothing is published', async () => {
    await seedUnpublishedVersion(t)
    await expect(listTakeableVersions(t.db, 'u1')).resolves.toEqual([])
  })

  it('omits draft and review versions entirely', async () => {
    // A student must not learn that an unpublished instrument exists.
    await seedUnpublishedVersion(t, { status: 'draft' })
    await seedUnpublishedVersion(t, { status: 'review', versionNo: 2 })
    await expect(listTakeableVersions(t.db, 'u1')).resolves.toEqual([])
  })

  it('lists a published version as available, with its item count', async () => {
    const { versionId } = await seedPublishedVersion(t, { itemCount: 4 })
    const [row] = await listTakeableVersions(t.db, 'u1')

    expect(row).toMatchObject({ versionId, state: 'available', itemCount: 4, retired: false })
  })

  it('reports an in-progress session so the row can offer "Lanjutkan"', async () => {
    const { versionId } = await seedPublishedVersion(t)
    await seedSession(t, { versionId, userId: 'u1' })

    const [row] = await listTakeableVersions(t.db, 'u1')
    expect(row!.state).toBe('in_progress')
  })

  it.each(['submitted', 'scored'] as const)(
    'reports a %s session as submitted, since neither offers the student an action',
    async (status) => {
      const { versionId } = await seedPublishedVersion(t)
      await seedSession(t, { versionId, userId: 'u1', status })

      const [row] = await listTakeableVersions(t.db, 'u1')
      expect(row!.state).toBe('submitted')
    }
  )

  describe('a retired version', () => {
    it('disappears for a student who never started it', async () => {
      const { versionId } = await seedPublishedVersion(t)
      await retire(versionId)

      await expect(listTakeableVersions(t.db, 'u1')).resolves.toEqual([])
    })

    it('stays visible to a student mid-session, so the work is not lost', async () => {
      // #58: retirement means "stop handing this out", not "cancel what is in flight".
      const { versionId } = await seedPublishedVersion(t)
      await seedSession(t, { versionId, userId: 'u1' })
      await retire(versionId)

      const [row] = await listTakeableVersions(t.db, 'u1')
      expect(row).toMatchObject({ versionId, state: 'in_progress', retired: true })
    })

    it('stays visible to a student who already submitted it', async () => {
      const { versionId } = await seedPublishedVersion(t)
      await seedSession(t, { versionId, userId: 'u1', status: 'submitted' })
      await retire(versionId)

      const [row] = await listTakeableVersions(t.db, 'u1')
      expect(row!.state).toBe('submitted')
    })
  })

  describe('scoping', () => {
    /**
     * The failure this guards is the one `scoped-narrowing.test.ts` exists for elsewhere: a join
     * that forgets to key on the caller returns a correct-looking list containing another
     * student's standing. Asserting the rows, not the status, is the only way to see it.
     */
    it("never lets another student's session change this student's row", async () => {
      const { versionId } = await seedPublishedVersion(t)
      await seedSession(t, { versionId, userId: 'someone-else', status: 'submitted' })

      const [row] = await listTakeableVersions(t.db, 'u1')
      expect(row!.state).toBe('available')
    })

    it('hides a retired version whose only session belongs to someone else', async () => {
      const { versionId } = await seedPublishedVersion(t)
      await seedSession(t, { versionId, userId: 'someone-else' })
      await retire(versionId)

      await expect(listTakeableVersions(t.db, 'u1')).resolves.toEqual([])
    })

    it('returns one row per version even when several students hold sessions', async () => {
      // A left join that matched more than one session row would duplicate the version.
      const { versionId } = await seedPublishedVersion(t)
      await seedSession(t, { versionId, userId: 'u1' })
      await seedSession(t, { versionId, userId: 'u2' })

      await expect(listTakeableVersions(t.db, 'u1')).resolves.toHaveLength(1)
    })
  })

  it('carries no consent state, which is per document rather than per assessment', async () => {
    // #59/#61: every row would carry the same value, so a per-row field would be noise that
    // invites a client to gate on the wrong thing.
    const { versionId } = await seedPublishedVersion(t)
    const [row] = await listTakeableVersions(t.db, 'u1')

    expect(row!.versionId).toBe(versionId)
    expect(Object.keys(row!)).not.toContain('consented')
    expect(Object.keys(row!)).not.toContain('consentPolicyVersion')
  })
})
