import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'

import { listAuditEvents, listAuditEventTypes } from '../../domain/platform/audit-read.ts'
import { runPolicyHandler } from '../../http/policy-handler.ts'
import { createAuditRepository } from '../../domain/platform/audit.ts'
import { identityAuditEvent } from '../../domain/identity/audit-events.ts'
import { assessmentAuditEvent } from '../../domain/assessment/audit-events.ts'
import { freshDb, insertUser, type TestDb } from '../setup/db.ts'
import type { SessionSource } from '../../domain/identity/session.ts'

/**
 * Asserts row identity, not status codes.
 *
 * A `scoped` decision authorises the request, not the whole table. Every other policy test checks
 * the decision; none checked the rows, and a leak went unnoticed with a correct 200 throughout.
 * Adding a scoped resource without a test here is the mistake this file exists to prevent.
 */

function fakeEvent(): H3Event {
  return { headers: new Headers(), context: { requestId: 'req-scope-test' } } as unknown as H3Event
}

/**
 * The route's own handler body, reproduced against the extracted domain function.
 *
 * The route file imports h3 at runtime and cannot be loaded here, which is exactly why the
 * narrowing was extracted into `listAuditEvents`. This spec wires it the same way the route does,
 * so the *decision-to-filter* mapping — the thing that leaked — is under test.
 */
const auditHandler = (db: TestDb['db'], eventType?: string) => ({
  resource: 'auditLog' as const,
  action: 'read' as const,
  handler: async (
    _event: H3Event,
    principal: { userId: string },
    { decision }: { decision: string }
  ) => {
    const scopeToActor = decision === 'scoped' ? principal.userId : undefined
    return {
      events: await listAuditEvents(db, { scopeToActor, eventType }),
      eventTypes: await listAuditEventTypes(db, { scopeToActor }),
    }
  },
})

function authFor(user: { id: string; email: string; roles: string }): SessionSource {
  return {
    api: {
      getSession: async () => ({
        session: { id: `sess-${user.id}` },
        user: { ...user, status: 'active' },
      }),
    },
  }
}

describe('a scoped decision narrows the rows, not just the response code', () => {
  let t: TestDb
  let studentId: string
  let adminId: string

  beforeEach(async () => {
    t = await freshDb()
    studentId = await insertUser(t.db, { email: 'student@example.test' })
    adminId = await insertUser(t.db, { email: 'admin@example.test' })

    const audit = createAuditRepository(t.db)
    const one = identityAuditEvent({
      event_type: 'identity.role_change',
      before: [],
      after: ['student'],
    })
    await audit.append({ ...one, actorUserId: studentId, targetUserId: studentId })

    const two = identityAuditEvent({
      event_type: 'identity.role_change',
      before: [],
      after: ['lab_admin'],
    })
    await audit.append({ ...two, actorUserId: adminId, targetUserId: adminId })

    // A second event type, actored by the admin only. Without it every row shares one type and
    // "the option list narrows" is not a claim these rows can falsify.
    const three = assessmentAuditEvent({
      event_type: 'assessment.version_published',
      version_id: 'ver-1',
      version_no: 1,
    })
    await audit.append({ ...three, actorUserId: adminId })
  })

  afterEach(async () => {
    await t.drop()
  })

  it('a Lab Admin sees every row, because the cell is an outright R', async () => {
    const result = await runPolicyHandler(
      { auth: authFor({ id: adminId, email: 'admin@example.test', roles: 'lab_admin' }), db: t.db },
      { ...auditHandler(t.db), target: () => ({}) },
      fakeEvent()
    )

    expect(result.status).toBe(200)
    const actors = (result.body as { events: { actorUserId: string }[] }).events.map(
      (e) => e.actorUserId
    )
    expect(new Set(actors)).toEqual(new Set([studentId, adminId]))
  })

  /**
   * FR-011's filter options are derived from the ledger, which makes the option list a second
   * result set carrying the same obligation as the rows. An unnarrowed list would not leak a row,
   * but it would tell a student which kinds of action other people take — which is the same class
   * of disclosure this file exists to catch, one level up.
   */
  it('narrows the filter options too, not only the rows', async () => {
    const asAdmin = await runPolicyHandler(
      { auth: authFor({ id: adminId, email: 'admin@example.test', roles: 'lab_admin' }), db: t.db },
      { ...auditHandler(t.db), target: () => ({}) },
      fakeEvent()
    )
    expect((asAdmin.body as { eventTypes: string[] }).eventTypes).toEqual([
      'assessment.version_published',
      'identity.role_change',
    ])

    const asStudent = await runPolicyHandler(
      {
        auth: authFor({ id: studentId, email: 'student@example.test', roles: 'student' }),
        db: t.db,
      },
      { ...auditHandler(t.db), target: () => ({ actorUserId: studentId }) },
      fakeEvent()
    )
    const offered = (asStudent.body as { eventTypes: string[] }).eventTypes
    expect(offered).toEqual(['identity.role_change'])
    expect(offered).not.toContain('assessment.version_published')
  })

  it('filters the rows to one event type without widening past the scope', async () => {
    const result = await runPolicyHandler(
      { auth: authFor({ id: adminId, email: 'admin@example.test', roles: 'lab_admin' }), db: t.db },
      { ...auditHandler(t.db, 'assessment.version_published'), target: () => ({}) },
      fakeEvent()
    )

    const body = result.body as { events: { eventType: string }[]; eventTypes: string[] }
    expect(body.events.map((e) => e.eventType)).toEqual(['assessment.version_published'])
    // The options must keep offering the other value, or choosing one collapses the control.
    expect(body.eventTypes).toContain('identity.role_change')
  })

  it('returns no rows for an event type nothing carries, rather than every row', async () => {
    const result = await runPolicyHandler(
      { auth: authFor({ id: adminId, email: 'admin@example.test', roles: 'lab_admin' }), db: t.db },
      { ...auditHandler(t.db, 'identity.not_a_thing'), target: () => ({}) },
      fakeEvent()
    )

    expect(result.status).toBe(200)
    expect((result.body as { events: unknown[] }).events).toEqual([])
  })

  it('a student targeting their own actions sees ONLY their own row', async () => {
    // The leak. Before the fix this returned both rows: the predicate said yes, and the query had
    // no WHERE clause. The status code was 200 either way, which is why asserting it proved
    // nothing.
    const result = await runPolicyHandler(
      {
        auth: authFor({ id: studentId, email: 'student@example.test', roles: 'student' }),
        db: t.db,
      },
      { ...auditHandler(t.db), target: () => ({ actorUserId: studentId }) },
      fakeEvent()
    )

    expect(result.status).toBe(200)
    const actors = (result.body as { events: { actorUserId: string }[] }).events.map(
      (e) => e.actorUserId
    )
    expect(actors).toEqual([studentId])
    expect(actors).not.toContain(adminId)
  })

  it("a student targeting somebody else's actions gets 404, not their rows", async () => {
    const result = await runPolicyHandler(
      {
        auth: authFor({ id: studentId, email: 'student@example.test', roles: 'student' }),
        db: t.db,
      },
      { ...auditHandler(t.db), target: () => ({ actorUserId: adminId }) },
      fakeEvent()
    )

    expect(result.status).toBe(404)
    expect(result.body).not.toHaveProperty('events')
  })

  it('a student with no target gets 404 rather than an unscoped query', async () => {
    const result = await runPolicyHandler(
      {
        auth: authFor({ id: studentId, email: 'student@example.test', roles: 'student' }),
        db: t.db,
      },
      { ...auditHandler(t.db), target: () => ({}) },
      fakeEvent()
    )

    expect(result.status).toBe(404)
  })

  it('passes the decision to the handler, so a scoped handler cannot ignore its scope', async () => {
    // Structural, not behavioural: if `decision` stops being passed, a handler cannot narrow and
    // this whole class of bug returns silently.
    let seen: string | undefined
    await runPolicyHandler(
      {
        auth: authFor({ id: studentId, email: 'student@example.test', roles: 'student' }),
        db: t.db,
      },
      {
        resource: 'auditLog',
        action: 'read',
        target: () => ({ actorUserId: studentId }),
        handler: (_e, _p, ctx) => {
          seen = ctx.decision
          return null
        },
      },
      fakeEvent()
    )
    expect(seen).toBe('scoped')
  })
})
