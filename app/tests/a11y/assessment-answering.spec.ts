import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Source-level assertions for the answering screen and the page after submit (#60, #62, #63).
 *
 * The accessibility rules here came out of a research ticket (#63) rather than a style guide, and
 * every one of them is the kind of thing that gets "simplified" later by someone who does not know
 * why it is that way. These tests are the note that survives the refactor. They do not replace an
 * axe run against the rendered page, which the accessibility DoD still requires.
 */

const APP = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(APP, path), 'utf-8')

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

  it('keeps clear of whatever is focused', () => {
    // SC 2.4.11. #63 flagged a sticky footer as the usual way to fail it, so the form reserves
    // room rather than letting the bar sit on top of the focused control.
    expect(source()).toContain('scroll-padding-bottom')
    expect(source()).toMatch(/padding-bottom:\s*8rem/)
  })

  it('holds the submit action and the progress count', () => {
    expect(source()).toContain('Kirim Jawaban')
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
    expect(source()).toContain('Lompat ke pertanyaan')
    expect(source()).toMatch(/sudah terjawab/)
    expect(source()).toMatch(/belum terjawab/)
  })

  it('scrolls a resumed session to the first unanswered item, with no banner', () => {
    expect(source()).toMatch(/firstUnansweredId/)
    // A "you were here" banner was considered and rejected — the scroll position says it (#60).
    expect(template(ANSWERING)).not.toMatch(/melanjutkan|dilanjutkan/i)
  })

  it('offers a manual retry once auto-retry has given up', () => {
    expect(source()).toContain('Coba lagi')
    expect(source()).toContain('Gagal menyimpan')
  })
})

describe('the page after submit', () => {
  const source = () => read(DONE)

  it('promises a result without committing to when', () => {
    // #62: neither the scoring engine nor any notification service exists, so a specific promise
    // would be one the product cannot keep.
    expect(source()).toContain('Hasil akan tersedia di sini nanti')
    expect(source()).not.toMatch(/\d+\s*(hari|jam|minggu)/i)
    expect(source()).not.toMatch(/email|notifikasi/i)
  })

  it('carries no score disclaimer, because it shows no score', () => {
    // kdpgk-v1.md requires the disclaimer on every *output*; there is no number here to guard.
    expect(source()).not.toMatch(/vonis|indeks komunikasi/i)
  })

  it('offers exactly one way onward, back to the list', () => {
    expect(source()).toContain('Kembali ke Daftar Asesmen')
    // Modules, simulations and development goals do not exist; a link to nothing is worse than
    // no link (#62).
    for (const absent of ['/modul', '/simulasi', '/development', '/academy']) {
      expect(source()).not.toContain(absent)
    }
  })

  it('does not offer to show the submitted answers', () => {
    // Re-reading a raw response set belongs with the result page, which is out of scope (#62).
    expect(source()).not.toMatch(/lihat jawaban|jawaban saya/i)
  })
})
