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
import type { Db, Domain } from '../db/client.ts'
import { mapDomainError } from './domain-errors.ts'

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
   * Which domain handle `ctx.db` should be. A **seam, not a credential selector** — see the note
   * in `server/db/client.ts`; no route may assume it is privilege-restricted. Defaults to
   * `identity` for the routes written before `ctx.db` existed.
   */
  domain?: Domain
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
  /**
   * The same handle `runPolicyHandler` already resolved for the scope predicates.
   *
   * Handed to the handler so a route body needs neither `useRuntimeConfig()` nor its own
   * `createDb()` — which is what previously made a route file unloadable outside the Nitro
   * runtime and forced `scoped-narrowing.test.ts` to *reproduce* handler bodies rather than call
   * them. A reproduced body can drift from the real one silently, so removing the need for one is
   * a correctness control, not a tidy-up. Routes predating this still build their own handle;
   * that keeps working and is simply the older way.
   */
  db: Db
}

export interface PolicyDeps {
  auth: SessionSource
  db: Db
}

/** The error envelope from `docs/architecture/api-design.md`. Not extended, not varied. */
export interface ErrorEnvelope {
  error: {
    code: string
    message: string
    requestId: string
    /** Required for 422 and only 422, per api-design.md. */
    fields?: { path: string; code: string }[]
  }
}

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422

export type PolicyResult<T> =
  { status: 200; body: T } | { status: ErrorStatus; body: ErrorEnvelope }

function errorResult(
  status: ErrorStatus,
  code: string,
  message: string,
  requestId: string,
  fields?: { path: string; code: string }[]
): { status: ErrorStatus; body: ErrorEnvelope } {
  return {
    status,
    body: { error: { code, message, requestId, ...(fields === undefined ? {} : { fields }) } },
  }
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

  try {
    return {
      status: 200,
      body: await spec.handler(event, principal, { decision, target, db: deps.db }),
    }
  } catch (error) {
    // A recognised domain failure becomes its documented status. Anything else is rethrown
    // deliberately: an unmapped error is a bug, and turning it into a tidy 4xx here would hide it.
    const mapped = mapDomainError(error)
    if (!mapped) throw error
    return errorResult(mapped.status, mapped.code, mapped.message, requestId, mapped.fields)
  }
}

export { ScopeNotImplementedError }
