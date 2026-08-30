import { describe, expect, it } from 'vitest'
import { keysIn, message, readRaw, says } from '../support/messages'

/**
 * Source-level assertions for the profile page — the first screen in this product that shows a
 * student a number about themselves.
 *
 * Two families of obligation meet here and both are easy to lose in a later refactor. The
 * accessibility one: a score table read by assistive technology needs real header cells, and every
 * figure needs a text equivalent rather than a picture. The product one: `kdpgk-v1.md` requires
 * the index-not-verdict disclaimer on *every* output, `validity-log.md` forbids presenting an
 * unvalidated threshold as a norm, and the PRD's non-negotiables require the language to be
 * developmental rather than diagnostic. None of that survives on good intentions.
 *
 * These do not replace an axe run against the rendered page, which the accessibility DoD still
 * requires.
 */

const PROFILE = 'pages/profil/index.vue'

const read = () => readRaw(PROFILE)

const template = () =>
  (read().match(/<template>([\s\S]*)<\/template>/) ?? ['', ''])[1]!.replace(/<!--[\s\S]*?-->/g, '')

describe('the page sits behind auth on the student shell', () => {
  it('uses the assessment layout, not the staff dashboard', () => {
    expect(read()).toContain("middleware: 'auth'")
    expect(read()).toContain("layout: 'assessment'")
  })
})

describe('tokens own every colour', () => {
  it('contains no colour literal', () => {
    expect(read()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(read()).not.toMatch(/\brgba?\(/)
    expect(read()).not.toMatch(/\bhsla?\(/)
  })
})

describe('the mandatory disclaimer', () => {
  it('says the score is an index for communicating a result, not a verdict', () => {
    const text = says(PROFILE, 'profile.disclaimer')
    expect(text).toMatch(/indeks/i)
    expect(text).toMatch(/bukan vonis/i)
  })

  it('says the instrument is unvalidated and must not decide anything', () => {
    // validity-log.md: a threshold may not be presented as a population norm while the status is
    // `draft`, and the instrument may not be used for a formal decision.
    const text = says(PROFILE, 'profile.disclaimer')
    expect(text).toMatch(/belum tervalidasi/i)
    expect(text).toMatch(/seleksi|promosi|akademik/i)
  })

  it('renders it above the scores rather than as a footnote', () => {
    // The order is the requirement. A caveat met after a reader has formed an impression of their
    // own score has already failed at the thing it exists to do.
    const markup = template()
    expect(markup.indexOf('profile.disclaimer')).toBeGreaterThan(-1)
    expect(markup.indexOf('profile.disclaimer')).toBeLessThan(
      markup.indexOf('profile.overallValue')
    )
  })
})

describe('the language is developmental, not diagnostic', () => {
  it('never labels the reader', () => {
    // The PRD's first non-negotiable, made checkable: a report carries strengths, development
    // areas and next actions, never a permanent label.
    //
    // Sentence by sentence rather than over the joined copy, and a sentence that *denies* the
    // label is allowed — "bukan kelemahan permanen" is the rule being stated, not broken, and a
    // whole-file search cannot tell those apart.
    const diagnostic = /lemah|buruk|kekurangan|defisit/i
    for (const key of keysIn(readRaw(PROFILE))) {
      const text = message('id', key) ?? ''
      if (!diagnostic.test(text)) continue
      expect(text, key).toMatch(/bukan/i)
    }
  })

  it('says a development priority is not a permanent weakness', () => {
    expect(says(PROFILE, 'profile.prioritiesNote')).toMatch(/bukan kelemahan permanen/i)
  })
})

describe('every figure has a text equivalent', () => {
  it('renders the style and domain profiles as tables with real header cells', () => {
    const markup = template()
    expect(markup).toContain('<table')
    // `scope` on both axes: a data cell in a two-dimensional table needs a row header as well as
    // a column one, and a `<td>` in the first column supplies neither.
    expect(markup).toMatch(/<th scope="col"/)
    expect(markup).toMatch(/<th scope="row"/)
  })

  it('states the Blake-Mouton coordinate in words rather than only plotting it', () => {
    const summary = says(PROFILE, 'profile.gridSummary')
    expect(summary).toMatch(/\{task\}/)
    expect(summary).toMatch(/\{people\}/)
    // The named quadrant is the interpretation kdpgk-v1.md asks for beside the coordinate.
    expect(read()).toContain('profile.quadrantLabel')
  })

  it('draws no chart, so nothing on the page needs an alternative it does not have', () => {
    const markup = template()
    expect(markup).not.toContain('<canvas')
    expect(markup).not.toContain('<svg')
  })

  it('gives each section a heading its region is named by', () => {
    const markup = template()
    const labelled = markup.match(/aria-labelledby="/g) ?? []
    expect(labelled.length).toBeGreaterThanOrEqual(6)
  })
})

describe('the report is rendered from codes, never from server-sent display text', () => {
  it('translates every dimension, band and quadrant in both languages', () => {
    // ADR-009: the API sends a stable code and the client renders the sentence. A code with no
    // message would reach a student as a bare identifier where a name belongs.
    const codes = {
      dimensions: [
        'directive',
        'participative',
        'delegative',
        'task_oriented',
        'people_oriented',
        'transformational',
        'transactional',
        'situational',
        'ethical_authentic',
        'innovative_digital',
        'self_awareness',
        'influence',
        'decision_making',
        'collaboration',
        'adaptability',
        'integrity',
        'execution',
        'innovation',
        'concern_for_task',
        'concern_for_people',
      ],
      bands: ['emerging', 'developing', 'established', 'advanced'],
      quadrants: ['impoverished', 'country_club', 'produce_or_perish', 'team', 'middle_of_road'],
    }

    for (const [group, entries] of Object.entries(codes)) {
      for (const code of entries) {
        expect(message('id', `${group}.${code}`), `id ${group}.${code}`).toBeTruthy()
        expect(message('en', `${group}.${code}`), `en ${group}.${code}`).toBeTruthy()
      }
    }
  })

  it('falls back to the code rather than to a missing-key string', () => {
    expect(read()).toContain('te(`dimensions.${code}`)')
    expect(read()).toContain('te(`bands.${code}`)')
    expect(read()).toContain('te(`quadrants.${code}`)')
  })
})

describe('a student with no result yet', () => {
  it('is told there is nothing to show, not that something failed', () => {
    const empty = says(PROFILE, 'profile.empty')
    expect(empty).not.toMatch(/gagal|error|kesalahan/i)
    expect(read()).toContain('profile.emptyAction')
  })

  it('is told something different when the work is done but unscored', () => {
    // The two empty states are not the same sentence. A student whose finished assessment has no
    // approved formula must not be told to complete an assessment first — that reads as their
    // work having been lost.
    const pending = says(PROFILE, 'profile.pending')
    expect(pending).toMatch(/sudah terkirim/i)
    expect(pending).not.toEqual(says(PROFILE, 'profile.empty'))
  })
})
