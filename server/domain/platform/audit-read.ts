import { desc, eq } from 'drizzle-orm'

import { auditLogs } from '../../db/schema/platform.ts'
import type { Db } from '../../db/client.ts'

/**
 * Reading `audit_logs`. Lives in `platform`, which owns the table.
 *
 * It is a separate module from the route for a reason that turned out to matter: the narrowing
 * below is the difference between a Lab Admin's outright `R` and a student's "Own actions", and
 * when it lived inline in the route file it could not be tested at all — the route imports h3 at
 * runtime, which does not resolve under the server test project. So the one piece of logic that
 * leaked data was the one piece with no test.
 */

export interface ListAuditEventsOptions {
  /**
   * When set, only rows this user was the actor of are returned.
   *
   * The caller passes it when the policy decision was `scoped`. A scoped decision authorises the
   * *request*, not the whole table: the predicate answers "may you look?", never "here is what you
   * may look at". Authorising and narrowing are two obligations and the first does not discharge
   * the second — see issue #25's verification notes.
   */
  scopeToActor?: string
  limit?: number
}

export interface AuditEventRow {
  id: string
  eventType: string
  actorUserId: string | null
  targetUserId: string | null
  detail: string | null
  createdAt: string
}

export async function listAuditEvents(
  db: Db,
  options: ListAuditEventsOptions = {}
): Promise<AuditEventRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100)

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
    .where(options.scopeToActor ? eq(auditLogs.actorUserId, options.scopeToActor) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  }))
}
