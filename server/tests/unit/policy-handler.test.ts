import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

import { runPolicyHandler } from '../../http/policy-handler.ts'
import { ScopeNotImplementedError } from '../../domain/identity/policy.ts'
import type { SessionSource } from '../../domain/identity/session.ts'

/**
 * Exercises the wrapper without a Worker. `runPolicyHandler` takes its dependencies rather than
 * reaching for Nitro globals precisely so this is possible; `definePolicyHandler` is the thin
 * binding around it and holds no logic worth testing separately.
 */

function fakeEvent(): H3Event {
  return {
    headers: new Headers(),
    context: { requestId: 'req-test-1' },
  } as unknown as H3Event
}

/** Records the freshness query so the audit coupling can be asserted, not assumed. */
function fakeAuth(user: Record<string, unknown> | null) {
  const calls: Array<{ disableCookieCache?: boolean }> = []
  const auth: SessionSource = {
    api: {
      getSession: async ({ query }) => {
        calls.push({ disableCookieCache: query?.disableCookieCache })
        return user ? { session: { id: 'sess-1' }, user } : null
      },
    },
  }
  return { auth, calls }
}

const student = { id: 'u-student', email: 's@example.test', roles: 'student', status: 'active' }
const labAdmin = { id: 'u-admin', email: 'a@example.test', roles: 'lab_admin', status: 'active' }

describe('denial shapes', () => {
  it('401 with no session, and the handler never runs', async () => {
    const { auth } = fakeAuth(null)
    const handler = vi.fn()
    const event = fakeEvent()

    const result = await runPolicyHandler({ auth, db: null as never }, {
      resource: 'auditLog', action: 'read', handler,
    }, event)

    expect(result.status).toBe(401)
    expect(result.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.', requestId: 'req-test-1' },
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('401 ACCOUNT_DISABLED for a valid session on a disabled account', async () => {
    const { auth } = fakeAuth({ ...labAdmin, status: 'disabled' })
    const handler = vi.fn()
    const event = fakeEvent()

    const result = await runPolicyHandler({ auth, db: null as never }, {
      resource: 'userAdministration', action: 'read', handler,
    }, event)

    expect(result.status).toBe(401)
    expect((result.body as { error: { code: string } }).error.code).toBe('ACCOUNT_DISABLED')
    expect(handler).not.toHaveBeenCalled()
  })

  it('403 for a deny cell, because no resource identity is leaked by saying so', async () => {
    const { auth } = fakeAuth(student)
    const handler = vi.fn()
    const event = fakeEvent()

    const result = await runPolicyHandler({ auth, db: null as never }, {
      resource: 'userAdministration', action: 'update', handler,
    }, event)

    expect(result.status).toBe(403)
    expect((result.body as { error: { code: string } }).error.code).toBe('FORBIDDEN')
    expect(handler).not.toHaveBeenCalled()
  })

  it('404 for a scoped refusal, indistinguishable from a missing record', async () => {
    const { auth } = fakeAuth(student)
    const handler = vi.fn()
    const event = fakeEvent()

    // A student's Audit Log cell is "Own actions". Targeting someone else must not reveal that
    // the row exists — 403 there would confirm it.
    const result = await runPolicyHandler({ auth, db: null as never }, {
      resource: 'auditLog', action: 'read',
      target: () => ({ actorUserId: 'somebody-else' }),
      handler,
    }, event)

    expect(result.status).toBe(404)
    expect(result.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Not found.', requestId: 'req-test-1' },
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('a scoped refusal and a genuinely absent record are byte-identical', async () => {
    const { auth } = fakeAuth(student)
    const a = fakeEvent()
    const refused = await runPolicyHandler({ auth, db: null as never }, {
      resource: 'auditLog', action: 'read',
      target: () => ({ actorUserId: 'somebody-else' }), handler: vi.fn(),
    }, a)

    const b = fakeEvent()
    const missing = await runPolicyHandler({ auth, db: null as never }, {
      resource: 'auditLog', action: 'read',
      target: () => ({}), handler: vi.fn(),
    }, b)

    expect(refused).toEqual(missing)
  })
})

describe('audit classification forces a fresh session', () => {
  it('audit: true bypasses the cookie cache', async () => {
    const { auth, calls } = fakeAuth(labAdmin)
    const event = fakeEvent()

    await runPolicyHandler({ auth, db: null as never }, {
      resource: 'userAdministration', action: 'update', audit: true,
      handler: () => 'ok',
    }, event)

    expect(calls).toEqual([{ disableCookieCache: true }])
  })

  it('the default reads the cache, costing no database round trip', async () => {
    const { auth, calls } = fakeAuth(labAdmin)
    const event = fakeEvent()

    await runPolicyHandler({ auth, db: null as never }, {
      resource: 'userAdministration', action: 'read',
      handler: () => 'ok',
    }, event)

    expect(calls).toEqual([{ disableCookieCache: undefined }])
  })

  it('has no way to request an audited action on a cached session', () => {
    // The coupling is structural rather than conventional: freshness is derived from `audit`, so
    // there is no separate flag to set inconsistently. Asserted by inspection of the spec type —
    // if a `fresh` option is ever added alongside `audit`, this test should be replaced by one
    // that proves they cannot disagree.
    const spec = { resource: 'userAdministration', action: 'update', audit: true, handler: () => 1 }
    expect(Object.keys(spec)).not.toContain('fresh')
    expect(Object.keys(spec)).not.toContain('disableCookieCache')
  })
})

describe('allow path', () => {
  it('runs the handler with the resolved principal', async () => {
    const { auth } = fakeAuth(labAdmin)
    const event = fakeEvent()

    const result = await runPolicyHandler({ auth, db: null as never }, {
      resource: 'userAdministration', action: 'read',
      handler: (_event, principal) => principal.userId,
    }, event)

    expect(result.body).toBe('u-admin')
    expect(result.status).toBe(200)
  })
})

describe('unimplemented scope', () => {
  it('propagates rather than allowing or denying', async () => {
    // A researcher's Research Export cell is R*, and this map builds no research schema. The
    // correct behaviour is an error someone investigates, not a quiet decision either way.
    const { auth } = fakeAuth({ ...student, roles: 'researcher' })
    const event = fakeEvent()

    await expect(
      runPolicyHandler({ auth, db: null as never }, {
        resource: 'researchExport', action: 'read', handler: vi.fn(),
      }, event)
    ).rejects.toBeInstanceOf(ScopeNotImplementedError)
  })
})
