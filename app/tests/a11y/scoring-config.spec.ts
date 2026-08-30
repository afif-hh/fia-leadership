import { describe, expect, it } from 'vitest'
import { keysIn, message, readRaw, says } from '../support/messages'

/** The shared components this page delegates its guarantees to. Asserting the delegation without
 * asserting what it delegates *to* would be a test that passes on an empty component. */
const ALERT = 'components/ui/alert/Alert.vue'

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

  it('pairs every numeric input with a visible label, not a hidden one', () => {
    // The page used `:aria-label` before it moved onto the dashboard's Field/Input pair. A visible
    // `<label for>` is the stronger of the two: it names the input for assistive technology *and*
    // gives every sighted user a click target, which twenty bare number boxes badly need.
    const markup = template()
    const numeric = markup.match(/type="number"/g) ?? []
    const labelFor = markup.match(/<FieldLabel :for=/g) ?? []
    const inputIds = markup.match(/<Input\s+:id=/g) ?? []

    expect(numeric.length).toBeGreaterThan(0)
    expect(labelFor.length).toBeGreaterThanOrEqual(numeric.length)
    expect(inputIds.length).toBeGreaterThanOrEqual(numeric.length)
  })

  it('names each band and weight input after the thing it sets', () => {
    // Read from the same message files the rest of the report reads, not from a label key of this
    // page's own — a band called `Mapan` here and `established` on the profile screen would be two
    // names for one thing.
    const markup = template()
    expect(markup).toContain('t(`bands.${code}`)')
    expect(markup).toContain('{{ dimension.name }}')
  })

  it('reports a failure in a live region rather than only in the console', () => {
    // Delegated to `Alert`, so both halves are asserted: that this page uses it for every failure
    // path, and that `Alert` is in fact a live region.
    expect((template().match(/<Alert v-if=/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(readRaw(ALERT)).toContain('role="alert"')
  })

  it('sits on the dashboard\u2019s own data surface rather than a hand-rolled one', () => {
    // CLAUDE.md rule 4: use the UI components that already exist. This page was written before the
    // dashboard moved onto shadcn-vue and carried raw `<table>` and `<select>` until it was
    // merged with that work.
    const markup = template()
    expect(markup).toContain('<DataCard')
    expect(markup).toContain('<Table>')
    expect(markup).not.toContain('<table')
    expect(markup).not.toContain('<select')
  })
})

describe('the "no Blake-Mouton" option', () => {
  it('uses a named sentinel, never the empty string', () => {
    // reka-ui reserves `''` for clearing a Select, and a `SelectItem` carrying it throws during
    // render — the whole page 500s rather than degrading. Caught by opening the page, not by any
    // test, which is why there is now a test.
    const markup = template()
    expect(markup).not.toMatch(/<SelectItem\s+value=""/)
    expect(markup).toContain(':value="NO_AXIS"')
  })

  it('maps that sentinel back to null before it reaches the API', () => {
    // The column pair is nullable together, so "no grid" has to survive the round trip as null
    // rather than as the string 'none'.
    expect(read()).toContain('id === NO_AXIS ? null : id')
  })
})

describe('the copy exists in both languages', () => {
  it('has an English message for every key this page names', () => {
    for (const key of keysIn(read())) {
      expect(message('en', key), `en ${key}`).toBeTruthy()
    }
  })
})
