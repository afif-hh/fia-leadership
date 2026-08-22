import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { identitySession, identityUser } from '../../db/schema/identity'
import { auditLogs } from '../../db/schema/platform'
import {
  RoleExclusionError,
  assertRolesAllowed,
  createRolesRepository,
} from '../../domain/identity/roles'
import { freshDb, insertUser, type TestDb } from '../setup/db'

describe('role grants, exclusions and the projection', () => {
  let t: TestDb
  let userId: string
  let actorId: string

  beforeEach(async () => {
    t = await freshDb()
    userId = await insertUser(t.db)
    actorId = await insertUser(t.db)
  })
  afterEach(async () => {
    await t.drop()
  })

  it('grants multiple roles and keeps the projection in step', async () => {
    const repo = createRolesRepository(t.db)
    await repo.setRoles({ userId, roles: ['lecturer_coach', 'researcher'], actorUserId: actorId })

    expect(await repo.listRoles(userId)).toEqual(['lecturer_coach', 'researcher'])
    const [user] = await t.db
      .select({ roles: identityUser.roles })
      .from(identityUser)
      .where(eq(identityUser.id, userId))
    expect(user).toBeDefined()
    expect(user?.roles).toBe('lecturer_coach,researcher')
    expect(await repo.projectionMatchesTable(userId)).toBe(true)
  })

  describe('separation of duties: lab_admin and academic_lead', () => {
    it('is rejected by the service guard with a domain error', () => {
      expect(() => assertRolesAllowed(['lab_admin', 'academic_lead'])).toThrow(RoleExclusionError)
    })

    it('is rejected by the database trigger when the service is bypassed', async () => {
      await t.client.execute({
        sql: 'INSERT INTO identity_user_roles (id, user_id, role, granted_at) VALUES (?, ?, ?, ?)',
        args: [crypto.randomUUID(), userId, 'lab_admin', Date.now()],
      })
      await expect(
        t.client.execute({
          sql: 'INSERT INTO identity_user_roles (id, user_id, role, granted_at) VALUES (?, ?, ?, ?)',
          args: [crypto.randomUUID(), userId, 'academic_lead', Date.now()],
        })
      ).rejects.toThrow(/mutually exclusive/)
    })

    it('is rejected in either grant order', async () => {
      await t.client.execute({
        sql: 'INSERT INTO identity_user_roles (id, user_id, role, granted_at) VALUES (?, ?, ?, ?)',
        args: [crypto.randomUUID(), userId, 'academic_lead', Date.now()],
      })
      await expect(
        t.client.execute({
          sql: 'INSERT INTO identity_user_roles (id, user_id, role, granted_at) VALUES (?, ?, ?, ?)',
          args: [crypto.randomUUID(), userId, 'lab_admin', Date.now()],
        })
      ).rejects.toThrow(/mutually exclusive/)
    })

    it('is rejected when reached by UPDATE rather than INSERT', async () => {
      await t.client.execute({
        sql: 'INSERT INTO identity_user_roles (id, user_id, role, granted_at) VALUES (?, ?, ?, ?)',
        args: ['a', userId, 'lab_admin', Date.now()],
      })
      await t.client.execute({
        sql: 'INSERT INTO identity_user_roles (id, user_id, role, granted_at) VALUES (?, ?, ?, ?)',
        args: ['b', userId, 'researcher', Date.now()],
      })
      await expect(
        t.client.execute({
          sql: "UPDATE identity_user_roles SET role = 'academic_lead' WHERE id = 'b'",
        })
      ).rejects.toThrow(/mutually exclusive/)
    })
  })

  describe('tenancy: external_partner may not hold an internal role', () => {
    it('is rejected by the service guard', () => {
      expect(() => assertRolesAllowed(['external_partner', 'researcher'])).toThrow(
        RoleExclusionError
      )
    })

    it('is allowed alone', async () => {
      const repo = createRolesRepository(t.db)
      await repo.setRoles({ userId, roles: ['external_partner'], actorUserId: actorId })
      expect(await repo.listRoles(userId)).toEqual(['external_partner'])
    })

    it('is rejected by the trigger when added to an existing internal role', async () => {
      await t.client.execute({
        sql: 'INSERT INTO identity_user_roles (id, user_id, role, granted_at) VALUES (?, ?, ?, ?)',
        args: [crypto.randomUUID(), userId, 'student', Date.now()],
      })
      await expect(
        t.client.execute({
          sql: 'INSERT INTO identity_user_roles (id, user_id, role, granted_at) VALUES (?, ?, ?, ?)',
          args: [crypto.randomUUID(), userId, 'external_partner', Date.now()],
        })
      ).rejects.toThrow(/internal role/)
    })

    it('is rejected by the trigger when an internal role is added to it', async () => {
      await t.client.execute({
        sql: 'INSERT INTO identity_user_roles (id, user_id, role, granted_at) VALUES (?, ?, ?, ?)',
        args: [crypto.randomUUID(), userId, 'external_partner', Date.now()],
      })
      await expect(
        t.client.execute({
          sql: 'INSERT INTO identity_user_roles (id, user_id, role, granted_at) VALUES (?, ?, ?, ?)',
          args: [crypto.randomUUID(), userId, 'student', Date.now()],
        })
      ).rejects.toThrow(/internal role/)
    })
  })

  it('revokes the user sessions on a role change', async () => {
    const now = new Date()
    await t.db.insert(identitySession).values({
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      expiresAt: new Date(now.getTime() + 3_600_000),
      createdAt: now,
      updatedAt: now,
      userId,
    })

    await createRolesRepository(t.db).setRoles({
      userId,
      roles: ['lab_admin'],
      actorUserId: actorId,
    })

    const sessions = await t.db
      .select()
      .from(identitySession)
      .where(eq(identitySession.userId, userId))
    expect(sessions).toHaveLength(0)
  })

  it('appends exactly one audit event recording before and after', async () => {
    const repo = createRolesRepository(t.db)
    await repo.setRoles({ userId, roles: ['researcher'], actorUserId: actorId })
    await repo.setRoles({ userId, roles: ['researcher', 'lecturer_coach'], actorUserId: actorId })

    const rows = await t.db.select().from(auditLogs)
    expect(rows).toHaveLength(2)
    const second = rows[1]
    if (!second) throw new Error('expected a second audit row')
    expect(second.eventType).toBe('identity.role_change')
    expect(second.actorUserId).toBe(actorId)
    expect(second.targetUserId).toBe(userId)
    expect(JSON.parse(second.detail ?? 'null')).toEqual({
      event_type: 'identity.role_change',
      before: ['researcher'],
      after: ['lecturer_coach', 'researcher'],
    })
  })

  it('leaves the table and projection untouched when the guard rejects', async () => {
    const repo = createRolesRepository(t.db)
    await repo.setRoles({ userId, roles: ['lab_admin'], actorUserId: actorId })
    await expect(
      repo.setRoles({ userId, roles: ['lab_admin', 'academic_lead'], actorUserId: actorId })
    ).rejects.toThrow(RoleExclusionError)

    expect(await repo.listRoles(userId)).toEqual(['lab_admin'])
    expect(await repo.projectionMatchesTable(userId)).toBe(true)
  })
})
