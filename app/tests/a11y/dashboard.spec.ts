import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Source-level accessibility assertions for the Lab Admin shell, matching the pattern in
 * homepage.spec.ts. These are not a substitute for an axe run against a rendered page — they catch
 * the omissions that are invisible in review and cheap to assert.
 */

const APP = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(APP, path), 'utf-8')

const LAYOUT = 'layouts/dashboard.vue'
const PAGES = [
  'pages/dashboard/index.vue',
  'pages/dashboard/users.vue',
  'pages/dashboard/audit.vue',
] as const

describe('shell landmarks', () => {
  const layout = read(LAYOUT)

  it('has exactly one main landmark, with the skip-target id', () => {
    expect([...layout.matchAll(/<main\b/g)]).toHaveLength(1)
    expect(layout).toContain('id="main-content"')
  })

  it('has a banner header and one h1', () => {
    expect(layout).toContain('<header')
    expect([...layout.matchAll(/<h1\b/g)]).toHaveLength(1)
  })

  it('derives the h1 from the route rather than a slot a page cannot fill', () => {
    // A Nuxt page cannot fill a layout's named slot — `<template #title>` in a page body is a
    // second template root, not slot content. The first version of this shell did exactly that
    // and lint caught it; asserted so it does not come back.
    expect(layout).toContain('{{ pageTitle }}')
    expect(layout).not.toMatch(/<slot\s+name="title"/)
  })

  it('no page declares a title slot', () => {
    for (const page of PAGES) {
      expect(read(page), page).not.toMatch(/<template\s+#title/)
    }
  })
})

describe('disabled navigation items', () => {
  const layout = read(LAYOUT)

  it('marks unavailable items with aria-disabled, not just colour', () => {
    expect(layout).toContain(':aria-disabled="true"')
  })

  it('carries a visible text reason as well as the styling', () => {
    // opacity alone communicates nothing to assistive technology and nothing to a user who
    // cannot perceive the contrast difference. WCAG 2.2 AA: colour is never the only channel.
    expect(layout).toMatch(/Later|not in this phase/)
  })

  it('does not make an unavailable item a link', () => {
    // A disabled item must not be focusable as a navigation target — it goes nowhere.
    const disabledBlock = layout.slice(
      layout.indexOf('v-if="!item.available"'),
      layout.indexOf('v-else')
    )
    expect(disabledBlock).not.toContain('NuxtLink')
  })
})

describe('every page is behind auth and the policy layer', () => {
  it.each(PAGES)('%s declares the auth middleware', (page) => {
    // Defence in depth only — the endpoints are independently gated — but a protected page that
    // renders an empty shell to a signed-out visitor is a bug worth preventing.
    expect(read(page)).toContain("middleware: 'auth'")
  })

  it.each(PAGES)('%s uses the dashboard layout', (page) => {
    expect(read(page)).toContain("layout: 'dashboard'")
  })

  it.each(PAGES)('%s sets a document title', (page) => {
    expect(read(page)).toContain('useHead(')
  })
})

describe('data tables carry their own text equivalents', () => {
  it('the role distribution is a table with a caption and scoped headers', () => {
    // dashboard.md requires every chart to have a text equivalent. A table IS the text
    // equivalent, so the bar beside each row is decorative and must be hidden from the
    // accessibility tree rather than described.
    const index = read('pages/dashboard/index.vue')
    expect(index).toContain('<caption')
    expect(index).toContain('scope="col"')
    expect(index).toContain('scope="row"')
    expect(index).toMatch(/aria-hidden="true"[\s\S]{0,120}bg-primary/)
  })

  it.each(['pages/dashboard/users.vue', 'pages/dashboard/audit.vue'])(
    '%s gives its table a caption and column scopes',
    (page) => {
      const source = read(page)
      expect(source).toContain('<caption')
      expect(source).toContain('scope="col"')
    }
  )

  it('account status is not communicated by colour alone', () => {
    const users = read('pages/dashboard/users.vue')
    expect(users).toContain('{{ user.status }}')
  })
})

describe('sign-in', () => {
  const signIn = read('pages/sign-in.vue')

  it('labels both fields and sets autocomplete', () => {
    expect(signIn).toContain('for="email"')
    expect(signIn).toContain('for="password"')
    expect(signIn).toContain("autocomplete=\"username\"")
    expect(signIn).toContain("autocomplete=\"current-password\"")
  })

  it('announces failures with role="alert"', () => {
    expect(signIn).toContain('role="alert"')
  })

  it('does not reveal whether an address is registered', () => {
    // disableSignUp means account existence is not otherwise discoverable, so the failure message
    // must not distinguish a missing account from a bad password.
    //
    // Scoped to the strings actually assigned to `message`, not the whole file: the first version
    // asserted the file contained no such wording and tripped on the source comment explaining
    // why it must not — the same trap a guard in this repo hit once before.
    const assigned = [...signIn.matchAll(/message\.value = '([^']*)'/g)].map((m) => m[1])
    expect(assigned).toContain('Those credentials were not accepted.')
    for (const text of assigned) {
      expect(text).not.toMatch(/no such|unknown|not registered|incorrect|wrong/i)
    }
  })
})

describe('the prototype is gone', () => {
  it('app/pages/dashboard/prototype.vue no longer exists', () => {
    // It carried deliberately fake nav labels from the sidebar-08 demo. Issue #25 deletes it.
    expect(() => read('pages/dashboard/prototype.vue')).toThrow()
  })
})
