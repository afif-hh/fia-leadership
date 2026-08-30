import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'

import * as identity from '../../schema/identity.ts'
import * as platform from '../../schema/platform.ts'
import * as assessment from '../../schema/assessment.ts'
import * as profile from '../../schema/profile.ts'
import type { Db } from '../../client.ts'
import {
  approveScoringVersion,
  createAssessmentRepository,
  createScoringVersion,
} from '../../../domain/assessment/index.ts'
import {
  AXES,
  BANDS,
  DIMENSIONS,
  DOMAINS,
  ITEMS,
  SCALE_POINTS_EN,
  SCALE_POINTS_ID,
  STYLES,
  WEIGHT,
} from './bank.ts'

/**
 * Seeds KDPGK v1: the instrument, its bank, an English translation of all of it, a published
 * version carrying all forty items, and an approved scoring version.
 *
 * Everything goes through the real domain API rather than through raw inserts, so the seed
 * exercises the same publish transaction, the same snapshot fill and the same approval path a Lab
 * Admin and an Academic Lead would. A seed that writes rows directly proves only that rows can be
 * written; this proves the flow works, and it is why running it is a meaningful smoke test.
 *
 * Idempotent: an existing `kdpgk` instrument means the work is done and the script exits without
 * touching it. It has to be, because a published version is immutable (FR-005) and a retired one
 * cannot be deleted — there is no "re-seed" that could clean up after a partial run, so the only
 * safe behaviour is to refuse to start one.
 *
 * The items are synthetic and unvalidated; see the header of `bank.ts`, and read it before using
 * any score this produces for anything.
 *
 * Usage:
 *   pnpm db:migrate && node server/db/seed/kdpgk/seed.ts
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node server/db/seed/kdpgk/seed.ts
 */

const url = process.env.TURSO_DATABASE_URL ?? 'file:./.data/dev.db'
const actorUserId = process.env.SEED_ACTOR ?? 'seed:kdpgk-v1'

const client = url.startsWith('file:')
  ? createClient({ url })
  : createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })

const db = drizzle(client, {
  schema: { ...identity, ...platform, ...assessment, ...profile },
}) as Db

try {
  const existing = await db
    .select({ id: assessment.assessmentInstruments.id })
    .from(assessment.assessmentInstruments)
    .where(eq(assessment.assessmentInstruments.code, 'kdpgk'))

  if (existing.length > 0) {
    console.info('kdpgk already seeded; nothing to do')
    process.exit(0)
  }

  const repository = createAssessmentRepository(db)

  const instrumentId = await repository.createInstrument({
    code: 'kdpgk',
    name: 'KDPGK — Kuesioner Diagnostik Potensi & Gaya Kepemimpinan',
    description:
      'Instrumen sintetis versi 1. Empat puluh pernyataan, skala Likert lima titik. ' +
      'Belum tervalidasi — lihat docs/assessment/validity-log.md.',
    createdBy: actorUserId,
  })
  await repository.setInstrumentTranslation({
    instrumentId,
    locale: 'en',
    name: 'KDPGK — Leadership Potential and Style Diagnostic',
    description:
      'Synthetic instrument, version 1. Forty statements on a five-point Likert scale. ' +
      'Not yet validated — see docs/assessment/validity-log.md.',
  })

  const scaleId = await repository.createScale({
    instrumentId,
    code: 'likert5',
    name: 'Likert 5 titik',
    points: SCALE_POINTS_ID,
  })
  await repository.setScaleTranslation({
    scaleId,
    locale: 'en',
    name: 'Five-point Likert',
    points: SCALE_POINTS_EN,
  })

  const dimensionIdByCode: Record<string, string> = {}
  for (const dimension of DIMENSIONS) {
    const id = await repository.createDimension({
      instrumentId,
      code: dimension.code,
      name: dimension.id,
      kind: dimension.kind,
    })
    dimensionIdByCode[dimension.code] = id
    await repository.setDimensionTranslation({ dimensionId: id, locale: 'en', name: dimension.en })
  }

  const { versionId } = await repository.createVersion({ instrumentId, actorUserId })

  let position = 0
  for (const item of ITEMS) {
    // One item feeds a style, a domain and — for the twenty-four that Blake-Mouton measures — an
    // axis. The many-to-many mapping is what lets one response set produce three families of
    // score without asking the student the same question three times.
    const dimensionIds = [
      dimensionIdByCode[item.style]!,
      dimensionIdByCode[item.domain]!,
      ...(item.axis ? [dimensionIdByCode[item.axis]!] : []),
    ]

    const itemId = await repository.createItem({
      instrumentId,
      code: item.code,
      stem: item.id,
      scaleId,
      createdBy: actorUserId,
      dimensionIds,
      addTo: { versionId, position: position++ },
    })
    await repository.setItemTranslation({ itemId, locale: 'en', stem: item.en })
    if (item.reverse) await repository.setReverseCoded(versionId, itemId, true)
  }

  await repository.advanceToReview(versionId)
  await repository.publish(versionId, actorUserId)

  // The formula. Drafting and approving are two roles' work in production (rbac.md's Scoring Rules
  // row); a seed does both, and the audit rows it writes name the seed as the actor rather than
  // pretending to be a person.
  const scoringVersion = await createScoringVersion(db, {
    versionId,
    bands: BANDS,
    weights: DIMENSIONS.map((dimension) => ({
      dimensionId: dimensionIdByCode[dimension.code]!,
      weight: WEIGHT,
    })),
    taskAxisDimensionId: dimensionIdByCode.concern_for_task!,
    peopleAxisDimensionId: dimensionIdByCode.concern_for_people!,
    actorUserId,
  })
  await approveScoringVersion(db, { scoringVersionId: scoringVersion.id, actorUserId })

  console.info(
    `seeded kdpgk instrument=${instrumentId} version=${versionId} ` +
      `scoring=${scoringVersion.id} items=${ITEMS.length} ` +
      `styles=${STYLES.length} domains=${DOMAINS.length} axes=${AXES.length}`
  )
} finally {
  client.close()
}
