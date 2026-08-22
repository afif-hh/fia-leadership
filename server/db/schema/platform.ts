import { check, index, sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * The `platform` domain. Owns `audit_logs` and the append() service over it.
 *
 * Append-only is enforced by BEFORE UPDATE / BEFORE DELETE triggers raising RAISE(ABORT),
 * created by a custom migration (see server/db/migrations). The trigger is the *primary*
 * mechanism rather than a fallback, because it behaves identically on a local file, under
 * `turso dev`, and on Turso Cloud — so an integration test can genuinely assert it, which no
 * token-based control can locally. See issues #34 and #23.
 *
 * Residual risk, stated rather than hidden: a credential with DDL rights can DROP TRIGGER, and
 * DROP TABLE is not blocked by a BEFORE DELETE trigger. This defends against bugs and accidents,
 * not against a compromised credential.
 */

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),

    /**
     * `<domain>.<action>`, e.g. `identity.role_change`.
     *
     * Constrained by *format*, not membership (issue #28 and its amendment). A value list would
     * need widening every time an endpoint gains an audit classification, and SQLite has no
     * ADD CONSTRAINT — so each widening means the 12-step table rebuild, which drops this
     * table's append-only triggers along with the table. Rebuilding audit_logs is the riskiest
     * migration in this schema; a format CHECK means adding an audited action needs no migration
     * at all, so that window never opens.
     *
     * The dotted shape is enforced structurally so every event is attributable to a domain and
     * `GLOB 'identity.*'` is a real query. The vocabulary itself is closed in the application,
     * by the per-domain discriminated unions in server/domain/<domain>/audit-events.ts.
     */
    eventType: text('event_type').notNull(),

    /** Who performed the action. */
    actorUserId: text('actor_user_id'),

    /** Who it was performed on, where that differs from the actor. */
    targetUserId: text('target_user_id'),

    /**
     * JSON, validated against a z.strictObject() member of the owning domain's discriminated
     * union before it is written. Never a free-form slot: on an append-only table there is no
     * UPDATE to take a PII leak back out, so a PII-RULE violation here would be permanent by
     * construction. Nothing queries inside it, so `text` is sufficient and SQLite's JSON
     * functions never enter the picture.
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
