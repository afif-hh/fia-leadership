import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

import {
  AccountDisabledError,
  UnauthenticatedError,
  hasRole,
  requireFreshSession,
  requireSession,
  type SessionSource,
} from '../../domain/identity/session.ts'

// A minimal stand-in for the parts of H3Event these helpers touch. Typed rather than `as never`
// so the assertions below can read `event.headers`.
const event = { headers: new Headers() } as unknown as H3Event

const sourceReturning = (value: unknown) => {
  const getSession = vi.fn().mockResolvedValue(value)
  return { source: { api: { getSession } } as SessionSource, getSession }
}

const validSession = {
  session: { id: 'sess-1' },
  user: { id: 'user-1', email: 'a@b.test', roles: 'lab_admin,researcher', status: 'active' },
}

describe('the session contract the policy layer reads', () => {
  it('parses a principal, with roles from the projection', async () => {
    const { source } = sourceReturning(validSession)
    const principal = await requireSession(source, event)

    expect(principal).toEqual({
      userId: 'user-1',
      email: 'a@b.test',
      roles: ['lab_admin', 'researcher'],
      sessionId: 'sess-1',
      status: 'active',
    })
  })

  it('treats an empty projection as no roles, not as one empty role', async () => {
    const { source } = sourceReturning({
      ...validSession,
      user: { ...validSession.user, roles: '' },
    })
    expect((await requireSession(source, event)).roles).toEqual([])
  })

  it('rejects an absent session', async () => {
    const { source } = sourceReturning(null)
    await expect(requireSession(source, event)).rejects.toThrow(UnauthenticatedError)
  })

  it('rejects a session with no user', async () => {
    const { source } = sourceReturning({ session: { id: 'x' }, user: null })
    await expect(requireSession(source, event)).rejects.toThrow(UnauthenticatedError)
  })

  /**
   * FR-023: deactivation changes login status. A disabled account can still hold a valid cookie,
   * so the check has to be here rather than at sign-in only — otherwise an account disabled
   * mid-session keeps working until its cookie expires.
   */
  it('rejects a disabled account even with a valid session', async () => {
    const { source } = sourceReturning({
      ...validSession,
      user: { ...validSession.user, status: 'disabled' },
    })
    await expect(requireSession(source, event)).rejects.toThrow(AccountDisabledError)
  })

  describe('the fresh/cached distinction', () => {
    it('requireSession uses the cookie cache', async () => {
      const { source, getSession } = sourceReturning(validSession)
      await requireSession(source, event)
      expect(getSession).toHaveBeenCalledWith({ headers: event.headers })
    })

    /** Mandatory for every audit-classified action in rbac.md. */
    it('requireFreshSession disables it', async () => {
      const { source, getSession } = sourceReturning(validSession)
      await requireFreshSession(source, event)
      expect(getSession).toHaveBeenCalledWith({
        headers: event.headers,
        query: { disableCookieCache: true },
      })
    })
  })

  it('answers role membership', async () => {
    const { source } = sourceReturning(validSession)
    const principal = await requireSession(source, event)
    expect(hasRole(principal, 'lab_admin')).toBe(true)
    expect(hasRole(principal, 'student')).toBe(false)
  })
})
