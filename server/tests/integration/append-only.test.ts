import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { auditLogs } from '../../db/schema/platform'
import { createAuditRepository } from '../../domain/platform/audit'
import { freshDb, type TestDb } from '../setup/db'

describe('audit_logs is append-only', () => {
  let t: TestDb
  beforeEach(async () => {
    t = await freshDb()
  })
  afterEach(async () => {
    await t.drop()
  })

  const seed = async () => {
    await createAuditRepository(t.db).append({
      eventType: 'identity.role_change' as never,
      actorUserId: 'a',
      targetUserId: 'b',
      detail: { event_type: 'identity.role_change', before: [], after: ['lab_admin'] },
    })
  }

  it('accepts an insert', async () => {
    await seed()
    const rows = await t.db.select().from(auditLogs)
    expect(rows).toHaveLength(1)
  })

  it('rejects an UPDATE at the database level', async () => {
    await seed()
    // Deliberately bypassing the repository, which has no update method at all — this asserts
    // the trigger, not the interface.
    await expect(
      t.client.execute("UPDATE audit_logs SET event_type = 'identity.tampered'")
    ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
  })

  it('rejects a DELETE at the database level', async () => {
    await seed()
    await expect(t.client.execute('DELETE FROM audit_logs')).rejects.toMatchObject({
      code: 'SQLITE_CONSTRAINT',
    })
  })

  it('surfaces the append-only message, not an opaque failure', async () => {
    await seed()
    await expect(t.client.execute('DELETE FROM audit_logs')).rejects.toThrow(/append-only/)
  })

  /**
   * The criterion from issue #28: a BEFORE DELETE trigger does not block DROP TABLE and is
   * dropped with the table it guards, so a future migration that rebuilds audit_logs could
   * silently remove the guarantee. This asserts the triggers exist after ALL migrations have
   * run, not merely after the one that created them.
   */
  it('has its triggers present after every migration has run', async () => {
    const rows = await t.db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`
    )
    const names = rows.map((r) => r.name)
    expect(names).toContain('audit_logs_no_update')
    expect(names).toContain('audit_logs_no_delete')
  })
})
