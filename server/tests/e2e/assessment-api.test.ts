import { describe, expect, it, beforeAll } from 'vitest'
import { setup, fetch as nuxtFetch } from '@nuxt/test-utils/e2e'

import { ACCOUNTS, E2E_DB, E2E_PASSWORD } from './setup'

/**
 * The assessment authoring API, over real HTTP against the real routes (#53).
 *
 * Deliberately not written as `server`-project integration tests: those cannot load a route file,
 * so they would have to *reproduce* each handler body, and a reproduced body drifts from the real
 * one silently — the hazard `scoped-narrowing.test.ts` already documents. Here the route file is
 * the thing under test, so there is nothing to reproduce. The domain functions the routes call are
 * covered separately in `server/tests/integration/assessment-*.test.ts`.
 *
 * Every case asserts one of the three shapes #53's definition of done asks for: the happy path, an
 * unauthorized role (403), and a not-found id (404).
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
let leadCookie: string
let studentCookie: string

interface Call {
  status: number
  body: Record<string, unknown>
}

async function call(cookie: string, method: string, path: string, body?: unknown): Promise<Call> {
  const response = await nuxtFetch(path, {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text === '' ? undefined : JSON.parse(text)
  } catch {
    // A non-JSON body is itself a finding — an unmapped throw renders Nitro's HTML error page —
    // so it is surfaced rather than swallowed.
    parsed = { raw: text }
  }
  return { status: response.status, body: (parsed ?? {}) as Record<string, unknown> }
}

const MISSING_ID = '00000000-0000-4000-8000-000000000000'

/** Built once by the happy-path walk-through and reused by the negative cases. */
let instrumentId: string
let scaleId: string
let dimensionId: string
let itemId: string
let v1Id: string

beforeAll(async () => {
  adminCookie = await signIn(ACCOUNTS.labAdmin.email)
  leadCookie = await signIn(ACCOUNTS.academicLead.email)
  studentCookie = await signIn(ACCOUNTS.student.email)
}, 180_000)

describe('authoring an instrument end to end', () => {
  it('creates an instrument, its scale, dimension and a bank item', async () => {
    const created = await call(adminCookie, 'POST', '/api/v1/assessment/instruments', {
      code: 'kdpgk_e2e',
      name: 'KDPGK (e2e)',
      description: null,
    })
    expect(created.status).toBe(200)
    instrumentId = (created.body.instrument as { id: string }).id
    expect(instrumentId).toBeTruthy()

    const scale = await call(
      adminCookie,
      'POST',
      `/api/v1/assessment/instruments/${instrumentId}/scales`,
      {
        code: 'likert5',
        name: 'Likert 5',
        points: [
          { value: 1, label: 'Sangat tidak sesuai' },
          { value: 5, label: 'Sangat sesuai' },
        ],
      }
    )
    expect(scale.status).toBe(200)
    scaleId = scale.body.scaleId as string

    const dimension = await call(
      adminCookie,
      'POST',
      `/api/v1/assessment/instruments/${instrumentId}/dimensions`,
      { code: 'directive', name: 'Directive', kind: 'style' }
    )
    expect(dimension.status).toBe(200)
    dimensionId = dimension.body.dimensionId as string

    const item = await call(
      adminCookie,
      'POST',
      `/api/v1/assessment/instruments/${instrumentId}/items`,
      {
        code: 'kd01',
        stem: 'Saya membuat keputusan tanpa berkonsultasi.',
        scaleId,
        dimensionIds: [dimensionId],
      }
    )
    expect(item.status).toBe(200)
    itemId = item.body.itemId as string
  })

  it('lists instruments and reads one back with its bank', async () => {
    const list = await call(adminCookie, 'GET', '/api/v1/assessment/instruments')
    expect(list.status).toBe(200)
    expect((list.body.instruments as { id: string }[]).map((i) => i.id)).toContain(instrumentId)

    const one = await call(adminCookie, 'GET', `/api/v1/assessment/instruments/${instrumentId}`)
    expect(one.status).toBe(200)
    expect((one.body.items as unknown[]).length).toBe(1)
    expect((one.body.dimensions as unknown[]).length).toBe(1)
    expect((one.body.scales as unknown[]).length).toBe(1)
  })

  it('creates a blank v1, selects the item, and reads the version detail', async () => {
    const version = await call(
      adminCookie,
      'POST',
      `/api/v1/assessment/instruments/${instrumentId}/versions`,
      {}
    )
    expect(version.status).toBe(200)
    v1Id = (version.body.version as { id: string; versionNo: number }).id
    expect((version.body.version as { versionNo: number }).versionNo).toBe(1)

    const patched = await call(adminCookie, 'PATCH', `/api/v1/assessment/versions/${v1Id}`, {
      op: 'addItem',
      itemId,
      position: 0,
    })
    expect(patched.status).toBe(200)
    expect((patched.body.items as unknown[]).length).toBe(1)

    const detail = await call(adminCookie, 'GET', `/api/v1/assessment/versions/${v1Id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.frozen).toBe(false)
    const items = detail.body.items as { code: string; stem: string; dimensions: unknown[] }[]
    expect(items[0]?.code).toBe('kd01')
    expect(items[0]?.dimensions).toHaveLength(1)
  })

  it('toggles reverse coding through the selection endpoint', async () => {
    const patched = await call(adminCookie, 'PATCH', `/api/v1/assessment/versions/${v1Id}`, {
      op: 'setReverseCoded',
      itemId,
      reverseCoded: true,
    })
    expect(patched.status).toBe(200)
    expect((patched.body.items as { reverseCoded: boolean }[])[0]?.reverseCoded).toBe(true)
  })

  it('reports an empty diff for a v1, which has no source to compare against', async () => {
    const diff = await call(adminCookie, 'GET', `/api/v1/assessment/versions/${v1Id}/diff`)
    expect(diff.status).toBe(200)
    expect(diff.body.blank).toBe(true)
    expect(diff.body.totalChanges).toBe(0)
  })

  it('advances to review, then publishes, and the version reads back frozen', async () => {
    expect(
      (await call(adminCookie, 'POST', `/api/v1/assessment/versions/${v1Id}/review`)).status
    ).toBe(200)

    const published = await call(adminCookie, 'POST', `/api/v1/assessment/versions/${v1Id}/publish`)
    expect(published.status).toBe(200)
    expect((published.body.version as { status: string }).status).toBe('published')

    const detail = await call(adminCookie, 'GET', `/api/v1/assessment/versions/${v1Id}`)
    expect(detail.body.frozen).toBe(true)
  })
})

describe('a published version is immutable over HTTP, with a legible error', () => {
  it('refuses a selection edit with 409 and a stable code, not a raw SQLITE_CONSTRAINT', async () => {
    const result = await call(adminCookie, 'PATCH', `/api/v1/assessment/versions/${v1Id}`, {
      op: 'removeItem',
      itemId,
    })

    // The point of #48's service guard: the trigger would abort this write regardless, but the
    // caller has to receive something it can act on.
    expect(result.status).toBe(409)
    const error = result.body.error as { code: string; message: string; requestId: string }
    expect(error.code).toBe('ASSESSMENT_VERSION_IMMUTABLE')
    expect(error.message).not.toMatch(/SQLITE_CONSTRAINT/)
    expect(error.message).toMatch(/new version/i)
    expect(error.requestId).toBeTruthy()
  })

  it('refuses re-publishing an already published version with 409', async () => {
    const result = await call(adminCookie, 'POST', `/api/v1/assessment/versions/${v1Id}/publish`)
    expect(result.status).toBe(409)
    expect((result.body.error as { code: string }).code).toBe(
      'ASSESSMENT_VERSION_TRANSITION_ILLEGAL'
    )
  })
})

describe('the diff makes in-place rewording visible (#49)', () => {
  it('shows a stem change between a published source and its clone', async () => {
    const clone = await call(
      adminCookie,
      'POST',
      `/api/v1/assessment/instruments/${instrumentId}/versions`,
      { sourceVersionId: v1Id }
    )
    expect(clone.status).toBe(200)
    const v2Id = (clone.body.version as { id: string }).id
    expect(clone.body.clonedItemCount).toBe(1)

    // Reword the bank item. The published v1 keeps its snapshot; v2 reads the new wording.
    const reworded = await call(adminCookie, 'PATCH', `/api/v1/assessment/items/${itemId}`, {
      stem: 'Saya berkonsultasi sebelum memutuskan.',
    })
    expect(reworded.status).toBe(200)

    const diff = await call(adminCookie, 'GET', `/api/v1/assessment/versions/${v2Id}/diff`)
    expect(diff.status).toBe(200)
    expect(diff.body.blank).toBe(false)
    const stemChanged = diff.body.stemChanged as { code: string; before: string; after: string }[]
    expect(stemChanged).toHaveLength(1)
    expect(stemChanged[0]?.code).toBe('kd01')
    expect(stemChanged[0]?.before).toMatch(/tanpa berkonsultasi/)
    expect(stemChanged[0]?.after).toMatch(/sebelum memutuskan/)
    expect(diff.body.totalChanges).toBe(1)

    // v1 is published, so it still asks what it froze — the whole point of snapshot-on-publish.
    const v1 = await call(adminCookie, 'GET', `/api/v1/assessment/versions/${v1Id}`)
    expect((v1.body.items as { stem: string }[])[0]?.stem).toMatch(/tanpa berkonsultasi/)
  })
})

describe('Academic Lead has the same write access as Lab Admin (#45)', () => {
  it('lets Academic Lead create an instrument, not merely read one', async () => {
    const created = await call(leadCookie, 'POST', '/api/v1/assessment/instruments', {
      code: 'lead_authored',
      name: 'Authored by Academic Lead',
    })
    expect(created.status).toBe(200)

    const list = await call(leadCookie, 'GET', '/api/v1/assessment/instruments')
    expect(list.status).toBe(200)
  })
})

describe('a role with no Assessment Configuration cell is refused', () => {
  const cases: [string, string, unknown][] = [
    ['GET', '/api/v1/assessment/instruments', undefined],
    ['POST', '/api/v1/assessment/instruments', { code: 'nope', name: 'Nope' }],
  ]

  it.each(cases)('refuses a student %s %s with 403', async (method, path, body) => {
    const result = await call(studentCookie, method, path, body)
    expect(result.status).toBe(403)
    expect((result.body.error as { code: string }).code).toBe('FORBIDDEN')
  })

  it('refuses a student the version detail, publish and diff alike', async () => {
    for (const [method, path] of [
      ['GET', `/api/v1/assessment/versions/${v1Id}`],
      ['GET', `/api/v1/assessment/versions/${v1Id}/diff`],
      ['POST', `/api/v1/assessment/versions/${v1Id}/publish`],
    ] as const) {
      const result = await call(studentCookie, method, path)
      expect(result.status, `${method} ${path}`).toBe(403)
    }
  })

  it('refuses an unauthenticated caller with 401', async () => {
    const result = await call('', 'GET', '/api/v1/assessment/instruments')
    expect(result.status).toBe(401)
  })
})

describe('an id that does not exist is a 404, not a 500', () => {
  it.each([
    ['GET', `/api/v1/assessment/instruments/${MISSING_ID}`],
    ['GET', `/api/v1/assessment/versions/${MISSING_ID}`],
    ['GET', `/api/v1/assessment/versions/${MISSING_ID}/diff`],
  ])('%s %s', async (method, path) => {
    const result = await call(adminCookie, method, path)
    expect(result.status).toBe(404)
    expect((result.body.error as { code: string }).code).toBe('NOT_FOUND')
  })

  it('returns 404 for publish and retire on a missing version', async () => {
    for (const path of [
      `/api/v1/assessment/versions/${MISSING_ID}/publish`,
      `/api/v1/assessment/versions/${MISSING_ID}/retire`,
    ]) {
      expect((await call(adminCookie, 'POST', path)).status, path).toBe(404)
    }
  })

  it('does not leak the id back in the message', async () => {
    const result = await call(adminCookie, 'GET', `/api/v1/assessment/versions/${MISSING_ID}`)
    expect((result.body.error as { message: string }).message).not.toContain(MISSING_ID)
  })
})

describe('a malformed body is a 422 carrying fields, per api-design.md', () => {
  it('rejects an unknown key rather than stripping it', async () => {
    const result = await call(adminCookie, 'POST', '/api/v1/assessment/instruments', {
      code: 'strict_check',
      name: 'Strict',
      somethingElse: 'should be rejected',
    })
    expect(result.status).toBe(422)
    const error = result.body.error as { code: string; fields: { path: string; code: string }[] }
    expect(error.code).toBe('VALIDATION_FAILED')
    expect(Array.isArray(error.fields)).toBe(true)
  })

  it('rejects a bad dimension kind', async () => {
    const result = await call(
      adminCookie,
      'POST',
      `/api/v1/assessment/instruments/${instrumentId}/dimensions`,
      { code: 'bad_kind', name: 'Bad', kind: 'not_a_kind' }
    )
    expect(result.status).toBe(422)
  })

  it('never echoes a submitted value back in the error', async () => {
    const secret = 'a-value-that-must-not-be-reflected'
    const result = await call(adminCookie, 'POST', '/api/v1/assessment/instruments', {
      code: 'reflect_check',
      name: 'Reflect',
      leaked: secret,
    })
    expect(result.status).toBe(422)
    expect(JSON.stringify(result.body)).not.toContain(secret)
  })
})

describe('retiring a published version', () => {
  it('is permitted, and then refuses a further edit', async () => {
    const retired = await call(adminCookie, 'POST', `/api/v1/assessment/versions/${v1Id}/retire`)
    expect(retired.status).toBe(200)
    expect((retired.body.version as { status: string }).status).toBe('retired')

    const edit = await call(adminCookie, 'PATCH', `/api/v1/assessment/versions/${v1Id}`, {
      op: 'removeItem',
      itemId,
    })
    expect(edit.status).toBe(409)
  })
})

/**
 * The authoring page, **server-rendered**, with JavaScript never running.
 *
 * This exists because three bugs shipped past a fully green suite in #54 and were found by opening
 * a browser. All three were invisible to every other test here, and two of them are only reachable
 * on the SSR path:
 *
 *  1. The selected version never loaded, because the default id was assigned by a `watchEffect`
 *     that the data composable created after it never saw. The page rendered "no versions" while
 *     the selector showed v1.
 *  2. The SSR read of `/api/v1/assessment/versions/{id}` went out unauthenticated: a bare `$fetch`
 *     inside `useAsyncData` does not forward the incoming request's cookies, so it came back 401.
 *  3. The heading resolved by exact route match only, so every nested authoring route read
 *     "Dashboard".
 *
 * Asserting against the raw HTML rather than a hydrated DOM is the point: if the server-side read
 * is unauthenticated or the version never resolves, the item simply is not in the markup, whatever
 * the client would later recover. `resolvePageTitle` is unit-tested separately; this checks it is
 * actually wired.
 */
describe('the authoring page renders its version server-side', () => {
  /**
   * One test, one fetch, every assertion against the same markup.
   *
   * Deliberately not a suite-level `beforeAll`: `nuxtFetch` resolves its base URL through
   * `useTestContext()`, which is not available inside a nested `beforeAll` here — it threw
   * "No context is available" and skipped the whole block, which is a silent pass in disguise.
   */
  it('serves the selected version, its ledger and the right heading with no JS', async () => {
    const response = await nuxtFetch(`/dashboard/assessment/${instrumentId}`, {
      headers: { cookie: adminCookie },
    })
    expect(response.status).toBe(200)
    const html = await response.text()

    // Bugs 1 and 2 both produce a page with no item in it.
    expect(html).toContain('kd01')
    expect(html).not.toContain('Instrumen ini belum punya versi')
    expect(html).not.toContain('Versi terpilih tidak dapat dimuat')
    expect(html).toContain('data-testid="item-ledger"')

    // Bug 3: the nav has no entry for /dashboard/assessment/{id}, only for its parent.
    const heading = html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1]?.trim()
    expect(heading).toBe('Assessment configuration')

    // The gap this suite missed entirely: with no scale, no item can be created at all.
    expect(html).toContain('Skala &amp; dimensi')
  }, 120_000)
})
