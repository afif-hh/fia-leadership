import { describe, it, expect } from 'vitest'
import { readResolved } from '../support/messages'

/**
 * Source-level assertions for the student assessment surface (#61, #59, #72), matching the shape
 * of `assessment-authoring.spec.ts`.
 *
 * These catch the class of omission that is invisible in review and cheap to grep for: a colour
 * literal that bypasses the theme, a page that forgets its middleware, a decision from the map
 * quietly reversed. They do not replace the axe run against the rendered page, which the
 * accessibility DoD already requires.
 */

/**
 * Reads the file with every message key it names replaced by the Indonesian message, so an
 * assertion below can still name the sentence a person reads. See `../support/messages.ts`.
 */
const read = (path: string) => readResolved(path)

/**
 * Just the `<template>` block. Assertions about *rendered* markup have to exclude the script and
 * the comments, or they fail on the file explaining why the thing they forbid is absent — which
 * is exactly what the "no decline button" check did on first run.
 */
const template = (path: string) =>
  (read(path).match(/<template>([\s\S]*)<\/template>/) ?? ['', ''])[1]!.replace(
    /<!--[\s\S]*?-->/g,
    ''
  )

const LIST = 'pages/assessment/index.vue'
const CONSENT = 'pages/assessment/[versionId]/consent.vue'
const LAYOUT = 'layouts/assessment.vue'
const ALL = [LIST, CONSENT, LAYOUT]

describe('tokens own every colour', () => {
  it.each(ALL)('%s contains no colour literal', (path) => {
    const source = read(path)
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(source).not.toMatch(/\brgba?\(/)
    expect(source).not.toMatch(/\bhsla?\(/)
  })
})

describe('both pages are behind auth and on the student shell', () => {
  it.each([LIST, CONSENT])('%s declares auth middleware', (path) => {
    // Defence in depth only — the server refuses regardless — but a page without it renders a
    // signed-out shell and a confusing empty state instead of redirecting.
    expect(read(path)).toContain("middleware: 'auth'")
  })

  it.each([LIST, CONSENT])('%s uses the assessment layout, not the staff dashboard', (path) => {
    // /dashboard carries Lab Admin navigation a student cannot use; reusing it would render links
    // that 403 on click (#61).
    expect(read(path)).toContain("layout: 'assessment'")
    expect(read(path)).not.toContain("layout: 'dashboard'")
  })
})

describe('the student shell', () => {
  const source = () => read(LAYOUT)

  it('offers a skip link to the main region', () => {
    expect(source()).toContain('skip-to-content')
    expect(source()).toContain('#assessment-main')
  })

  it('gives the main region a focus target for that link to land on', () => {
    expect(source()).toMatch(/id="assessment-main"[\s\S]{0,80}tabindex="-1"/)
  })
})

describe('the assessment list', () => {
  const source = () => read(LIST)

  it('renders rows as a real list rather than a stack of divs', () => {
    expect(source()).toContain('<ul')
    expect(source()).toContain('<li')
  })

  it('shows a submitted version as static text, never as an action', () => {
    // #62: there is nothing behind "Selesai" to open — no answer re-read and no result page —
    // so making it a link or button would promise something that does not exist.
    expect(source()).toContain('Selesai')
    expect(source()).toMatch(/<span[^>]*>Selesai<\/span>/)
  })

  it('offers Lanjutkan for an in-progress session', () => {
    // The whole nudge decided in #74 — no reminder infrastructure, just this affordance.
    expect(source()).toContain('Lanjutkan')
  })

  it('has an Indonesian empty state that exposes no authoring action', () => {
    const text = source()
    expect(text).toContain('Belum ada asesmen yang tersedia saat ini')
    for (const forbidden of ['Buat instrumen', 'Tambah', '/dashboard']) {
      expect(text).not.toContain(forbidden)
    }
  })

  it('shows an item count but promises no duration', () => {
    // #61 declined a time estimate: the product has not defined one, and there is no session time
    // limit to derive one from.
    expect(source()).toContain('pertanyaan')
    expect(source()).not.toMatch(/menit|jam|durasi/i)
  })

  it('carries no per-row consent state', () => {
    // Consent is per policy document, so every row would show the same value (#59/#61). The link
    // to the consent *page* is expected and fine; what must not appear is a per-row field or badge
    // reporting whether this student has consented.
    expect(source()).not.toMatch(/version\.(consent|accepted)/i)
    expect(template(LIST)).not.toMatch(/(sudah|belum)\s+(setuju|menyetujui)/i)
  })
})

describe('the consent page', () => {
  const source = () => read(CONSENT)

  it('groups the checkboxes in a fieldset with a legend', () => {
    expect(source()).toContain('<fieldset')
    expect(source()).toContain('<legend')
  })

  it('uses native checkboxes rather than a custom control', () => {
    const matches = source().match(/type="checkbox"/g) ?? []
    expect(matches).toHaveLength(2)
  })

  it('starts both boxes unticked', () => {
    // Consent is an affirmative act; a pre-ticked box collects it by default rather than by
    // decision, and that is true even when a row is already on record (#59).
    expect(source()).toContain('const acceptPrivacy = ref(false)')
    expect(source()).toContain('const acceptResearch = ref(false)')
  })

  it('gates the accept action on the mandatory notice alone', () => {
    // Refusing the research opt-in has to be survivable, or it is not consent.
    expect(source()).toMatch(/:disabled="!acceptPrivacy/)
    expect(source()).not.toMatch(/:disabled="[^"]*acceptResearch/)
  })

  it('offers no decline button, because leaving is declining', () => {
    // #59: a refusal is the absence of a row, so a "Tolak" button would imply a stored refusal.
    expect(template(CONSENT)).not.toMatch(/Tolak|Menolak/)
    expect(source()).toContain('Meninggalkan halaman')
  })

  it('states that consent is required to start', () => {
    expect(source()).toContain('diperlukan untuk memulai asesmen')
  })

  it('documents why v-html is safe here rather than only silencing the rule', () => {
    // The rule is disabled twice; an unexplained disable is how a real XSS gets waved through
    // later by someone copying the pattern.
    const text = source()
    expect(text).toContain('eslint-disable-next-line vue/no-v-html')
    expect(text).toMatch(/never runtime user input/)
  })
})
