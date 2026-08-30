import type {
  AssessmentVersionForScoring,
  ScoringVersionForScoring,
} from '../../../services/scoring/index.ts'

/**
 * Golden vectors for the scoring engine. Synthetic, with no real participant data of any kind —
 * `data-dictionary.md`'s seed and fixture policy, no exceptions.
 *
 * `golden-tests.md` requires every fixture to name the assessment version and scoring version it
 * was computed under, so that SC-08 can be checked across versions rather than asserted about.
 * Both are named below and both are part of the expected values: change either and these numbers
 * are no longer the numbers this fixture describes.
 *
 *   assessment_version: golden-av-1
 *   scoring_version:    golden-sv-1  (and golden-sv-2, deliberately different, for SC-08)
 *
 * Six items over two domains, two styles and two axes. Small enough that every expected value
 * below was computed by hand and can be rechecked by hand, which is the only property that makes
 * a golden vector worth having — a fixture whose expectations came out of the code it tests
 * asserts that the code does what it does.
 */

export const SCALE_MIN = 1
export const SCALE_MAX = 5

/** `it3` is reverse-coded, so the vectors that hit a bound are not the all-1s and all-5s vectors.
 * That asymmetry is the point: it is what makes SC-01 and SC-02 test reverse coding too. */
export const goldenVersion: AssessmentVersionForScoring = {
  id: 'golden-av-1',
  items: [
    {
      versionItemId: 'it1',
      reverseCoded: false,
      scaleMin: SCALE_MIN,
      scaleMax: SCALE_MAX,
      dimensionCodes: ['d_alpha', 's_one', 'ax_task'],
    },
    {
      versionItemId: 'it2',
      reverseCoded: false,
      scaleMin: SCALE_MIN,
      scaleMax: SCALE_MAX,
      dimensionCodes: ['d_alpha', 's_two', 'ax_people'],
    },
    {
      versionItemId: 'it3',
      reverseCoded: true,
      scaleMin: SCALE_MIN,
      scaleMax: SCALE_MAX,
      dimensionCodes: ['d_beta', 's_one', 'ax_task'],
    },
    {
      versionItemId: 'it4',
      reverseCoded: false,
      scaleMin: SCALE_MIN,
      scaleMax: SCALE_MAX,
      dimensionCodes: ['d_beta', 's_two', 'ax_people'],
    },
    {
      versionItemId: 'it5',
      reverseCoded: false,
      scaleMin: SCALE_MIN,
      scaleMax: SCALE_MAX,
      dimensionCodes: ['d_alpha', 's_one'],
    },
    {
      versionItemId: 'it6',
      reverseCoded: false,
      scaleMin: SCALE_MIN,
      scaleMax: SCALE_MAX,
      dimensionCodes: ['d_beta', 's_two'],
    },
  ],
}

export const GOLDEN_BANDS = [
  { code: 'emerging', min: 0 },
  { code: 'developing', min: 40 },
  { code: 'established', min: 60 },
  { code: 'advanced', min: 80 },
]

export const goldenScoring: ScoringVersionForScoring = {
  id: 'golden-sv-1',
  bands: GOLDEN_BANDS,
  dimensions: [
    { code: 'd_alpha', kind: 'domain', weight: 2, scoringRuleId: 'rule-d-alpha' },
    { code: 'd_beta', kind: 'domain', weight: 1, scoringRuleId: 'rule-d-beta' },
    { code: 's_one', kind: 'style', weight: 1, scoringRuleId: 'rule-s-one' },
    { code: 's_two', kind: 'style', weight: 1, scoringRuleId: 'rule-s-two' },
    { code: 'ax_task', kind: 'axis', weight: 1, scoringRuleId: 'rule-ax-task' },
    { code: 'ax_people', kind: 'axis', weight: 1, scoringRuleId: 'rule-ax-people' },
  ],
  taskAxisCode: 'ax_task',
  peopleAxisCode: 'ax_people',
}

/**
 * A second formula over the same instrument: the weights are swapped and the bands are stricter.
 * Used only by SC-08, where the point is that it produces different numbers *and* leaves the
 * report the first one produced exactly as it was.
 */
export const goldenScoringV2: ScoringVersionForScoring = {
  ...goldenScoring,
  id: 'golden-sv-2',
  bands: [
    { code: 'emerging', min: 0 },
    { code: 'developing', min: 50 },
    { code: 'established', min: 70 },
    { code: 'advanced', min: 90 },
  ],
  dimensions: goldenScoring.dimensions.map((d) =>
    d.code === 'd_alpha' ? { ...d, weight: 1 } : d.code === 'd_beta' ? { ...d, weight: 2 } : d
  ),
}

/** Every item at the answer that minimises its contribution: 1 normally, 5 where reverse-coded. */
export const MINIMUM_VECTOR = { it1: 1, it2: 1, it3: 5, it4: 1, it5: 1, it6: 1 }

/** The mirror of `MINIMUM_VECTOR`. */
export const MAXIMUM_VECTOR = { it1: 5, it2: 5, it3: 1, it4: 5, it5: 5, it6: 5 }

/**
 * SC-03's mixed vector, with every expected figure derived by hand under `golden-sv-1`:
 *
 *   effective answers   it1 4 · it2 2 · it3 1+5−2 = 4 · it4 5 · it5 3 · it6 1
 *   d_alpha  it1+it2+it5 =  9 over [3,15] → (9−3)/12·100  = 50
 *   d_beta   it3+it4+it6 = 10 over [3,15] → (10−3)/12·100 = 58.333…
 *   s_one    it1+it3+it5 = 11 over [3,15] → (11−3)/12·100 = 66.666…
 *   s_two    it2+it4+it6 =  8 over [3,15] → (8−3)/12·100  = 41.666…
 *   ax_task  it1+it3     =  8 over [2,10] → (8−2)/8·100   = 75
 *   ax_people it2+it4    =  7 over [2,10] → (7−2)/8·100   = 62.5
 *   overall  (2·50 + 1·58.333…) / 3 = 52.777… → 53 → developing
 *   grid     task 1+round(75/100·8) = 7 · people 63 → 1+round(5.04) = 6 → team
 */
export const MIXED_VECTOR = { it1: 4, it2: 2, it3: 2, it4: 5, it5: 3, it6: 1 }

export const MIXED_EXPECTED = {
  overall: { score: 53, band: 'developing' },
  domains: [
    { code: 'd_beta', score: 58 },
    { code: 'd_alpha', score: 50 },
  ],
  styles: [
    { code: 's_one', score: 67 },
    { code: 's_two', score: 42 },
  ],
  dominant: { primary: 's_one', secondary: 's_two', hybrid: false },
  grid: { task: 7, people: 6, quadrant: 'team' as const },
}

/**
 * SC-04. `s_one` gets it1+it3+it5 and `s_two` gets it2+it4+it6, so answering the two triples
 * symmetrically ties them exactly: s_one 2+4+2 = 8, s_two 2+4+2 = 8. Effective it3 = 1+5−2 = 4.
 */
export const TIED_VECTOR = { it1: 2, it2: 2, it3: 2, it4: 4, it5: 2, it6: 2 }
