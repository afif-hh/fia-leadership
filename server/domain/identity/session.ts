import type { H3Event } from 'h3'

import { parseProjection } from './roles.ts'
import type { RoleCode, UserStatus } from '../../db/schema/identity.ts'

/**
 * The contract the RBAC policy layer reads on every authorization check.
 *
 * Two functions, deliberately distinct, because the difference is a security property rather than a
 * performance tweak (issue #19):
 *
 *   requireSession       — cookie cache, ~60s staleness, ZERO database reads
 *   requireFreshSession  — bypasses the cache, one database read
 *
 * `requireFreshSession` is **mandatory** for every action in docs/security/rbac.md's Audit
 * Classification list and every `Approve` cell. Using `requireSession` there would mean an
 * authorization decision made on data up to a minute stale, on exactly the actions where that
 * matters most.
 */

export interface AuthPrincipal {
  userId: string
  email: string
  roles: RoleCode[]
  sessionId: string
  status: UserStatus
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not authenticated')
    this.name = 'UnauthenticatedError'
  }
}

export class AccountDisabledError extends Error {
  // See the note in roles.ts: parameter properties are unsupported by Node's strip-only mode.
  readonly userId: string

  constructor(userId: string) {
    super('Account is disabled')
    this.name = 'AccountDisabledError'
    this.userId = userId
  }
}

/** The shape this module needs from better-auth, named so it can be tested without a Worker. */
export interface SessionSource {
  api: {
    getSession: (args: {
      headers: Headers
      query?: { disableCookieCache?: boolean }
    }) => Promise<unknown>
  }
}

interface RawSession {
  session?: { id?: unknown } | null
  user?: { id?: unknown; email?: unknown; roles?: unknown; status?: unknown } | null
}

function toPrincipal(raw: unknown): AuthPrincipal {
  const value = raw as RawSession | null

  const sessionId = value?.session?.id
  const user = value?.user
  if (typeof sessionId !== 'string' || !user || typeof user.id !== 'string') {
    throw new UnauthenticatedError()
  }

  const status = (typeof user.status === 'string' ? user.status : 'active') as UserStatus

  // FR-023: a disabled account can still hold a valid session cookie. Deactivation changes login
  // status, so the check belongs here rather than at sign-in only — otherwise an account disabled
  // mid-session keeps working until its cookie expires.
  if (status === 'disabled') {
    throw new AccountDisabledError(user.id)
  }

  return {
    userId: user.id,
    email: typeof user.email === 'string' ? user.email : '',
    roles: typeof user.roles === 'string' ? parseProjection(user.roles) : [],
    sessionId,
    status,
  }
}

/**
 * The hot path. Reads the cookie cache, so it costs no database round trip — which is the whole
 * reason `roles` is a projection on the user row rather than a join.
 */
export async function requireSession(auth: SessionSource, event: H3Event): Promise<AuthPrincipal> {
  return toPrincipal(await auth.api.getSession({ headers: event.headers }))
}

/**
 * Mandatory for audit-classified actions and every `Approve` cell in rbac.md. Costs one read.
 */
export async function requireFreshSession(
  auth: SessionSource,
  event: H3Event
): Promise<AuthPrincipal> {
  return toPrincipal(
    await auth.api.getSession({ headers: event.headers, query: { disableCookieCache: true } })
  )
}

/**
 * `R*` decisions cannot be answered from a session at all — they need `identity_user_roles` plus
 * assignment or cohort data through the identity service. Exported as a reminder at the type level
 * so the policy layer does not pretend otherwise.
 */
export function hasRole(principal: AuthPrincipal, role: RoleCode): boolean {
  return principal.roles.includes(role)
}
