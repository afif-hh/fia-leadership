import { check, index, sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * The `platform` domain. Owns `audit_logs`.
 *
 * Append-only rests on BEFORE UPDATE / BEFORE DELETE triggers raising RAISE(ABORT), created by a
 * custom migration. Residual risk, stated rather than hidden: a credential with DDL rights can
 * DROP TRIGGER, and DROP TABLE is not blocked by a BEFORE DELETE trigger. This defends against
 * bugs and accidents, not a compromised credential. See #34.
 */

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),

    /**
     * `<domain>.<action>`, e.g. `identity.role_change`.
     *
     * Constrained by format, not membership (#28). SQLite has no ADD CONSTRAINT, so widening a
     * value list would mean a table rebuild — which drops this table's append-only triggers with
     * it. A format CHECK means a new audited action needs no migration at all. The vocabulary is
     * closed in the application, by the discriminated unions in
     * server/domain/<domain>/audit-events.ts.
     */
    eventType: text('event_type').notNull(),

    actorUserId: text('actor_user_id'),
    /** The subject, where that differs from the actor. */
    targetUserId: text('target_user_id'),

    /**
     * JSON, validated against a z.strictObject() member of the owning domain's union before it is
     * written. Never a free-form slot: there is no UPDATE to take a PII leak back out, so a
     * PII-RULE violation here would be permanent. Nothing queries inside it, so `text` suffices.
     */
    detail: text('detail'),

    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('audit_logs_event_type_idx').on(t.eventType),
    index('audit_logs_created_at_idx').on(t.createdAt),
    index('audit_logs_actor_user_id_idx').on(t.actorUserId),
    /**
     * GLOB has no repetition operator, so `[a-z][a-z_]*` would mean "a lowercase letter, one
     * char from [a-z_], then literally anything" — far weaker than it reads. The
     * `NOT GLOB '*[^a-z._]*'` idiom is what actually excludes every character outside the
     * allowed set.
     */
    check(
      'audit_logs_event_type_format_check',
      sql`
        length(${t.eventType}) BETWEEN 3 AND 64
        AND ${t.eventType} GLOB '*.*'
        AND ${t.eventType} NOT GLOB '*[^a-z._]*'
        AND ${t.eventType} NOT GLOB '.*'
        AND ${t.eventType} NOT GLOB '*.'
        AND ${t.eventType} NOT GLOB '*..*'
      `
    ),
  ]
)
