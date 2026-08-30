import { describe, expect, it } from 'vitest'
import { keysIn, message, readRaw, says } from '../support/messages'

/**
 * Source-level assertions for the scoring configuration screen.
 *
 * This is the one authoring surface where the *separation* between two roles is the feature, not
 * the layout. rbac.md gives Lab Admin `Draft` and Academic Lead `Approve`, and `/CLAUDE.md` rule 1
 * rests on those being different people. A refactor that collapses the two halves into one form
 * would pass every other test in this repo.
 *
 * The form itself is twenty-odd numeric inputs, which is exactly the shape that loses its labels
 * in a later tidy-up.
 */

const PAGE = 'pages/dashboard/scoring.vue'

const read = () => readRaw(PAGE)

const template = () =>
  (read().match(/<template>([\s\S]*)<\/template>/) ?? ['', ''])[1]!.replace(/<!--[\s\S]*?-->/g, '')

describe('the page sits behind auth on the staff shell', () => {
  it('uses the dashboard layout', () => {
    expect(read()).toContain("middleware: 'auth'")
    expect(read()).toContain("layout: 'dashboard'")
  })
})

describe('tokens own every colour', () => {
  it('contains no colour literal', () => {
    expect(read()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(read()).not.toMatch(/\brgba?\(/)
    expect(read()).not.toMatch(/\bhsla?\(/)
  })
})

describe('the two halves of the workflow stay separate', () => {
  it('decides what to render from the viewer’s roles', () => {
    expect(read()).toContain("includes('lab_admin')")
    expect(read()).toContain("includes('academic_lead')")
  })

  it('gates drafting and approving on different roles', () => {
    const markup = template()
    expect(markup).toContain('v-if="canDraft"')
    expect(markup).toContain("canApprove && scoring.status === 'draft'")
  })

  it('tells a viewer who cannot draft whose job it is, rather than hiding the fact', () => {
    expect(says(PAGE, 'authoring.scoring.draftElsewhere')).toMatch(/Lab Admin/)
  })

  it('says out loud that approving is irreversible and ADR-gated', () => {
    const warning = says(PAGE, 'authoring.scoring.approvalWarning')
    expect(warning).toMatch(/tidak dapat diubah/i)
    expect(warning).toMatch(/ADR/)
  })

  it('offers no edit form for an existing scoring version', () => {
    // An approved one is frozen by trigger and a draft's weights are written with it in one
    // transaction. A form the API has no endpoint for would be a lie in the shape of a form.
    expect(template()).not.toMatch(/scoring\.(bands|weights)\[/)
  })
})

describe('the form’s labelling', () => {
  it('groups the three sets of inputs in fieldsets with legends', () => {
    const markup = template()
    expect((markup.match(/<fieldset/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect((markup.match(/<legend/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('gives every numeric input its own accessible name', () => {
    const markup = template()
    const numeric = markup.match(/type="number"/g) ?? []
    const labelled = markup.match(/:aria-label=/g) ?? []
    expect(numeric.length).toBeGreaterThan(0)
    // Each `type="number"` input in this file is inside a repeated `v-for`, so the count of
    // aria-label bindings is what has to keep up, not the rendered node count.
    expect(labelled.length).toBeGreaterThanOrEqual(numeric.length)
  })

  it('names each band and weight input after the thing it sets', () => {
    expect(says(PAGE, 'authoring.scoring.bandMinLabel')).toMatch(/\{band\}/)
    expect(says(PAGE, 'authoring.scoring.weightLabel')).toMatch(/\{dimension\}/)
  })

  it('reports a failure in a live region rather than only in the console', () => {
    expect((template().match(/role="alert"/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

describe('the copy exists in both languages', () => {
  it('has an English message for every key this page names', () => {
    for (const key of keysIn(read())) {
      expect(message('en', key), `en ${key}`).toBeTruthy()
    }
  })
})
