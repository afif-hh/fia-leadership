import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Rewritten during the Tailwind v4 migration.
 *
 * The previous version asserted an eleven-section homepage — WhyLeadershipLab,
 * LeadershipJourney, AssessmentPortfolio, and so on — that stopped existing when
 * commit 5638d21 rebuilt the homepage around seven components. It had been failing
 * on a missing file ever since, which meant the migration it was supposed to guard
 * had no safety net at all. This version asserts what is actually rendered.
 */

const COMPONENT_DIR = resolve(import.meta.dirname, '../../components/public')

/** Every component the homepage renders, in render order. */
const SECTIONS = [
  'HeroSection',
  'TrustBar',
  'CoreMethodology',
  'TailoredPathways',
  'MetricsResearch',
  'EvidenceInsights',
  'FinalCTA',
] as const

/**
 * Sections that do not yet label themselves. Tracked rather than tolerated: a
 * <section> without an accessible name is announced only as "region" by a screen
 * reader, so it cannot be navigated to by name. Fixing these is a design and
 * copy question, not a build-migration one, so they are recorded here and left to
 * the accessibility review rather than patched in passing.
 */
const KNOWN_UNLABELLED = new Set<string>(['TrustBar', 'FinalCTA'])

const read = (name: string) => readFileSync(resolve(COMPONENT_DIR, `${name}.vue`), 'utf-8')

describe('Homepage composition', () => {
  const homepage = readFileSync(
    resolve(import.meta.dirname, '../../pages/(public)/index.vue'),
    'utf-8'
  )

  it.each(SECTIONS)('renders Public%s', (section) => {
    expect(homepage).toContain(`Public${section}`)
  })

  it('renders nothing that no longer exists', () => {
    // Guards against the failure mode that broke this file: a section removed from
    // the page but left behind in the expected list, or the reverse.
    const rendered = [...homepage.matchAll(/<Public([A-Za-z]+)/g)].map((m) => m[1])
    expect([...new Set(rendered)].sort()).toEqual([...SECTIONS].sort())
  })
})

describe('Section labelling', () => {
  it.each(SECTIONS.filter((s) => !KNOWN_UNLABELLED.has(s)))(
    '%s labels itself with aria-labelledby',
    (section) => {
      expect(read(section)).toContain('aria-labelledby')
    }
  )

  it('the unlabelled list is still accurate', () => {
    // If someone adds aria-labelledby to one of these, this fails and the entry
    // should be removed — so the allowlist cannot quietly outlive the problem.
    const stillMissing = SECTIONS.filter((s) => !read(s).includes('aria-labelledby'))
    expect(stillMissing.sort()).toEqual([...KNOWN_UNLABELLED].sort())
  })
})

describe('Language marking', () => {
  it('HeroSection marks its English copy with lang', () => {
    // The site chrome is Indonesian; English strings need marking so a screen
    // reader switches pronunciation.
    expect(read('HeroSection')).toContain('lang="en"')
  })
})
