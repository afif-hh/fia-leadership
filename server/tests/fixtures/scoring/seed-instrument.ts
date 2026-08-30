/**
 * The golden fixture, seeded into a real database.
 *
 * Deliberately the *same* six items, dimensions, weights and bands as
 * `server/tests/fixtures/scoring/golden-v1.ts`, so the integration suite can assert the hand-
 * computed numbers from `MIXED_EXPECTED` end to end. That is the point of the duplication: the
 * unit suite proves the arithmetic, and this proves that reading a frozen response set out of
 * SQLite and a frozen formula out of two more tables reproduces it exactly. A separate shape here
 * would leave the join between them untested, which is where a real defect would hide.
 *
 * Synthetic, with no real participant data. `kdpgk-v1.md` ships no item bank on purpose, and
 * nothing here should be read as a draft of the real instrument.
 */
import {
  assessmentDimensions,
  assessmentInstruments,
  assessmentItems,
  assessmentScales,
  assessmentScoringRules,
  assessmentScoringVersions,
  assessmentVersionItemDimensions,
  assessmentVersionItems,
  assessmentVersions,
} from '../../../db/schema/assessment'
import type { TestDb } from '../../setup/db'
import { GOLDEN_BANDS, goldenScoring, goldenVersion } from './golden-v1'
import { SCALE_POINTS } from '../assessment-taking'

export interface SeededScoringInstrument {
  instrumentId: string
  versionId: string
  scoringVersionId: string
  /** Keyed by the golden fixture's own item id (`it1` … `it6`), so a vector maps straight over. */
  versionItemIdByCode: Record<string, string>
  dimensionIdByCode: Record<string, string>
}

export async function seedScorableInstrument(
  t: TestDb,
  { approve = true, versionNo = 1 }: { approve?: boolean; versionNo?: number } = {}
): Promise<SeededScoringInstrument> {
  const now = new Date()
  const instrumentId = crypto.randomUUID()
  const scaleId = crypto.randomUUID()
  const versionId = crypto.randomUUID()

  await t.db.insert(assessmentInstruments).values({
    id: instrumentId,
    code: `golden_${versionNo}`,
    name: 'Instrumen golden (sintetis)',
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

  const dimensionIdByCode: Record<string, string> = {}
  for (const dimension of goldenScoring.dimensions) {
    const id = crypto.randomUUID()
    dimensionIdByCode[dimension.code] = id
    await t.db.insert(assessmentDimensions).values({
      id,
      instrumentId,
      code: dimension.code,
      name: dimension.code,
      kind: dimension.kind,
    })
  }

  // Draft first, then flip. The publish gate refuses the transition while a child row is missing
  // a snapshot, and the freeze triggers refuse child writes once it is published, so this is the
  // only order that works — the same order the real publish transaction uses.
  await t.db.insert(assessmentVersions).values({
    id: versionId,
    instrumentId,
    versionNo,
    status: 'draft',
    createdAt: now,
    createdBy: 'tester',
  })

  const versionItemIdByCode: Record<string, string> = {}
  let position = 0
  for (const item of goldenVersion.items) {
    const itemId = crypto.randomUUID()
    const versionItemId = crypto.randomUUID()
    versionItemIdByCode[item.versionItemId] = versionItemId
    const stem = `Pernyataan sintetis ${item.versionItemId}.`

    await t.db.insert(assessmentItems).values({
      id: itemId,
      instrumentId,
      code: item.versionItemId,
      stem,
      scaleId,
      createdAt: now,
      createdBy: 'tester',
    })
    await t.db.insert(assessmentVersionItems).values({
      id: versionItemId,
      versionId,
      itemId,
      position: position++,
      reverseCoded: item.reverseCoded,
      stemSnapshot: stem,
      scalePointsSnapshot: JSON.stringify(SCALE_POINTS),
    })
    for (const code of item.dimensionCodes) {
      await t.db.insert(assessmentVersionItemDimensions).values({
        versionItemId,
        dimensionId: dimensionIdByCode[code]!,
        dimensionCodeSnapshot: code,
      })
    }
  }

  await t.client.execute({
    sql: 'UPDATE assessment_versions SET status = ?, published_at = ? WHERE id = ?',
    args: ['published', Date.now(), versionId],
  })

  const scoringVersionId = crypto.randomUUID()
  await t.db.insert(assessmentScoringVersions).values({
    id: scoringVersionId,
    versionId,
    scoringNo: 1,
    status: 'draft',
    bands: JSON.stringify(GOLDEN_BANDS),
    taskAxisDimensionId: dimensionIdByCode.ax_task!,
    peopleAxisDimensionId: dimensionIdByCode.ax_people!,
    createdAt: now,
    createdBy: 'tester',
  })
  await t.db.insert(assessmentScoringRules).values(
    goldenScoring.dimensions.map((dimension) => ({
      id: crypto.randomUUID(),
      scoringVersionId,
      dimensionId: dimensionIdByCode[dimension.code]!,
      dimensionCode: dimension.code,
      weight: dimension.weight,
    }))
  )

  if (approve) {
    await t.client.execute({
      sql: 'UPDATE assessment_scoring_versions SET status = ?, approved_at = ?, approved_by = ? WHERE id = ?',
      args: ['approved', Date.now(), 'tester', scoringVersionId],
    })
  }

  return { instrumentId, versionId, scoringVersionId, versionItemIdByCode, dimensionIdByCode }
}

/** Writes one response per item from a golden vector, keyed by the fixture's own item ids. */
export async function writeResponses(
  t: TestDb,
  sessionId: string,
  seeded: SeededScoringInstrument,
  vector: Record<string, number>
): Promise<void> {
  for (const [code, value] of Object.entries(vector)) {
    await t.client.execute({
      sql: 'INSERT INTO assessment_responses (session_id, version_item_id, answer_value) VALUES (?, ?, ?)',
      args: [sessionId, seeded.versionItemIdByCode[code]!, value],
    })
  }
}
