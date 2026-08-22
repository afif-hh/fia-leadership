import { getQuery } from 'h3'

import { definePolicyHandler } from '../../http/define-policy-handler.ts'
import { createDb } from '../../db/client.ts'
import { listAuditEvents } from '../../domain/platform/index.ts'

/**
 * Maps to the Audit Log row of rbac.md. A Lab Admin's cell is `R`; a student's is "Own actions",
 * which is `scoped`.
 *
 * A scoped decision authorises the request but cannot restrict the result set, so `scopeToActor`
 * narrows the query here. Omitting it leaks every row with a correct 200.
 *
 * Reading the audit log is deliberately not itself audited (#20).
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
