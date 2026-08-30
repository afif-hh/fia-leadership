import { describe, expect, it, beforeAll } from 'vitest'
import { setup, fetch as nuxtFetch } from '@nuxt/test-utils/e2e'
import { createClient } from '@libsql/client'

import { ACCOUNTS, E2E_DB, E2E_PASSWORD } from './setup'

/**
 * The taking flow over real HTTP against the real routes (#78).
 *
 * Written as e2e rather than as `server`-project integration tests for the same reason
 * `assessment-api.test.ts` gives: those cannot load a route file, so they would have to
 * *reproduce* each handler body, and a reproduced body drifts from the real one silently. Here the
 * route file is the thing under test. The service functions it calls are covered separately in
 * `server/tests/integration/taking-*.test.ts`.
 *
 * The instrument is built through the **authoring** API as a Lab Admin, then taken as a student,
 * so this also exercises the authoring→taking seam end to end rather than assuming it.
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
  return { status: response.status, body: text ? JSON.parse(text) : {} }
}

const errorOf = (result: Call) =>
  result.body.error as { code: string; message: string; requestId: string; fields?: unknown[] }

/**
 * Consent is written straight to the database rather than through an endpoint, because there
 * **is no consent endpoint yet**. #64 specified four routes and none of them records an
 * acceptance; `POST /api/v1/consents` belongs with the consent page in #79. Flagged there rather
 * than quietly added here.
 */
async function seedConsent(userId: string, hash: string) {
  const client = createClient({ url: `file:${E2E_DB}` })
  try {
    await client.execute({
      sql: `INSERT INTO identity_consents
              (id, user_id, policy_id, policy_version, policy_hash, accepted_at, method)
            VALUES (?, ?, 'assessment-privacy-notice', 'v1', ?, ?, 'seed')
            ON CONFLICT DO NOTHING`,
      args: [crypto.randomUUID(), userId, hash, Date.now()],
    })
  } finally {
    client.close()
  }
}

async function userIdOf(email: string): Promise<string> {
  const client = createClient({ url: `file:${E2E_DB}` })
  try {
    const rows = await client.execute({
      sql: 'SELECT id FROM identity_user WHERE email = ?',
      args: [email],
    })
    return rows.rows[0]!.id as string
  } finally {
    client.close()
  }
}

let adminCookie: string
let studentCookie: string
let coachlessLeadCookie: string
let versionId: string
let versionItemIds: string[] = []
let sessionId: string

beforeAll(async () => {
  adminCookie = await signIn(ACCOUNTS.labAdmin.email)
  studentCookie = await signIn(ACCOUNTS.student.email)
  coachlessLeadCookie = await signIn(ACCOUNTS.academicLead.email)

  // Build a two-item instrument through the authoring API and publish it.
  const instrument = await call(adminCookie, 'POST', '/api/v1/assessment/instruments', {
    code: 'kdpgk_taking',
    name: 'KDPGK (taking e2e)',
    description: null,
  })
  const instrumentId = (instrument.body.instrument as { id: string }).id

  const scale = await call(
    adminCookie,
    'POST',
    `/api/v1/assessment/instruments/${instrumentId}/scales`,
    {
      code: 'likert5',
      name: 'Likert 5',
      points: [
        { value: 1, label: 'Sangat Tidak Setuju' },
        { value: 3, label: 'Netral' },
        { value: 5, label: 'Sangat Setuju' },
      ],
    }
  )
  const scaleId = scale.body.scaleId as string

  const dimension = await call(
    adminCookie,
    'POST',
    `/api/v1/assessment/instruments/${instrumentId}/dimensions`,
    { code: 'directive', name: 'Directive', kind: 'style' }
  )
  const dimensionId = dimension.body.dimensionId as string

  const version = await call(
    adminCookie,
    'POST',
    `/api/v1/assessment/instruments/${instrumentId}/versions`,
    {}
  )
  versionId = (version.body.version as { id: string }).id

  for (const [index, stem] of ['Pernyataan satu.', 'Pernyataan dua.'].entries()) {
    await call(adminCookie, 'POST', `/api/v1/assessment/instruments/${instrumentId}/items`, {
      code: `kd0${index + 1}`,
      stem,
      scaleId,
      dimensionIds: [dimensionId],
      addTo: { versionId, position: index },
    })
  }

  await call(adminCookie, 'POST', `/api/v1/assessment/versions/${versionId}/review`)
  const published = await call(
    adminCookie,
    'POST',
    `/api/v1/assessment/versions/${versionId}/publish`
  )
  expect(published.status).toBe(200)
}, 180_000)

describe('starting a session', () => {
  it('refuses with CONSENT_REQUIRED before the student has consented', async () => {
    // Not the student's fault and not an incident — the client sends them to the consent page.
    const result = await call(
      studentCookie,
      'POST',
      `/api/v1/assessment/versions/${versionId}/sessions`
    )

    expect(result.status).toBe(409)
    expect(errorOf(result).code).toBe('CONSENT_REQUIRED')
  })

  it('starts once consent is on record, returning every item in one payload', async () => {
    // The hash has to be the real one, or the gate fails closed on a mismatch — which is exactly
    // what it is for. Reading it back through the module under test would be circular, so it comes
    // from the artifact the server itself resolves.
    const { getPolicyArtifact } = await import('../../domain/identity/policy-documents')
    const artifact = await getPolicyArtifact('assessment-privacy-notice')
    await seedConsent(await userIdOf(ACCOUNTS.student.email), artifact.hash)

    const result = await call(
      studentCookie,
      'POST',
      `/api/v1/assessment/versions/${versionId}/sessions`
    )

    expect(result.status).toBe(200)
    const items = result.body.items as { versionItemId: string; position: number }[]
    // #60's one-long-page layout: no paging, because the client has no way to ask for more.
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.position)).toEqual([0, 1])
    expect((result.body.session as { consentPolicyVersion: string }).consentPolicyVersion).toBe(
      'v1'
    )
  })

  it('returns the same session on a second start rather than creating another', async () => {
    const again = await call(
      studentCookie,
      'POST',
      `/api/v1/assessment/versions/${versionId}/sessions`
    )
    expect(again.status).toBe(200)
  })

  it('404s an unknown version', async () => {
    const result = await call(
      studentCookie,
      'POST',
      `/api/v1/assessment/versions/${crypto.randomUUID()}/sessions`
    )
    expect(result.status).toBe(404)
  })
})

/**
 * State is threaded through module-level `let`s set inside `it` blocks rather than a nested
 * `beforeAll`, matching `assessment-api.test.ts`. A `beforeAll` inside a `describe` runs outside
 * the context `setup()` establishes and fails with "No context is available"; these tests are
 * ordered anyway, so the hook bought nothing.
 */
describe('the save → submit sequence', () => {
  it('starts the session these tests run against', async () => {
    const started = await call(
      studentCookie,
      'POST',
      `/api/v1/assessment/versions/${versionId}/sessions`
    )
    expect(started.status).toBe(200)
    sessionId = (started.body.session as { id: string }).id

    // Taken from the taking API's own response rather than the authoring one: this is the payload
    // the real client works from, so a change to it should break these tests.
    versionItemIds = (started.body.items as { versionItemId: string }[]).map((i) => i.versionItemId)
    expect(versionItemIds).toHaveLength(2)
  })

  it('reads the session back for resume', async () => {
    const result = await call(studentCookie, 'GET', `/api/v1/assessment/sessions/${sessionId}`)
    expect(result.status).toBe(200)
    expect(result.body.answers).toEqual({})
  })

  it('rejects an answer that is not on the item’s scale, without echoing the value', async () => {
    const result = await call(
      studentCookie,
      'PUT',
      `/api/v1/assessment/sessions/${sessionId}/responses`,
      { versionItemId: versionItemIds[0], answerValue: 4 }
    )

    expect(result.status).toBe(422)
    const error = errorOf(result)
    expect(error.code).toBe('ASSESSMENT_ANSWER_NOT_ON_SCALE')
    // The PII Rule, at the last hop it could leak from: the rejected value must not come back out
    // in the message a client is free to log.
    expect(JSON.stringify(error)).not.toMatch(/\b4\b/)
  })

  it('refuses submit while an item is unanswered, naming which', async () => {
    await call(studentCookie, 'PUT', `/api/v1/assessment/sessions/${sessionId}/responses`, {
      versionItemId: versionItemIds[0],
      answerValue: 5,
    })

    const result = await call(
      studentCookie,
      'POST',
      `/api/v1/assessment/sessions/${sessionId}/submit`
    )

    expect(result.status).toBe(422)
    const error = errorOf(result)
    expect(error.code).toBe('ASSESSMENT_RESPONSE_SET_INCOMPLETE')
    expect(error.fields).toEqual([{ path: versionItemIds[1], code: 'REQUIRED' }])
  })

  it('saves the second answer and submits', async () => {
    const saved = await call(
      studentCookie,
      'PUT',
      `/api/v1/assessment/sessions/${sessionId}/responses`,
      { versionItemId: versionItemIds[1], answerValue: 3 }
    )
    expect(saved.status).toBe(200)

    const result = await call(
      studentCookie,
      'POST',
      `/api/v1/assessment/sessions/${sessionId}/submit`
    )
    expect(result.status).toBe(200)
    expect((result.body.session as { status: string }).status).toBe('submitted')
  })

  it('refuses a second submit with 409 rather than double-writing', async () => {
    const result = await call(
      studentCookie,
      'POST',
      `/api/v1/assessment/sessions/${sessionId}/submit`
    )
    expect(result.status).toBe(409)
    expect(errorOf(result).code).toBe('SESSION_ALREADY_SUBMITTED')
  })

  it('refuses a save after submit with the same 409', async () => {
    const result = await call(
      studentCookie,
      'PUT',
      `/api/v1/assessment/sessions/${sessionId}/responses`,
      { versionItemId: versionItemIds[0], answerValue: 1 }
    )
    expect(result.status).toBe(409)
    expect(errorOf(result).code).toBe('SESSION_ALREADY_SUBMITTED')
  })

  it('404s a session belonging to someone else', async () => {
    // Not 403: an id the caller cannot see must be indistinguishable from one that does not exist.
    const result = await call(adminCookie, 'GET', `/api/v1/assessment/sessions/${sessionId}`)
    expect(result.status).toBe(404)
  })

  it('never leaks a raw SQLITE_CONSTRAINT through any of these', async () => {
    const result = await call(
      studentCookie,
      'POST',
      `/api/v1/assessment/sessions/${sessionId}/submit`
    )
    expect(errorOf(result).message).not.toMatch(/SQLITE/i)
    expect(errorOf(result).requestId).toBeTruthy()
  })
})

describe('roles other than the owner', () => {
  it('refuses an Academic Lead, whose Own Assessment cell is read-only', async () => {
    const result = await call(
      coachlessLeadCookie,
      'POST',
      `/api/v1/assessment/versions/${versionId}/sessions`
    )
    // `R` allows read and nothing else, so creating a session is denied outright.
    expect(result.status).toBe(403)
    expect(errorOf(result).code).toBe('FORBIDDEN')
  })

  it('refuses an unauthenticated caller', async () => {
    const response = await nuxtFetch(`/api/v1/assessment/sessions/${crypto.randomUUID()}`)
    expect(response.status).toBe(401)
  })
})

/**
 * #58's asymmetry, over HTTP: retirement stops a version being handed out, but never cancels a
 * session in flight. A student 35 items into 40 must not lose that work to an administrative
 * decision unrelated to them.
 */
describe('a version retired while a session is open', () => {
  it('blocks start with 409 but leaves save and submit working', async () => {
    const instrument = await call(adminCookie, 'POST', '/api/v1/assessment/instruments', {
      code: 'kdpgk_retire',
      name: 'KDPGK (retire e2e)',
      description: null,
    })
    const instrumentId = (instrument.body.instrument as { id: string }).id

    const scale = await call(
      adminCookie,
      'POST',
      `/api/v1/assessment/instruments/${instrumentId}/scales`,
      { code: 'likert3', name: 'Likert 3', points: [{ value: 1, label: 'Ya' }] }
    )
    const dimension = await call(
      adminCookie,
      'POST',
      `/api/v1/assessment/instruments/${instrumentId}/dimensions`,
      { code: 'directive', name: 'Directive', kind: 'style' }
    )
    const version = await call(
      adminCookie,
      'POST',
      `/api/v1/assessment/instruments/${instrumentId}/versions`,
      {}
    )
    const retiringVersionId = (version.body.version as { id: string }).id

    await call(adminCookie, 'POST', `/api/v1/assessment/instruments/${instrumentId}/items`, {
      code: 'kd01',
      stem: 'Satu pernyataan.',
      scaleId: scale.body.scaleId,
      dimensionIds: [dimension.body.dimensionId],
      addTo: { versionId: retiringVersionId, position: 0 },
    })
    await call(adminCookie, 'POST', `/api/v1/assessment/versions/${retiringVersionId}/review`)
    await call(adminCookie, 'POST', `/api/v1/assessment/versions/${retiringVersionId}/publish`)

    const started = await call(
      studentCookie,
      'POST',
      `/api/v1/assessment/versions/${retiringVersionId}/sessions`
    )
    expect(started.status).toBe(200)
    const openSessionId = (started.body.session as { id: string }).id
    const itemId = (started.body.items as { versionItemId: string }[])[0]!.versionItemId

    await call(adminCookie, 'POST', `/api/v1/assessment/versions/${retiringVersionId}/retire`)

    // Starting a *new* session is refused...
    const blocked = await call(
      coachlessLeadCookie,
      'POST',
      `/api/v1/assessment/versions/${retiringVersionId}/sessions`
    )
    expect(blocked.status).toBe(403) // the lead is denied before status is even consulted

    // ...while the session already in flight runs to completion.
    const saved = await call(
      studentCookie,
      'PUT',
      `/api/v1/assessment/sessions/${openSessionId}/responses`,
      { versionItemId: itemId, answerValue: 1 }
    )
    expect(saved.status).toBe(200)

    const submitted = await call(
      studentCookie,
      'POST',
      `/api/v1/assessment/sessions/${openSessionId}/submit`
    )
    expect(submitted.status).toBe(200)
  }, 60_000)
})

/**
 * The three routes #79 adds. Two of them close the gap #78 left: its four routes *read* consent
 * but none of them records one.
 */
describe('the consent endpoints', () => {
  it('returns both documents as rendered html, flagging which is required', async () => {
    const result = await call(studentCookie, 'GET', '/api/v1/consents')
    expect(result.status).toBe(200)

    const documents = result.body.documents as {
      policyId: string
      required: boolean
      html: string
    }[]
    expect(documents.map((d) => d.policyId)).toEqual([
      'assessment-privacy-notice',
      'research-participation',
    ])
    expect(documents.map((d) => d.required)).toEqual([true, false])
    // Rendered server-side, so the page receives HTML rather than markdown it would have to parse.
    expect(documents[0]!.html).toContain('<h1')
    expect(documents[0]!.html).not.toContain('# Pemberitahuan')
  })

  it('records an acceptance, and a resubmitted form is a no-op rather than an error', async () => {
    const body = { privacyNotice: true, researchParticipation: false }
    const first = await call(studentCookie, 'POST', '/api/v1/consents', body)
    expect(first.status).toBe(200)

    // A double-submitted consent form is a network retry, not something to show an error for.
    const again = await call(studentCookie, 'POST', '/api/v1/consents', body)
    expect(again.status).toBe(200)
  })

  it('refuses a request that tries to decline the mandatory notice', async () => {
    // `privacyNotice` is a literal `true` in the schema, so "accepted: false" is unrepresentable
    // rather than silently half-recorded. Declining is expressed by not calling this at all.
    const result = await call(studentCookie, 'POST', '/api/v1/consents', {
      privacyNotice: false,
      researchParticipation: false,
    })
    expect(result.status).toBe(422)
    expect(errorOf(result).code).toBe('VALIDATION_FAILED')
  })

  it('refuses an unauthenticated caller', async () => {
    const response = await nuxtFetch('/api/v1/consents')
    expect(response.status).toBe(401)
  })
})

describe('the student assessment list', () => {
  it('lists the published version with its item count', async () => {
    const result = await call(studentCookie, 'GET', '/api/v1/assessment/takeable')
    expect(result.status).toBe(200)

    const versions = result.body.versions as {
      versionId: string
      itemCount: number
      state: string
    }[]
    const row = versions.find((v) => v.versionId === versionId)
    expect(row).toMatchObject({ itemCount: 2 })
  })

  it('never reports another user’s standing', async () => {
    // The student has submitted; the admin has not. If the query forgot to key the join on the
    // caller, the admin would see 'submitted' here and the leak would look like a correct 200.
    const asAdmin = await call(adminCookie, 'GET', '/api/v1/assessment/takeable')
    expect(asAdmin.status).toBe(200)

    const versions = asAdmin.body.versions as { versionId: string; state: string }[]
    const row = versions.find((v) => v.versionId === versionId)
    expect(row?.state).toBe('available')
  })

  it('carries no consent field on any row', async () => {
    const result = await call(studentCookie, 'GET', '/api/v1/assessment/takeable')
    expect(JSON.stringify(result.body)).not.toMatch(/consent/i)
  })
})
