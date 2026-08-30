import { describe, it, expect } from 'vitest'
import { messagesIn, readRaw, says } from '../support/messages'

/**
 * Source-level assertions for the answering screen and the page after submit (#60, #62, #63).
 *
 * The accessibility rules here came out of a research ticket (#63) rather than a style guide, and
 * every one of them is the kind of thing that gets "simplified" later by someone who does not know
 * why it is that way. These tests are the note that survives the refactor. They do not replace an
 * axe run against the rendered page, which the accessibility DoD still requires.
 */

/** The file exactly as written. Copy is asserted through `says`/`messagesIn`; see
 * `../support/messages.ts` for why the two are kept apart. */
const read = (path: string) => readRaw(path)

/** Just the `<template>` block, comments stripped — see the note in assessment-taking.spec.ts. */
const template = (path: string) =>
  (read(path).match(/<template>([\s\S]*)<\/template>/) ?? ['', ''])[1]!.replace(
    /<!--[\s\S]*?-->/g,
    ''
  )

const ANSWERING = 'pages/assessment/[versionId]/index.vue'
const DONE = 'pages/assessment/[versionId]/selesai.vue'
const COMPOSABLE = 'composables/useAssessmentSession.ts'

describe('tokens own every colour', () => {
  it.each([ANSWERING, DONE])('%s contains no colour literal', (path) => {
    const source = read(path)
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(source).not.toMatch(/\brgba?\(/)
    expect(source).not.toMatch(/\bhsla?\(/)
  })
})

describe('both pages sit behind auth on the student shell', () => {
  it.each([ANSWERING, DONE])('%s', (path) => {
    expect(read(path)).toContain("middleware: 'auth'")
    expect(read(path)).toContain("layout: 'assessment'")
  })
})

describe('the answering screen’s question markup', () => {
  const source = () => read(ANSWERING)

  it('wraps each question in a fieldset with the stem as its legend', () => {
    // #63 settled this over an ARIA radiogroup and over a bare table: the stem has to be the
    // group's accessible name, and `<legend>` is the only thing that does that natively.
    expect(source()).toContain('<fieldset')
    expect(source()).toContain('<legend')
    expect(template(ANSWERING)).toMatch(/<legend[\s\S]{0,200}item\.stem/)
  })

  it('uses native radio inputs, not an ARIA radiogroup or shadcn RadioGroup', () => {
    // Asserted against the template, not the file: the module comment names both rejected
    // options, and matching on the whole source fails on the very note explaining the choice.
    const markup = template(ANSWERING)
    expect(markup).toContain('type="radio"')
    expect(markup).not.toMatch(/role="radiogroup"/)
    expect(markup).not.toMatch(/RadioGroup/)
  })

  it('gives every option a 44px target', () => {
    // design.md's touch-target floor. Students fill this on a phone.
    expect(source()).toMatch(/min-h-11/)
  })
})

describe('the saved indicator', () => {
  const source = () => read(ANSWERING)

  it('is one shared polite region rather than one per item', () => {
    // SC 4.1.3, and #63's specific warning: a burst of per-item announcements is worse than
    // silence. Exactly one live region on the page.
    const regions = template(ANSWERING).match(/role="status"/g) ?? []
    expect(regions).toHaveLength(1)
    expect(source()).toContain('aria-live="polite"')
  })

  it('is never assertive', () => {
    expect(source()).not.toContain('aria-live="assertive"')
    expect(source()).not.toContain('role="alert"' + ' aria-live')
  })

  it('is debounced in the composable rather than fired on every keystroke', () => {
    expect(read(COMPOSABLE)).toMatch(/statusTimer = setTimeout/)
  })
})

describe('the sticky bar', () => {
  const source = () => read(ANSWERING)

  it('puts scroll-padding on the scroll container, not on the form', () => {
    /**
     * SC 2.4.11, and a check that had to be rewritten after it lied.
     *
     * The first version asserted only that the string `scroll-padding-bottom` appeared somewhere
     * in the file. It passed while the property sat on `.assessment-form` — a div that does not
     * scroll — so the declaration computed to 128px and had no effect whatsoever, and a
     * tabbed-to control still landed underneath the sticky bar. Measured in a real browser:
     * with the property on `<html>` the control lands 83px clear of the bar; with it removed it
     * is 45px underneath.
     *
     * So this asserts the *target*, which is the part that was wrong, rather than the presence of
     * a word.
     */
    expect(source()).toMatch(/html\s*\{\s*scroll-padding-bottom/)
    expect(source()).not.toMatch(/\.assessment-form\s*\{[^}]*scroll-padding/)
    // The form still reserves room at its end so the last question can clear the bar at all.
    expect(source()).toMatch(/padding-bottom:\s*8rem/)
  })

  it('holds the submit action and the progress count', () => {
    expect(says(ANSWERING, 'assessment.take.submit')).toBe('Kirim Jawaban')
    expect(template(ANSWERING)).toMatch(/answeredCount[\s\S]{0,60}total/)
  })

  it('disables submit until every answer is saved', () => {
    expect(source()).toMatch(/:disabled="!session\.canSubmit/)
  })
})

describe('layout decisions that came out of the prototype', () => {
  const source = () => read(ANSWERING)

  it('renders every item on one page rather than paging', () => {
    // Variants A (one per screen) and C (blocks of three) were built and discarded (#60).
    expect(template(ANSWERING)).toMatch(/v-for="item in detail\.items"/)
    expect(source()).not.toMatch(/currentPage|pageIndex|nextPage/)
  })

  it('offers a jump map for free navigation', () => {
    // Each button says where it goes and whether that question is done — a bare number would
    // leave a screen-reader user counting unlabelled controls (#60, #63).
    expect(says(ANSWERING, 'assessment.take.jumpNavLabel')).toBe('Lompat ke pertanyaan')
    expect(says(ANSWERING, 'assessment.take.jumpAnswered')).toMatch(/sudah terjawab/)
    expect(says(ANSWERING, 'assessment.take.jumpUnanswered')).toMatch(/belum terjawab/)
  })

  it('forwards cookies on the initial load, so a refresh does not break resume', () => {
    /**
     * `useAsyncData` with a bare `$fetch` runs on the server during a full page load and forwards
     * no cookie, so the request arrives unauthenticated and the page renders its error state.
     * A client-side navigation works fine, which is what makes it easy to ship: the bug only
     * appears on refresh or a bookmarked link — the resume path. Found by loading the URL
     * directly in a browser. `app/middleware/auth.ts` carries the same note.
     */
    expect(source()).toContain('useRequestFetch()')
  })

  it('scrolls a resumed session to the first unanswered item, with no banner', () => {
    expect(source()).toMatch(/firstUnansweredId/)
    // A "you were here" banner was considered and rejected — the scroll position says it (#60).
    expect(messagesIn(ANSWERING)).not.toMatch(/melanjutkan|dilanjutkan/i)
  })

  it('offers a manual retry once auto-retry has given up', () => {
    expect(says(ANSWERING, 'common.retry')).toBe('Coba lagi')
    expect(says(ANSWERING, 'assessment.take.saveFailed')).toMatch(/Gagal menyimpan/)
  })
})

describe('the page after submit', () => {
  const source = () => read(DONE)

  it('promises a result without committing to when', () => {
    // #62: neither the scoring engine nor any notification service exists, so a specific promise
    // would be one the product cannot keep.
    expect(says(DONE, 'assessment.done.body')).toMatch(/Hasil akan tersedia di sini nanti/)
    // Against the page's copy, not its source: a promise can only be made in the words shown.
    expect(messagesIn(DONE)).not.toMatch(/\d+\s*(hari|jam|minggu)/i)
    expect(messagesIn(DONE)).not.toMatch(/email|notifikasi/i)
  })

  it('carries no score disclaimer, because it shows no score', () => {
    // kdpgk-v1.md requires the disclaimer on every *output*; there is no number here to guard.
    expect(messagesIn(DONE)).not.toMatch(/vonis|indeks komunikasi/i)
  })

  it('offers exactly one way onward, back to the list', () => {
    expect(says(DONE, 'assessment.done.backToList')).toBe('Kembali ke Daftar Asesmen')
    // Modules, simulations and development goals do not exist; a link to nothing is worse than
    // no link (#62).
    for (const absent of ['/modul', '/simulasi', '/development', '/academy']) {
      expect(source()).not.toContain(absent)
    }
  })

  it('does not offer to show the submitted answers', () => {
    // Re-reading a raw response set belongs with the result page, which is out of scope (#62).
    expect(messagesIn(DONE)).not.toMatch(/lihat jawaban|jawaban saya/i)
  })
})
