import { getQuery } from 'h3'

import { definePolicyHandler } from '../../http/define-policy-handler.ts'
import { createDb } from '../../db/client.ts'
import { listAuditEvents, listAuditEventTypes } from '../../domain/platform/index.ts'

/**
 * Maps to the Audit Log row of rbac.md. A Lab Admin's cell is `R`; a student's is "Own actions",
 * which is `scoped`.
 *
 * A scoped decision authorises the request but cannot restrict the result set, so `scopeToActor`
 * narrows the query here. Omitting it leaks every row with a correct 200.
 *
 * Reading the audit log is deliberately not itself audited (#20).
 *
 * `eventType` narrows to one exact event (FR-011, which asks an admin to be able to see the history
 * of instrument and scoring changes specifically). `eventTypes` comes back alongside the rows so
 * the client's options are computed under the same narrowing as the rows themselves, in one round
 * trip. Sending them separately would make it possible for the two to disagree, and the way they
 * would disagree is by naming kinds of event the caller may not read.
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
    const scopeToActor = decision === 'scoped' ? principal.userId : undefined

    /**
     * Bounded rather than validated, and bounded at 65 rather than 64 on purpose. The column's own
     * CHECK stops at 64, so a value still longer than that after the slice is one no row can carry
     * and it matches nothing — which is the honest answer. Ignoring an over-long value instead
     * would drop the filter and return *more* rows than were asked for, and on an audit log a
     * silently widened result is worse than an empty one.
     */
    const eventType =
      typeof query.eventType === 'string' && query.eventType.length > 0
        ? query.eventType.slice(0, 65)
        : undefined

    const [events, eventTypes] = await Promise.all([
      listAuditEvents(db, { limit: Number(query.limit) || 20, scopeToActor, eventType }),
      listAuditEventTypes(db, { scopeToActor }),
    ])

    return { events, eventTypes }
  },
})
