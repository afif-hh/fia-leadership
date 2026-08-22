import { getQuery } from 'h3'

import { definePolicyHandler } from '../../http/define-policy-handler.ts'
import { createDb } from '../../db/client.ts'
import { listAuditEvents } from '../../domain/platform/index.ts'

/**
 * The audit log. Maps to the **Audit Log** row of `docs/security/rbac.md`.
 *
 * A Lab Admin's cell is a plain `R`, so the matrix answers outright. A student's is "Own actions",
 * which is `scoped` — the predicate in `policy.ts` requires `actorUserId` to equal their own id and
 * refuses rather than guessing when no target is given.
 *
 * **A scoped decision narrows the query.** The predicate authorises the request; it does not and
 * cannot restrict the result set, so `scopeToActor` is passed here. The first version of this file
 * omitted it and returned every row to a student entitled only to their own, with a correct 200 the
 * whole time. Issue #20 had predicted it — CASL was declined partly because `accessibleBy()` has no
 * Drizzle adapter and every `R*` row needs a hand-written WHERE clause regardless.
 *
 * Reading the audit log is deliberately **not** itself audited (issue #20). The consequence was
 * recorded there: the one role able to read everyone's history leaves no trace of having done so.
 */
export default definePolicyHandler({
  resource: 'auditLog',
  action: 'read',
  target: (event) => {
    const query = getQuery(event)
    return {
      actorUserId: typeof query.actorUserId === 'string' ? query.actorUserId : undefined,
      id: typeof query.id === 'string' ? query.id : undefined,
    }
  },
  handler: async (event, principal, { decision }) => {
    const config = useRuntimeConfig(event)
    const db = createDb(
      {
        TURSO_DATABASE_URL: config.tursoDatabaseUrl,
        TURSO_AUTH_TOKEN: config.tursoAuthToken,
      },
      'platform'
    )

    const query = getQuery(event)

    return {
      events: await listAuditEvents(db, {
        limit: Number(query.limit) || 20,
        scopeToActor: decision === 'scoped' ? principal.userId : undefined,
      }),
    }
  },
})
