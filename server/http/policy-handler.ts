import type { H3Event } from 'h3'

import {
  ScopeNotImplementedError,
  authorize,
  resolveScope,
  type Action,
  type Decision,
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
 * The policy gate every route under `server/api/v1/**` is built from, rather than guarded by a
 * call inside it (issue #20). `resource` and `action` are required by the type, so a handler with
 * no authorization decision does not compile — the check moves from review to the compiler.
 *
 * It does not prevent a hand-written `defineEventHandler` under v1; `policy.test.ts` greps for
 * that, and the grep is the only control (the backstop middleware was declined in #20).
 *
 * Imports no framework runtime, only h3's event type, so the decision path is testable under plain
 * Node — which is also why the result carries its own status instead of writing one onto the event.
 */

export interface PolicySpec<T> {
  resource: Resource
  action: Action
  /**
   * Audit-classified per rbac.md. Forces `requireFreshSession`, so an audited action can never read
   * roles from the ≤60s-stale cookie cache. One flag, not two that could disagree.
   */
  audit?: boolean
  /** Identifies the row a scoped cell is about. No target reaches the predicate as `{}`, and every
   * predicate refuses rather than guessing. */
  target?: (event: H3Event) => Readonly<Record<string, unknown>>
  handler: (event: H3Event, principal: AuthPrincipal, ctx: PolicyContext) => T | Promise<T>
}

/**
 * A `scoped` decision authorises the request, not the whole table: the predicate answers "may you
 * look?", never "here is what you may look at". Handlers therefore receive the decision and must
 * narrow their own query. Omitting that leaked every audit row to a student once, with a correct
 * 200 throughout — `scoped-narrowing.test.ts` asserts the rows, not the status.
 */
export interface PolicyContext {
  decision: Decision
  target: Readonly<Record<string, unknown>>
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
      // 401 not 403: FR-023 makes deactivation a change to login status, so the client should sign
      // out rather than retry.
      return errorResult(401, 'ACCOUNT_DISABLED', 'This account is disabled.', requestId)
    }
    throw error
  }

  const decision = authorize(principal.roles, spec.resource, spec.action)
  const target = spec.target?.(event) ?? {}

  if (decision === 'deny') {
    // No specific row is identified, so nothing leaks by refusing outright.
    return errorResult(403, 'FORBIDDEN', 'You do not have access to this resource.', requestId)
  }

  if (decision === 'scoped') {
    // ScopeNotImplementedError propagates: an unreachable resource becoming reachable must be
    // investigated, not quietly allowed or denied.
    const permitted = await resolveScope(spec.resource, { db: deps.db, principal, target })

    if (!permitted) {
      // 404 not 403: a scoped refusal concerns one identified row, and 403 would confirm it exists.
      return errorResult(404, 'NOT_FOUND', 'Not found.', requestId)
    }
  }

  return { status: 200, body: await spec.handler(event, principal, { decision, target }) }
}

export { ScopeNotImplementedError }
