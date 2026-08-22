import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from '../setup/db'

/**
 * Folded in from issue #23: assert that an IEEE-754 double survives a round trip through the
 * driver *exactly*. SQLite REAL is an 8-byte IEEE-754 double and a JavaScript number is the same
 * representation, so this should be lossless — but "should be" is not what a numeric storage
 * guarantee ought to rest on, and any float this system stores depends on it.
 *
 * Asserted with strict equality rather than approximate comparison, deliberately.
 *
 * This covers the local `file:` path only. The deployed Hrana path is different code, so the same
 * assertion belongs in whatever first exercises a real Turso database — noted on the auth build.
 */
describe('IEEE-754 double round trip', () => {
  let t: TestDb
  beforeEach(async () => {
    t = await freshDb()
  })
  afterEach(async () => {
    await t.drop()
  })

  const awkward: Array<[string, number]> = [
    ['0.1', 0.1],
    ['one third', 1 / 3],
    ['epsilon', Number.EPSILON],
    ['max safe integer plus a half', Number.MAX_SAFE_INTEGER + 0.5],
    ['long binary expansion', 0.30000000000000004],
    ['very small', 5e-324],
    ['very large', 1.7976931348623157e308],
  ]

  it('preserves every awkward double exactly', async () => {
    await t.client.execute('CREATE TABLE probe (label TEXT PRIMARY KEY, v REAL NOT NULL)')
    for (const [label, value] of awkward) {
      await t.client.execute({
        sql: 'INSERT INTO probe (label, v) VALUES (?, ?)',
        args: [label, value],
      })
    }

    for (const [label, value] of awkward) {
      const r = await t.client.execute({
        sql: 'SELECT v FROM probe WHERE label = ?',
        args: [label],
      })
      const row = r.rows[0]
      if (!row) throw new Error(`no row for ${label}`)
      expect(row.v, label).toBe(value)
    }
  })

  /**
   * Negative zero is the one value that does NOT survive: SQLite returns +0.
   *
   * Asserted rather than omitted, because omitting it would leave the suite implying that every
   * double round-trips. Immaterial for anything this platform stores — scores are non-negative and
   * no sign-of-zero distinction is meaningful here — but it is a real limit of the guarantee and a
   * later reader should find it stated rather than discover it.
   */
  it('does not preserve the sign of negative zero', async () => {
    await t.client.execute('CREATE TABLE probe (label TEXT PRIMARY KEY, v REAL NOT NULL)')
    await t.client.execute({ sql: 'INSERT INTO probe VALUES (?, ?)', args: ['neg zero', -0] })
    const r = await t.client.execute("SELECT v FROM probe WHERE label = 'neg zero'")
    const row = r.rows[0]
    if (!row) throw new Error('no row')
    expect(Object.is(row.v, -0)).toBe(false)
    expect(row.v).toBe(0)
  })

  /**
   * Also from issue #23: the Drizzle adapter uses RETURNING on every insert, so it is on the write
   * path for every user, session and account row. Very likely fine — SQLite has supported it since
   * 3.35 — but cheap to settle permanently rather than assume.
   */
  it('supports RETURNING', async () => {
    const r = await t.client.execute(
      "INSERT INTO audit_logs (id, event_type, created_at) VALUES ('r1', 'identity.role_change', 1) RETURNING id"
    )
    expect(r.rows[0]?.id).toBe('r1')
  })
})
