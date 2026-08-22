import { auditLogs } from '../../db/schema/platform'
import type { Db } from '../../db/client'

/**
 * `platform` owns the `audit_logs` table and the only interface that writes to it.
 *
 * The vocabulary of event types is NOT owned here. Each domain declares its own in
 * `server/domain/<domain>/audit-events.ts`, because `audit_logs` lives in `platform` while every
 * domain emits into it — and making `platform` the registry would either turn a platform-owned
 * file into a permanent coordination point between otherwise independent efforts (CLAUDE.md
 * rule 10) or invert the dependency so `platform` imports from every domain it serves.
 * See issue #28 and its amendment.
 *
 * `platform` therefore validates the *shape* of an event type and nothing about its meaning.
 */

/** `<domain>.<action>`, lowercase, dots and underscores only. Mirrors the database CHECK. */
const EVENT_TYPE_PATTERN = /^[a-z][a-z_]*(\.[a-z][a-z_]*)+$/

declare const auditEventTypeBrand: unique symbol
/**
 * A domain's event type, once it has been through {@link asAuditEventType}. Branded so a bare
 * string cannot reach `append()` — the point is that adding an event is a deliberate act in the
 * owning domain, not an inline string literal at a call site.
 */
export type AuditEventType = string & { readonly [auditEventTypeBrand]: true }

export function asAuditEventType(value: string): AuditEventType {
  if (!EVENT_TYPE_PATTERN.test(value) || value.length < 3 || value.length > 64) {
    throw new Error(
      `Invalid audit event type ${JSON.stringify(value)}: expected <domain>.<action>, ` +
        'lowercase letters and underscores only, 3-64 characters.'
    )
  }
  return value as AuditEventType
}

export interface AuditEvent {
  eventType: AuditEventType
  actorUserId?: string | null
  targetUserId?: string | null
  /**
   * Already validated by the owning domain against a `z.strictObject()` member of its
   * discriminated union. Serialised here, never inspected — nothing queries inside it.
   */
  detail?: unknown
}

/**
 * The append-only repository interface.
 *
 * There is deliberately no `update`, no `delete`, and no `deleteAll` — not even a test-only one.
 * This is a compensating control required alongside the database triggers: the triggers stop a
 * write that is attempted, and the absence of a method stops one from being written. A
 * source-scan test asserts nothing anywhere calls `.update(auditLogs)` or `.delete(auditLogs)`.
 */
export interface AuditRepository {
  append(event: AuditEvent): Promise<void>
}

export function createAuditRepository(db: Db): AuditRepository {
  return {
    async append(event) {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        eventType: asAuditEventType(event.eventType),
        actorUserId: event.actorUserId ?? null,
        targetUserId: event.targetUserId ?? null,
        detail: event.detail === undefined ? null : JSON.stringify(event.detail),
        createdAt: new Date(),
      })
    },
  }
}
