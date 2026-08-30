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

/**
 * Source with comments removed. Every negative assertion must use this: a guard whose comment
 * explains the forbidden construct will otherwise trip on its own documentation.
 *
 * A scanner rather than regexes, because a regex pair cannot tell a comment from a string — it
 * deleted two thirds of auth-client.ts, including the function under test, over a path containing
 * a slash-star. Limitation: regex literals are treated as code.
 */
// Written with escape sequences rather than literal quote characters. A literal backtick inside a
// single-quoted string is valid TypeScript but the oxc parser used by the transform pipeline
// rejects it, and quote-inside-quote is unreadable regardless.
const SINGLE = '\u0027'
const DOUBLE = '\u0022'
const BACKTICK = '\u0060'
const BACKSLASH = '\u005C'

function stripComments(source: string): string {
  let out = ''
  let i = 0
  let quote: string | null = null

  while (i < source.length) {
    const char = source[i]!
    const next = source[i + 1]

    if (quote) {
      out += char
      if (char === BACKSLASH) {
        out += source[i + 1] ?? ''
        i += 2
        continue
      }
      if (char === quote) quote = null
      i += 1
      continue
    }

    if (char === SINGLE || char === DOUBLE || char === BACKTICK) {
      quote = char
      out += char
      i += 1
      continue
    }

    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }

    if (char === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 2
      continue
    }

    out += char
    i += 1
  }

  return out
}

const readCode = (path: string) => stripComments(read(path))

const LAYOUT = 'layouts/dashboard.vue'
const PAGES = [
  'pages/dashboard/index.vue',
  'pages/dashboard/users.vue',
  'pages/dashboard/audit.vue',
] as const

describe('shell landmarks', () => {
  const layout = read(LAYOUT)

  /**
   * Counting `<main` in this file alone is what let the duplicate through: the layout had exactly
   * one, and `SidebarInset` rendered a second that this spec could not see, so every dashboard
   * page shipped with two main landmarks. The landmark now comes from `SidebarInset` only, and
   * the count is taken across both files rather than one.
   */
  it('has exactly one main landmark across the shell, with the skip-target id', () => {
    const inset = read('components/ui/sidebar/SidebarInset.vue')
    const mains = [...layout.matchAll(/<main\b/g), ...inset.matchAll(/<main\b/g)]
    expect(mains).toHaveLength(1)
    expect(layout).toContain('id="main-content"')
  })

  it('has a banner header and one h1', () => {
    expect(layout).toContain('<header')
    expect([...layout.matchAll(/<h1\b/g)]).toHaveLength(1)
  })

  it('derives the h1 from the route rather than a slot a page cannot fill', () => {
    // A Nuxt page cannot fill a layout's named slot: `<template #title>` in a page body is a second
    // template root, not slot content.
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
    expect(signIn).toContain('autocomplete="username"')
    expect(signIn).toContain('autocomplete="current-password"')
  })

  it('announces failures with role="alert"', () => {
    expect(signIn).toContain('role="alert"')
  })

  it('does not reveal whether an address is registered', () => {
    // disableSignUp means account existence is not otherwise discoverable, so the message must not
    // distinguish a missing account from a bad password.
    const assigned = [...readCode('pages/sign-in.vue').matchAll(/message\.value = '([^']*)'/g)].map(
      (m) => m[1]
    )
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

describe('SSR-safety guards', () => {
  const middlewareCode = readCode('middleware/auth.ts')
  const authClientCode = readCode('utils/auth-client.ts')
  const signInCode = readCode('pages/sign-in.vue')

  /**
   * Alongside the e2e suite, not instead of it: these pin what a request cannot reach, such as the
   * sign-in redirect, which resolves in the browser after a POST.
   */
  it('the middleware does not reach for the browser auth client', () => {
    expect(middlewareCode).not.toMatch(/authClient/)
  })

  it('the middleware uses useRequestFetch, the API that works on both sides', () => {
    // Nuxt's own useFetch calls this internally for relative URLs during SSR, which is why the
    // data pages worked while the middleware did not.
    expect(middlewareCode).toContain('useRequestFetch()')
  })

  it('the middleware refuses a deactivated account (FR-023)', () => {
    expect(middlewareCode).toMatch(/status === 'disabled'/)
  })

  it('the middleware surfaces infrastructure failure instead of redirecting into a loop', () => {
    // get-session returns null/200 when unauthenticated, so a throw is a real failure. Redirecting
    // on it sends the user to a sign-in page that also cannot work.
    expect(middlewareCode).toMatch(/statusCode:\s*503/)
  })

  it('the auth client refuses to run on the server, and says what to use instead', () => {
    // The root cause. Without this, the next SSR caller gets "Failed to parse URL" from inside
    // undici, which names neither the cause nor the fix.
    expect(authClientCode).toMatch(/import\.meta\.server/)
    expect(authClientCode).toContain('useServerAuth()')
    expect(authClientCode).toContain('useRequestFetch()')
  })

  it('sign-in validates its own redirect rather than relying on navigateTo to refuse', () => {
    // navigateTo does refuse an external target, but leaning on that means a successful sign-in
    // ends in a thrown navigation error, and it is one `external: true` away from a real open
    // redirect.
    expect(signInCode).toContain('safeRedirect(')
    expect(signInCode).not.toMatch(/navigateTo\(\s*route\.query\.redirect/)
  })
})
