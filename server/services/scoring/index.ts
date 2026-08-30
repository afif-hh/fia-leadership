import * as z from 'zod/mini'

import type { DimensionKind } from '../../db/schema/assessment.ts'

/**
 * The scoring engine. Pure: no database handle, no clock, no randomness, no network.
 *
 * That purity is the whole design. `scoring-spec.md` demands `score(v, sv, responses)` be
 * reproducible — the same inputs must give bit-identical output — and the cheapest way to
 * guarantee it is to leave the engine nothing else to read. Everything it needs arrives as an
 * argument, so a golden vector in a test exercises exactly the code path a real session does.
 *
 * It lives outside `server/domain/` on purpose. `patterns.md` puts the engine at
 * `server/services/scoring/`, and the split earns its place here: the formula is the one thing in
 * this repo that must be reviewable by someone who does not read Drizzle. Persisting what comes
 * back is `server/domain/profile/`'s job.
 *
 * **Nothing in this file may be changed without following the procedure in
 * `skills/assessment-scoring-change/SKILL.md`** (added in #91; this branch does not carry it).
 * The formulas, the thresholds, the pipeline order, and the single rounding point are all
 * `/CLAUDE.md` rule 1 territory. ADR-010 records them; this implements them.
 *
 * The pipeline order is `scoring-spec.md`'s, unchanged, and the order is itself a formula:
 * normalising before weighting gives different numbers from weighting before normalising.
 *
 *   completeness → reverse coding → raw subscale → normalise → weight → style scores
 *   → dominant/secondary → grid → band → developmental flags → ledger → report
 */

/* --------------------------------------------------------------------------------- inputs --- */

/** A readiness band, addressed by the lower bound of a half-open interval on the *rounded*
 * overall score. The last band runs to 100 inclusive. */
export interface Band {
  code: string
  min: number
}

/** One dimension the formula scores, with the weight and the rule row that authorises it. */
export interface ScoringDimension {
  code: string
  kind: DimensionKind
  /** Consulted only when aggregating `domain` dimensions into the overall score. Styles and axes
   * carry a rule row because the ledger requires one, not because it is multiplied by anything. */
  weight: number
  scoringRuleId: string
}

/** One item as the version published it, flattened to what arithmetic needs. */
export interface ScoringItem {
  versionItemId: string
  reverseCoded: boolean
  scaleMin: number
  scaleMax: number
  dimensionCodes: readonly string[]
}

export interface AssessmentVersionForScoring {
  id: string
  items: readonly ScoringItem[]
}

export interface ScoringVersionForScoring {
  id: string
  bands: readonly Band[]
  dimensions: readonly ScoringDimension[]
  /** Both set or both null. A grid with one coordinate is not a grid. */
  taskAxisCode: string | null
  peopleAxisCode: string | null
}

/** `versionItemId → answer`. The shape `getSession` already returns. */
export type ResponseSet = Readonly<Record<string, number>>

/* --------------------------------------------------------------------------------- errors --- */

/**
 * The response set does not match the version.
 *
 * Carries ids and nothing else — never an answer, not even in the message. The PII Rule names
 * this exact string as the likeliest leak in the flow, because the reflexive phrasing embeds the
 * value and the message ends up in a log the moment anything reports it.
 */
export class ResponseSetError extends Error {
  readonly missingVersionItemIds: readonly string[]
  readonly unknownVersionItemIds: readonly string[]
  readonly outOfRangeVersionItemIds: readonly string[]

  constructor(parts: {
    missing: readonly string[]
    unknown: readonly string[]
    outOfRange: readonly string[]
  }) {
    super(
      `Response set rejected: ${parts.missing.length} unanswered, ${parts.unknown.length} unknown, ` +
        `${parts.outOfRange.length} outside the item's anchors.`
    )
    this.name = 'ResponseSetError'
    this.missingVersionItemIds = parts.missing
    this.unknownVersionItemIds = parts.unknown
    this.outOfRangeVersionItemIds = parts.outOfRange
  }
}

/** The formula and the instrument disagree: a dimension one names, the other does not measure. */
export class ScoringConfigError extends Error {
  readonly dimensionCodes: readonly string[]

  constructor(message: string, dimensionCodes: readonly string[]) {
    super(message)
    this.name = 'ScoringConfigError'
    this.dimensionCodes = dimensionCodes
  }
}

/* -------------------------------------------------------------------------------- outputs --- */

export type ScoreType = 'raw' | 'normalized' | 'style' | 'readiness'

/** One row of the append-only ledger, at full precision. Rounding never happens here. */
export interface LedgerEntry {
  scoreType: ScoreType
  dimensionCode: string | null
  scoringRuleId: string | null
  scoreValue: number
}

export const QUADRANTS = [
  'impoverished',
  'country_club',
  'produce_or_perish',
  'team',
  'middle_of_road',
] as const
export type Quadrant = (typeof QUADRANTS)[number]

const dimensionScoreSchema = z.strictObject({
  code: z.string(),
  /** The rounded integer. The report deals only in these; the ledger keeps the full value. */
  score: z.number(),
})

/**
 * The report, in exactly the form it is frozen and shown in.
 *
 * Declared as a schema rather than as an interface because it is the one shape in this system that
 * crosses a storage boundary. `profile_snapshots.payload` is JSON-in-`text`, which SQLite can only
 * check with `json_valid`, so ADR-005 puts the real check at the boundary and requires
 * `z.strictObject` for it. Reading a snapshot back with a cast would be an assertion, not a check,
 * on the one payload a student actually reads.
 *
 * Integers throughout, because `kdpgk-v1.md` declares the 0–100 figure an index for communicating
 * a result rather than a verdict, and a decimal place would imply a precision the instrument does
 * not have. Full precision stays in the ledger for trends.
 */
export const scoreReportSchema = z.strictObject({
  assessmentVersionId: z.string(),
  scoringVersionId: z.string(),
  overall: z.strictObject({ score: z.number(), band: z.string() }),
  domains: z.array(dimensionScoreSchema),
  styles: z.array(dimensionScoreSchema),
  dominant: z.strictObject({
    primary: z.string(),
    /** Null only for an instrument with a single style dimension. */
    secondary: z.nullable(z.string()),
    /** True when the top two style scores are exactly equal at full precision. */
    hybrid: z.boolean(),
  }),
  grid: z.nullable(
    z.strictObject({
      task: z.number(),
      people: z.number(),
      quadrant: z.enum(QUADRANTS),
    })
  ),
  strengths: z.array(z.string()),
  developmentPriorities: z.array(z.string()),
})

export type ScoreReport = z.infer<typeof scoreReportSchema>
export type DimensionScore = ScoreReport['domains'][number]
export type DominantStyle = ScoreReport['dominant']
export type GridCoordinate = NonNullable<ScoreReport['grid']>

export interface ScoreRun {
  ledger: LedgerEntry[]
  report: ScoreReport
}

/* ------------------------------------------------------------------------------ arithmetic --- */

/**
 * The single rounding point in the system, and the only one there may ever be (#26).
 *
 * Every intermediate value stays a full-precision double. This runs once per figure, at the
 * moment a number becomes something a person reads — and the band and the grid are then derived
 * from *that* integer, not from the unrounded value. An earlier proposal compared bands at two
 * decimals while displaying an integer, which would show a student "70" beside a band computed
 * from 69.60 and read, correctly, as a bug.
 *
 * `Math.round` breaks ties toward positive infinity, so 69.5 becomes 70. Scores are bounded to
 * 0–100, so its negative-zero edge case cannot arise.
 */
export function shown(value: number): number {
  return Math.round(value)
}

/** `bands` is sorted here rather than trusted, so a mis-ordered configuration cannot change a
 * result. The lowest band's `min` is the floor; a score below it still lands in it. */
export function bandFor(bands: readonly Band[], score: number): string {
  if (bands.length === 0)
    throw new ScoringConfigError('A scoring version needs at least one band.', [])
  const sorted = [...bands].sort((a, b) => a.min - b.min)
  let current = sorted[0]!.code
  for (const band of sorted) if (score >= band.min) current = band.code
  return current
}

/**
 * A 0–100 dimension score onto Blake-Mouton's 1–9 axis.
 *
 * Derived from the rounded score, keeping the one-rounding-point rule: an axis a student sees as
 * 62 always plots at the same coordinate. The clamp is belt and braces — 0 and 100 already map to
 * 1 and 9 — and it is what makes SC-05 a property rather than an assertion about two inputs.
 */
export function gridCoordinate(score: number): number {
  const raw = 1 + Math.round((shown(score) / 100) * 8)
  return Math.min(9, Math.max(1, raw))
}

/**
 * The quadrant a coordinate falls in.
 *
 * 1–4 is low, 6–9 is high, and anything left is the middle. The band that reads as arbitrary is
 * the middle one, and it is deliberate: a 5 on a nine-point axis is the instrument saying it did
 * not separate this person on that axis, and rounding that into "high" or "low" would put a label
 * on a non-result. Thresholds are ADR-010 territory.
 */
export function quadrantFor(task: number, people: number): Quadrant {
  const high = (n: number) => n >= 6
  const low = (n: number) => n <= 4
  if (high(task) && high(people)) return 'team'
  if (high(task) && low(people)) return 'produce_or_perish'
  if (low(task) && high(people)) return 'country_club'
  if (low(task) && low(people)) return 'impoverished'
  return 'middle_of_road'
}

/**
 * Descending by score, then ascending by code.
 *
 * The tiebreak is not cosmetic, it is SC-04: two styles that score identically must order the
 * same way on every machine and every run, and `Array.prototype.sort` guarantees nothing about
 * equal elements beyond stability, which only defers the question to input order. The code is the
 * one totally ordered, stable key available.
 */
function byScoreThenCode(a: DimensionScoreFull, b: DimensionScoreFull): number {
  if (b.value !== a.value) return b.value - a.value
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0
}

interface DimensionScoreFull {
  code: string
  kind: DimensionKind
  weight: number
  scoringRuleId: string
  raw: number
  value: number
}

/* ------------------------------------------------------------------------------- the score --- */

/**
 * Runs the pipeline. The steps below are numbered to `scoring-spec.md`'s list, in its order.
 */
export function score(
  assessmentVersion: AssessmentVersionForScoring,
  scoringVersion: ScoringVersionForScoring,
  responses: ResponseSet
): ScoreRun {
  const items = assessmentVersion.items

  // 1. Validate response completeness. Three failures at once rather than one at a time, so a
  //    caller building a `fields` array gets the whole picture from one throw.
  const answeredIds = Object.keys(responses)
  const itemIds = new Set(items.map((item) => item.versionItemId))
  const missing = items
    .filter((item) => !(item.versionItemId in responses))
    .map((item) => item.versionItemId)
  const unknown = answeredIds.filter((id) => !itemIds.has(id))
  const outOfRange = items
    .filter((item) => {
      const answer = responses[item.versionItemId]
      if (answer === undefined) return false
      return !Number.isFinite(answer) || answer < item.scaleMin || answer > item.scaleMax
    })
    .map((item) => item.versionItemId)

  if (missing.length > 0 || unknown.length > 0 || outOfRange.length > 0) {
    throw new ResponseSetError({ missing, unknown, outOfRange })
  }

  const rules = new Map(scoringVersion.dimensions.map((d) => [d.code, d]))

  // 2 + 3. Reverse coding, then raw subscale. Reversing is a reflection within the item's own
  //        anchors, `min + max - answer`, which is why it needs no separate configuration: a
  //        five-point item reverses 1↔5 and a seven-point one 1↔7, from the item itself.
  const totals = new Map<string, { raw: number; min: number; max: number }>()
  const unconfigured = new Set<string>()

  for (const item of items) {
    const answer = responses[item.versionItemId]!
    const effective = item.reverseCoded ? item.scaleMin + item.scaleMax - answer : answer

    for (const code of item.dimensionCodes) {
      if (!rules.has(code)) {
        unconfigured.add(code)
        continue
      }
      const total = totals.get(code) ?? { raw: 0, min: 0, max: 0 }
      total.raw += effective
      total.min += item.scaleMin
      total.max += item.scaleMax
      totals.set(code, total)
    }
  }

  if (unconfigured.size > 0) {
    throw new ScoringConfigError(
      'The version measures dimensions this scoring version has no rule for.',
      [...unconfigured].sort()
    )
  }

  const unmeasured = scoringVersion.dimensions
    .filter((d) => !totals.has(d.code))
    .map((d) => d.code)
    .sort()
  if (unmeasured.length > 0) {
    throw new ScoringConfigError(
      'This scoring version weights dimensions the version has no items for.',
      unmeasured
    )
  }

  // 4. Normalise each subscale onto 0–100 against what that dimension's own items could produce.
  //    A dimension whose items admit only one total is degenerate rather than perfect, so it
  //    scores 0 rather than dividing by zero — reachable only from an authoring mistake.
  const scored: DimensionScoreFull[] = []
  for (const [code, total] of totals) {
    const rule = rules.get(code)!
    const span = total.max - total.min
    const value = span === 0 ? 0 : ((total.raw - total.min) / span) * 100
    scored.push({
      code,
      kind: rule.kind,
      weight: rule.weight,
      scoringRuleId: rule.scoringRuleId,
      raw: total.raw,
      value,
    })
  }

  const domains = scored.filter((d) => d.kind === 'domain').sort(byScoreThenCode)
  const styles = scored.filter((d) => d.kind === 'style').sort(byScoreThenCode)

  // 5. Apply weighting. The overall potential is the weighted mean of the *domain* dimensions —
  //    styles describe how someone leads, not how ready they are, and averaging the two families
  //    together would make a preference look like a deficit.
  const weightSum = domains.reduce((sum, d) => sum + d.weight, 0)
  if (domains.length === 0 || weightSum === 0) {
    throw new ScoringConfigError(
      'The overall score needs at least one domain dimension with a non-zero weight.',
      domains.map((d) => d.code)
    )
  }
  const overallValue = domains.reduce((sum, d) => sum + d.weight * d.value, 0) / weightSum

  // 6 + 7. Style scores are the normalised figures under the name the report reads them by, and
  //        dominant/secondary is the top of that list. `hybrid` compares the full-precision
  //        values: two styles a student cannot be separated on should be reported as a hybrid,
  //        and the rounded pair would call 69.4 and 69.6 a tie when the instrument did separate
  //        them.
  const first = styles[0]
  if (!first) {
    throw new ScoringConfigError('A scoring version needs at least one style dimension.', [])
  }
  const secondStyle = styles[1] ?? null
  const dominant: DominantStyle = {
    primary: first.code,
    secondary: secondStyle?.code ?? null,
    hybrid: secondStyle !== null && secondStyle.value === first.value,
  }

  // 8. Task and People onto the 1–9 grid.
  const byCode = new Map(scored.map((d) => [d.code, d]))
  const taskAxis = scoringVersion.taskAxisCode ? byCode.get(scoringVersion.taskAxisCode) : undefined
  const peopleAxis = scoringVersion.peopleAxisCode
    ? byCode.get(scoringVersion.peopleAxisCode)
    : undefined
  const grid =
    taskAxis && peopleAxis
      ? (() => {
          const task = gridCoordinate(taskAxis.value)
          const people = gridCoordinate(peopleAxis.value)
          return { task, people, quadrant: quadrantFor(task, people) }
        })()
      : null

  // 9 + 10. Band, then developmental flags. Both read the rounded overall and the rounded domain
  //         scores, so what a student is told and what the report says about it cannot disagree.
  const overallShown = shown(overallValue)
  const band = bandFor(scoringVersion.bands, overallShown)

  //         Priorities are drawn from what is left after the strengths rather than from the whole
  //         list. On a real instrument the two ends never meet, but on a short one they would, and
  //         a report naming the same domain as both a strength and a priority is not a report a
  //         student can act on.
  const FLAG_COUNT = 3
  const strengths = domains.slice(0, FLAG_COUNT).map((d) => d.code)
  const developmentPriorities = domains
    .slice(FLAG_COUNT)
    .slice(-FLAG_COUNT)
    .reverse()
    .map((d) => d.code)

  // 11. The ledger, at full precision and in a deterministic order.
  const ledgerOrder = [...scored].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
  const ledger: LedgerEntry[] = []
  for (const dimension of ledgerOrder) {
    ledger.push({
      scoreType: 'raw',
      dimensionCode: dimension.code,
      scoringRuleId: dimension.scoringRuleId,
      scoreValue: dimension.raw,
    })
    ledger.push({
      scoreType: 'normalized',
      dimensionCode: dimension.code,
      scoringRuleId: dimension.scoringRuleId,
      scoreValue: dimension.value,
    })
    if (dimension.kind === 'style') {
      ledger.push({
        scoreType: 'style',
        dimensionCode: dimension.code,
        scoringRuleId: dimension.scoringRuleId,
        scoreValue: dimension.value,
      })
    }
  }
  ledger.push({
    scoreType: 'readiness',
    dimensionCode: null,
    scoringRuleId: null,
    scoreValue: overallValue,
  })

  // 12. The report.
  return {
    ledger,
    report: {
      assessmentVersionId: assessmentVersion.id,
      scoringVersionId: scoringVersion.id,
      overall: { score: overallShown, band },
      domains: domains.map((d) => ({ code: d.code, score: shown(d.value) })),
      styles: styles.map((d) => ({ code: d.code, score: shown(d.value) })),
      dominant,
      grid,
      strengths,
      developmentPriorities,
    },
  }
}
