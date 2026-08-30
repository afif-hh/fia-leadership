/**
 * A synthetic published instrument, ready to be taken.
 *
 * Synthetic on purpose (#69): `docs/assessment/kdpgk-v1.md` deliberately ships no item bank, and
 * these tests need a *valid shape*, not psychometrically real copy. Nothing here should be read
 * as a draft of the real instrument.
 *
 * The version is left `published` with complete snapshots, which is the state the taking flow
 * only ever sees — `server/tests/integration/assessment-immutability.test.ts` has its own
 * pre-publish helpers because it is testing the publish gate itself, which is the opposite end of
 * the same lifecycle.
 */
import {
  assessmentDimensions,
  assessmentInstruments,
  assessmentItems,
  assessmentScales,
  assessmentSessions,
  assessmentVersionItemDimensions,
  assessmentVersionItems,
  assessmentVersions,
} from '../../db/schema/assessment'
import type { SessionStatus } from '../../db/schema/assessment'
import type { TestDb } from '../setup/db'

/** Five anchors, the shape `scale_points_snapshot` carries in production (#58). */
export const SCALE_POINTS = [
  { value: 1, label: 'Sangat Tidak Setuju' },
  { value: 2, label: 'Tidak Setuju' },
  { value: 3, label: 'Netral' },
  { value: 4, label: 'Setuju' },
  { value: 5, label: 'Sangat Setuju' },
]

export interface PublishedInstrument {
  instrumentId: string
  versionId: string
  /** In `position` order, which is the only ordering a version has — there is no sections table. */
  versionItemIds: string[]
}

/**
 * A version left in `draft` or `review`, for the cases that need one the taking flow must refuse.
 *
 * It has to be a separate seed rather than a published version moved backwards: publish is
 * one-way, and both the freeze trigger (0004) and the `published_at` consistency trigger (0005)
 * reject the reverse transition outright.
 */
export function seedUnpublishedVersion(
  t: TestDb,
  options: { itemCount?: number; versionNo?: number; status?: 'draft' | 'review' } = {}
): Promise<PublishedInstrument> {
  return seedVersion(t, { ...options, publish: false, draftStatus: options.status ?? 'draft' })
}

export function seedPublishedVersion(
  t: TestDb,
  options: { itemCount?: number; versionNo?: number } = {}
): Promise<PublishedInstrument> {
  return seedVersion(t, { ...options, publish: true })
}

async function seedVersion(
  t: TestDb,
  {
    itemCount = 3,
    versionNo = 1,
    publish,
    draftStatus = 'draft',
  }: {
    itemCount?: number
    versionNo?: number
    publish: boolean
    draftStatus?: 'draft' | 'review'
  }
): Promise<PublishedInstrument> {
  const now = new Date()
  const instrumentId = crypto.randomUUID()
  const scaleId = crypto.randomUUID()
  const dimensionId = crypto.randomUUID()
  const versionId = crypto.randomUUID()

  await t.db.insert(assessmentInstruments).values({
    id: instrumentId,
    code: `kdpgk_${versionNo}`,
    name: 'KDPGK (sintetis)',
    createdAt: now,
    createdBy: 'tester',
  })
  await t.db.insert(assessmentScales).values({
    id: scaleId,
    instrumentId,
    code: 'likert5',
    name: 'Likert 5',
    points: JSON.stringify(SCALE_POINTS),
  })
  await t.db.insert(assessmentDimensions).values({
    id: dimensionId,
    instrumentId,
    code: 'directive',
    name: 'Directive',
    kind: 'style',
  })

  const versionItemIds: string[] = []

  // The version is inserted as `draft` and flipped afterwards: the publish gate refuses a
  // transition to `published` while any child row is missing a snapshot, and the freeze triggers
  // refuse child writes once it is published. Draft-then-flip is the same order the real publish
  // transaction uses, and the only order that works.
  await t.db.insert(assessmentVersions).values({
    id: versionId,
    instrumentId,
    versionNo,
    status: 'draft',
    createdAt: now,
    createdBy: 'tester',
  })

  for (let position = 0; position < itemCount; position++) {
    const itemId = crypto.randomUUID()
    const versionItemId = crypto.randomUUID()
    const stem = `Pernyataan sintetis nomor ${position + 1}.`

    await t.db.insert(assessmentItems).values({
      id: itemId,
      instrumentId,
      code: `kd${String(position + 1).padStart(2, '0')}`,
      stem,
      scaleId,
      createdAt: now,
      createdBy: 'tester',
    })
    await t.db.insert(assessmentVersionItems).values({
      id: versionItemId,
      versionId,
      itemId,
      position,
      stemSnapshot: stem,
      scalePointsSnapshot: JSON.stringify(SCALE_POINTS),
    })
    await t.db.insert(assessmentVersionItemDimensions).values({
      versionItemId,
      dimensionId,
      dimensionCodeSnapshot: 'directive',
    })
    versionItemIds.push(versionItemId)
  }

  if (publish) {
    await t.client.execute({
      sql: 'UPDATE assessment_versions SET status = ?, published_at = ? WHERE id = ?',
      args: ['published', Date.now(), versionId],
    })
  } else if (draftStatus !== 'draft') {
    await t.client.execute({
      sql: 'UPDATE assessment_versions SET status = ? WHERE id = ?',
      args: [draftStatus, versionId],
    })
  }

  return { instrumentId, versionId, versionItemIds }
}

/**
 * A session row written directly, bypassing the service layer that does not exist yet (#77).
 * `submitted_at` is filled for any non-`in_progress` status because the CHECK requires it.
 */
export async function seedSession(
  t: TestDb,
  {
    versionId,
    userId = crypto.randomUUID(),
    status = 'in_progress',
    consentPolicyVersion = 'v1',
  }: {
    versionId: string
    userId?: string
    status?: SessionStatus
    consentPolicyVersion?: string
  }
): Promise<{ sessionId: string; userId: string }> {
  const sessionId = crypto.randomUUID()
  await t.db.insert(assessmentSessions).values({
    id: sessionId,
    userId,
    versionId,
    status,
    consentPolicyVersion,
    startedAt: new Date(),
    submittedAt: status === 'in_progress' ? null : new Date(),
  })
  return { sessionId, userId }
}
