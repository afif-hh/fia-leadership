import type { H3Event } from 'h3'

import {
  ScopeNotImplementedError,
  authorize,
  resolveScope,
  type Action,
  type Resource,
} from '../domain/identity/policy.ts'
import {
  AccountDisabledError,
  UnauthenticatedError,
  requireFreshSession,
  requireSession,
  type AuthPrincipal,
  type SessionSource,
} from '../domain/identity/session.ts'
import type { Db } from '../db/client.ts'

/**
 * The policy gate every route under `server/api/v1/**` is BUILT FROM, rather than guarded by a
 * call inside it (issue #20).
 *
 * The difference is where an omission is caught. An explicit `authorize()` at the top of a handler
 * is plainer code, but forgetting it compiles, passes its tests, and ships open. Here `resource`
 * and `action` are required by the type, so a handler with no authorization decision does not
 * compile — the check moves from review to the compiler.
 *
 * It is also the single place that derives session freshness from audit classification and shapes
 * the denial: two things that would otherwise be repeated per handler and wrong in one of them.
 *
 * What this does NOT prevent is a deliberately hand-written `defineEventHandler` under
 * `server/api/v1/**`. That still compiles. `policy.test.ts` greps for it, and that grep is the
 * only control — the deny-by-default backstop middleware was offered and declined (issue #20).
 *
 * This module imports nothing from h3 at runtime, only its event type. That keeps the whole
 * decision path testable under plain Node, and it is why the result carries its own status rather
 * than writing one onto the event: applying it is the framework binding's job, next door.
 */

export interface PolicySpec<T> {
  resource: Resource
  action: Action
  /**
   * Marks the action as audit-classified per `docs/security/rbac.md`.
   *
   * Setting it forces `requireFreshSession`, so it is impossible to audit-classify an action while
   * reading roles from the ≤60s-stale cookie cache. That coupling is why this is one flag and not
   * two independent options that could disagree.
   */
  audit?: boolean
  /**
   * Identifies the row a scoped cell is about. A scoped decision with no target reaches the
   * predicate as an empty object, and every predicate refuses rather than guessing.
   */
  target?: (event: H3Event) => Readonly<Record<string, unknown>>
  handler: (event: H3Event, principal: AuthPrincipal) => T | Promise<T>
}

export interface PolicyDeps {
  auth: SessionSource
  db: Db
}

/** The error envelope from `docs/architecture/api-design.md`. Not extended, not varied. */
export interface ErrorEnvelope {
  error: { code: string; message: string; requestId: string }
}

export type PolicyResult<T> =
  | { status: 200; body: T }
  | { status: 401 | 403 | 404; body: ErrorEnvelope }

function errorResult(
  status: 401 | 403 | 404,
  code: string,
  message: string,
  requestId: string
): { status: 401 | 403 | 404; body: ErrorEnvelope } {
  return { status, body: { error: { code, message, requestId } } }
}

function requestIdOf(event: H3Event): string {
  const fromContext = (event.context as Record<string, unknown> | undefined)?.requestId
  return typeof fromContext === 'string' ? fromContext : crypto.randomUUID()
}

export async function runPolicyHandler<T>(
  deps: PolicyDeps,
  spec: PolicySpec<T>,
  event: H3Event
): Promise<PolicyResult<T>> {
  const requestId = requestIdOf(event)

  let principal: AuthPrincipal
  try {
    principal = spec.audit
      ? await requireFreshSession(deps.auth, event)
      : await requireSession(deps.auth, event)
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return errorResult(401, 'UNAUTHENTICATED', 'Authentication is required.', requestId)
    }
    if (error instanceof AccountDisabledError) {
      // 401 rather than 403: FR-023 makes deactivation a change to login status, so the useful
      // signal is "your session is no longer good", which drives a client to sign out rather than
      // retry. Re-authenticating will fail at sign-in, as intended.
      return errorResult(401, 'ACCOUNT_DISABLED', 'This account is disabled.', requestId)
    }
    throw error
  }

  const decision = authorize(principal.roles, spec.resource, spec.action)

  if (decision === 'deny') {
    // A deny cell refuses a role an entire capability. No specific row is identified, so there is
    // no existence to leak and 403 is both safe and more informative than 404.
    return errorResult(403, 'FORBIDDEN', 'You do not have access to this resource.', requestId)
  }

  if (decision === 'scoped') {
    // A ScopeNotImplementedError propagates deliberately: an unreachable resource becoming
    // reachable must surface as an error someone investigates, never as a quiet allow or deny.
    const permitted = await resolveScope(spec.resource, {
      db: deps.db,
      principal,
      target: spec.target?.(event) ?? {},
    })

    if (!permitted) {
      // 404, not 403. A scoped refusal concerns one identified row, and 403 would confirm that row
      // exists — the enumeration api-design.md warns against. Being indistinguishable from a
      // genuinely absent record is the point, and a test asserts the two responses are identical.
      return errorResult(404, 'NOT_FOUND', 'Not found.', requestId)
    }
  }

  return { status: 200, body: await spec.handler(event, principal) }
}

export { ScopeNotImplementedError }
