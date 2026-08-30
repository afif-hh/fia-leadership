import { and, desc, eq } from 'drizzle-orm'

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
  /**
   * An exact `event_type`. Equality, never a prefix: `assessment.` would also match a future
   * `assessment.session_submitted`, and an audit filter that quietly widens is worse than none.
   *
   * A value no row carries returns no rows, which is the truthful answer rather than a lenient
   * one, so there is no separate validation path and no error class. The only guard needed is the
   * length cap the caller applies, because the column's own CHECK stops at 64.
   */
  eventType?: string
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

/**
 * The two obligations of `options`, as one clause. Both functions build it from the same call so a
 * narrowing added to one can never be missing from the other — which matters more here than it
 * looks: the option list is derived from the table, so an unnarrowed list would tell a student
 * which kinds of event other people cause.
 */
function visibleRows(options: ListAuditEventsOptions) {
  return and(
    options.scopeToActor ? eq(auditLogs.actorUserId, options.scopeToActor) : undefined,
    options.eventType ? eq(auditLogs.eventType, options.eventType) : undefined
  )
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
    .where(visibleRows(options))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  }))
}

/**
 * The event types present in the rows this caller may read, for the filter's options (FR-011).
 *
 * Derived from the ledger, not from a list this domain keeps. `platform` owns `audit_logs` but
 * deliberately owns none of the vocabulary — each domain declares its own in
 * `server/domain/<domain>/audit-events.ts`, and a registry here would either invert that
 * dependency or become a permanent coordination point between independent efforts (see the note in
 * `audit.ts`, issue #28 and its amendment). Reading the column instead means a domain adding an
 * audited action gets a filter option with no change to this file, and the options can never
 * disagree with what the table actually holds.
 *
 * `eventType` on the options is ignored on purpose: the list has to keep offering the other values
 * once one is chosen, or choosing collapses the control to the single option already selected.
 */
export async function listAuditEventTypes(
  db: Db,
  options: Omit<ListAuditEventsOptions, 'eventType' | 'limit'> = {}
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ eventType: auditLogs.eventType })
    .from(auditLogs)
    .where(visibleRows({ scopeToActor: options.scopeToActor }))
    .orderBy(auditLogs.eventType)

  return rows.map((row) => row.eventType)
}
