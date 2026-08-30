import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ASSESSMENT_CODE_PATTERN } from '../../db/schema/assessment'
import { ROLE_CODES } from '../../db/schema/identity'
import { freshDb, insertUser, type TestDb } from '../setup/db'
import rbac from '../fixtures/rbac-roles'

describe('CHECK constraints reject bad values written through the driver', () => {
  let t: TestDb
  let userId: string
  beforeEach(async () => {
    t = await freshDb()
    userId = await insertUser(t.db)
  })
  afterEach(async () => {
    await t.drop()
  })

  it('rejects an unknown role', async () => {
    await expect(
      t.client.execute({
        sql: 'INSERT INTO identity_user_roles (id, user_id, role, granted_at) VALUES (?, ?, ?, ?)',
        args: [crypto.randomUUID(), userId, 'superuser', Date.now()],
      })
    ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
  })

  it('accepts every role in rbac.md', async () => {
    for (const role of ROLE_CODES) {
      const fresh = await insertUser(t.db)
      await t.client.execute({
        sql: 'INSERT INTO identity_user_roles (id, user_id, role, granted_at) VALUES (?, ?, ?, ?)',
        args: [crypto.randomUUID(), fresh, role, Date.now()],
      })
    }
  })

  it('rejects an unknown user status', async () => {
    await expect(
      t.client.execute({ sql: 'UPDATE identity_user SET status = ?', args: ['suspended'] })
    ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
  })

  it('rejects an unknown consent method', async () => {
    await expect(
      t.client.execute({
        sql: `INSERT INTO identity_consents
              (id, user_id, policy_id, policy_version, policy_hash, accepted_at, method)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), userId, 'privacy', 'v1', 'deadbeef', Date.now(), 'telepathy'],
      })
    ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
  })

  /**
   * The role CHECK list and rbac.md must not drift apart. The fixture is a transcription of the
   * document; if either side changes alone, this fails.
   */
  it('keeps the role CHECK list identical to docs/security/rbac.md', () => {
    expect([...ROLE_CODES].sort()).toEqual([...rbac.roles].sort())
  })
})

describe('audit_logs.event_type format CHECK', () => {
  let t: TestDb
  beforeEach(async () => {
    t = await freshDb()
  })
  afterEach(async () => {
    await t.drop()
  })

  const insert = (eventType: string) =>
    t.client.execute({
      sql: 'INSERT INTO audit_logs (id, event_type, created_at) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), eventType, Date.now()],
    })

  it.each(['identity.role_change', 'assessment.submitted', 'a.bc'])('accepts %s', async (v) => {
    await insert(v)
  })

  it.each([
    ['flat, no domain prefix', 'role_change'],
    ['uppercase', 'Identity.RoleChange'],
    ['whitespace', 'identity.role change'],
    ['trailing dot', 'identity.'],
    ['leading dot', '.role_change'],
    ['double dot', 'identity..x'],
    ['hyphen', 'identity.role-change'],
    ['too short', 'ab'],
    ['punctuation', 'identity.role_change!'],
    ['digit', 'identity.role_change9'],
  ])('rejects %s', async (_label, v) => {
    await expect(insert(v)).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
  })
})

/**
 * `ASSESSMENT_CODE_PATTERN` and `codeFormatCheck` state the same rule twice, once as a JavaScript
 * regex for the API boundary and once as a SQL `GLOB` expression for the engine. They sit in one
 * file, but proximity is not enforcement — this is. A drift here means either a code the API
 * accepts and the database rejects, which is the 500 the pattern exists to prevent, or a code the
 * database accepts and the API refuses, which is a form nobody can submit.
 *
 * The interesting cases are the two places a plausible reimplementation diverges. JavaScript's `$`
 * and SQLite's `NOT GLOB` disagree about a trailing newline in some regex dialects, and `*`, `?`
 * and `[` are GLOB metacharacters that a naive CHECK would treat as wildcards.
 */
describe('the code pattern and the code CHECK agree', () => {
  let t: TestDb
  beforeEach(async () => {
    t = await freshDb()
  })
  afterEach(async () => {
    await t.drop()
  })

  const CASES = [
    'a',
    'likert5',
    'kdpgk_v1',
    '_',
    '0',
    '',
    'A',
    'a-b',
    'a b',
    'é',
    'a\nb',
    'ab\n',
    ' a',
    'a.',
    'a*',
    'a?',
    'a[b',
  ]

  it.each(CASES)('decides %j the same way in both places', async (code) => {
    const acceptedByPattern = ASSESSMENT_CODE_PATTERN.test(code)

    let acceptedByDatabase = true
    try {
      await t.client.execute({
        sql: 'INSERT INTO assessment_instruments (id, code, name, created_at, created_by) VALUES (?, ?, ?, ?, ?)',
        args: [crypto.randomUUID(), code, 'n', Date.now(), 'tester'],
      })
    } catch {
      acceptedByDatabase = false
    }

    expect(acceptedByPattern).toBe(acceptedByDatabase)
  })
})
