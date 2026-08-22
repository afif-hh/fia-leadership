import { desc } from 'drizzle-orm'
import { getQuery } from 'h3'

import { definePolicyHandler } from '../../http/define-policy-handler.ts'
import { createDb } from '../../db/client.ts'
import { auditLogs } from '../../db/schema/platform.ts'

/**
 * The audit log. Maps to the **Audit Log** row of `docs/security/rbac.md`.
 *
 * A Lab Admin's cell is a plain `R`, so the matrix answers outright. A student's is "Own actions",
 * which is `scoped` — the predicate in `policy.ts` requires `actorUserId` to equal their own id and
 * refuses rather than guessing when no target is given. `target` below is what feeds it.
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
  handler: async (event) => {
    const config = useRuntimeConfig(event)
    const db = createDb(
      {
        TURSO_DATABASE_URL: config.tursoDatabaseUrl,
        TURSO_AUTH_TOKEN: config.tursoAuthToken,
      },
      'platform'
    )

    const query = getQuery(event)
    const limit = Math.min(Number(query.limit) || 20, 100)

    const rows = await db
      .select({
        id: auditLogs.id,
        eventType: auditLogs.eventType,
        actorUserId: auditLogs.actorUserId,
        targetUserId: auditLogs.targetUserId,
        detail: auditLogs.detail,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)

    return {
      events: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      })),
    }
  },
})
