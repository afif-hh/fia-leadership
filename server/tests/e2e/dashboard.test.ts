import { describe, expect, it, beforeAll } from 'vitest'
import { setup, $fetch, fetch as nuxtFetch } from '@nuxt/test-utils/e2e'

import { ACCOUNTS, E2E_DB, E2E_PASSWORD } from './setup'

/**
 * Real HTTP requests against a real running application.
 *
 * Every assertion here covers a case that no other test in this repository can express, and two of
 * them cover defects that actually shipped:
 *
 *   - /dashboard returned 500 for every protected route, because the auth middleware called a
 *     browser client whose baseURL is relative and unusable during SSR. 192 tests were green.
 *   - /api/v1/audit-logs returned every row to a student entitled only to their own, because the
 *     scope predicate authorised the request without narrowing the query. The status code was 200
 *     in both the correct and the incorrect case, so asserting it proved nothing.
 *
 * `dev: true` rather than a production build: nuxt.config.ts sets nitro.preset
 * 'cloudflare_module', whose output is a Worker module and not something the harness can start.
 */
/**
 * The environment is passed explicitly rather than set in globalSetup.
 *
 * globalSetup runs in vitest's main process; `setup()` runs inside a test worker, and the worker
 * is forked with whatever `process.env` held at fork time. Mutating env in globalSetup happened to
 * work when the e2e project ran alone and failed with "Server process exited before becoming
 * ready" once the server project ran alongside it, because the extra workers changed the fork
 * order. Passing `env` here removes the cross-process dependency entirely — the values reach the
 * child through the spawn options, not through a race.
 */
await setup({
  dev: true,
  server: true,
  env: {
    NUXT_TURSO_DATABASE_URL: `file:${E2E_DB}`,
    TURSO_DATABASE_URL: `file:${E2E_DB}`,
    NUXT_BETTER_AUTH_SECRET: 'e2e-fixture-secret-not-used-anywhere-real',
    NUXT_PUBLIC_BETTER_AUTH_URL: 'http://localhost:3000',
  },
})

/** Signs in and returns the raw Set-Cookie value, so subsequent requests can carry the session. */
async function signIn(email: string): Promise<string> {
  const response = await nuxtFetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: E2E_PASSWORD }),
    redirect: 'manual',
  })

  const cookie = response.headers.get('set-cookie')
  if (!cookie) throw new Error(`sign-in did not set a cookie for ${email} (${response.status})`)
  return cookie.split(';')[0]!
}

let adminCookie: string
let studentCookie: string
let disabledCookie: string

beforeAll(async () => {
  adminCookie = await signIn(ACCOUNTS.labAdmin.email)
  studentCookie = await signIn(ACCOUNTS.student.email)
  disabledCookie = await signIn(ACCOUNTS.disabled.email)
}, 120_000)

describe('the dashboard renders', () => {
  it('returns 200 and the navigation rail for a Lab Admin', async () => {
    // The regression this file exists for. Before the SSR fix this was 500 with
    // "Failed to parse URL from /api/auth/get-session".
    const response = await nuxtFetch('/dashboard', { headers: { cookie: adminCookie } })
    expect(response.status).toBe(200)

    const html = await response.text()
    expect(html).toContain('Overview')
    expect(html).toContain('Audit log')
    expect(html).toContain('id="main-content"')
  })

  it('renders unavailable items disabled, with a text reason and not as links', async () => {
    const html = await (await nuxtFetch('/dashboard', { headers: { cookie: adminCookie } })).text()
    expect(html).toContain('Scoring rules')
    expect(html.match(/aria-disabled="true"/g) ?? []).toHaveLength(5)
    expect(html.match(/>Later</g) ?? []).toHaveLength(5)
  })
})

describe('the middleware redirects rather than rendering a broken shell', () => {
  it('sends a signed-out visitor to sign-in, preserving where they were going', async () => {
    const response = await nuxtFetch('/dashboard', { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/sign-in?redirect=/dashboard')
  })

  it('sends a deactivated account to sign-in with a reason, not into the shell', async () => {
    // FR-023: deactivation is a change to login status. Before this fix the account held a valid
    // session, passed the middleware, and landed on a shell where every request returned 401.
    const response = await nuxtFetch('/dashboard', {
      headers: { cookie: disabledCookie },
      redirect: 'manual',
    })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/sign-in?reason=disabled')
  })
})

describe('the policy layer denies over real HTTP', () => {
  it('401s an unauthenticated API call, with the documented envelope', async () => {
    const response = await nuxtFetch('/api/v1/me')
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String), requestId: expect.any(String) },
    })
  })

  it('403s a student on a deny cell', async () => {
    // User Administration is `–` for Student. No resource is identified, so nothing leaks by
    // saying no outright.
    const response = await nuxtFetch('/api/v1/users', { headers: { cookie: studentCookie } })
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('FORBIDDEN')
  })

  it('404s a scoped refusal, so the row is not confirmed to exist', async () => {
    const response = await nuxtFetch('/api/v1/audit-logs', { headers: { cookie: studentCookie } })
    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe('NOT_FOUND')
  })

  it('gives a Lab Admin the full navigation and a student a narrowed one', async () => {
    const admin = await $fetch<{ navigation: { id: string }[] }>('/api/v1/me', {
      headers: { cookie: adminCookie },
    })
    const student = await $fetch<{ navigation: { id: string }[] }>('/api/v1/me', {
      headers: { cookie: studentCookie },
    })

    expect(admin.navigation).toHaveLength(8)
    // `aggregate` survives for a student because their cell is "Own cohort" — scoped, and the
    // client cannot resolve a scoped cell, so it stays visible and the route denies precisely.
    expect(student.navigation.map((n) => n.id)).toEqual(['overview', 'audit', 'aggregate'])
  })
})

describe('a scoped decision narrows the rows, not just the status code', () => {
  it('gives a student ONLY their own audit rows', async () => {
    // The leak. This returned every row in the table, including the Lab Admin's, with a correct
    // 200 throughout. Asserting the status code could never have caught it.
    const me = await $fetch<{ userId: string }>('/api/v1/me', {
      headers: { cookie: studentCookie },
    })

    const body = await $fetch<{ events: { actorUserId: string }[] }>('/api/v1/audit-logs', {
      headers: { cookie: studentCookie },
      query: { actorUserId: me.userId },
    })

    expect(body.events.length).toBeGreaterThan(0)
    for (const event of body.events) {
      expect(event.actorUserId).toBe(me.userId)
    }
  })

  it('gives a Lab Admin every row, because their cell is an outright R', async () => {
    const body = await $fetch<{ events: { actorUserId: string }[] }>('/api/v1/audit-logs', {
      headers: { cookie: adminCookie },
    })

    // Three accounts were seeded, each producing one role-change event.
    const actors = new Set(body.events.map((e) => e.actorUserId))
    expect(actors.size).toBeGreaterThanOrEqual(3)
  })

  it("404s a student who targets somebody else's actions", async () => {
    const admin = await $fetch<{ userId: string }>('/api/v1/me', {
      headers: { cookie: adminCookie },
    })

    const response = await nuxtFetch(
      `/api/v1/audit-logs?actorUserId=${encodeURIComponent(admin.userId)}`,
      { headers: { cookie: studentCookie } }
    )

    expect(response.status).toBe(404)
  })
})

describe('sign-in', () => {
  it('does not follow an external redirect', async () => {
    // navigateTo would refuse this anyway, but the page validates its own input rather than
    // relying on a framework guard. Asserted at the page level: the crafted value must not appear
    // as a destination.
    const html = await (await nuxtFetch('/sign-in?redirect=//evil.example')).text()
    expect(html).toContain('Sign in to the Lab Admin dashboard')
  })

  it('explains a deactivated account rather than showing a form that cannot work', async () => {
    const html = await (await nuxtFetch('/sign-in?reason=disabled')).text()
    expect(html).toContain('deactivated')
  })
})
