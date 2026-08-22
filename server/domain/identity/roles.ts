import { and, eq } from 'drizzle-orm'

import { identitySession, identityUser, identityUserRoles } from '../../db/schema/identity.ts'
import type { RoleCode } from '../../db/schema/identity.ts'
import { createAuditRepository } from '../platform/index.ts'
import { identityAuditEvent } from './audit-events.ts'
import type { Db } from '../../db/client.ts'

/**
 * Role grants for the `identity` domain.
 *
 * `identity_user_roles` is the authority; `identity_user.roles` is a derived projection that
 * rides better-auth's session cookie cache so authorization costs zero database reads on the hot
 * path. Two places therefore hold role state, which is only safe because of the controls
 * required alongside it (issue #37): one service method owns both writes, in one transaction; an
 * integration test asserts the projection equals the table; a source-scan test asserts nothing
 * outside this folder writes either; and sessions are revoked on every change.
 */

/** Combinations forbidden regardless of who grants them. See issue #37. */
const EXCLUSIVE_PAIRS: ReadonlyArray<readonly [RoleCode, RoleCode]> = [
  // Separation of duties: Lab Admin *drafts* scoring rules and Academic Lead *approves* them
  // (rbac.md). One account holding both reduces CLAUDE.md rule 1 to self-certification.
  ['lab_admin', 'academic_lead'],
]

/** External Partner is the only role scoped by tenancy: it may not be held with any internal role. */
const EXTERNAL_ROLE: RoleCode = 'external_partner'

export class RoleExclusionError extends Error {
  // Declared explicitly rather than as a constructor parameter property: parameter properties
  // emit code, so Node's strip-only TypeScript mode rejects them — and the seed script imports
  // this module directly under Node.
  readonly roles: readonly RoleCode[]

  constructor(roles: readonly RoleCode[], message: string) {
    super(message)
    this.name = 'RoleExclusionError'
    this.roles = roles
  }
}

/**
 * Rejects a forbidden combination with a domain error.
 *
 * This duplicates the database triggers deliberately. The trigger is what a bad migration or a
 * `turso db shell` session cannot bypass; this guard is what turns the failure into a meaningful
 * error rather than a raw SQLITE_CONSTRAINT surfacing to a caller. Neither replaces the other.
 */
export function assertRolesAllowed(roles: readonly RoleCode[]): void {
  const set = new Set(roles)

  for (const [a, b] of EXCLUSIVE_PAIRS) {
    if (set.has(a) && set.has(b)) {
      throw new RoleExclusionError(roles, `Roles '${a}' and '${b}' are mutually exclusive.`)
    }
  }

  if (set.has(EXTERNAL_ROLE) && set.size > 1) {
    throw new RoleExclusionError(
      roles,
      `Role '${EXTERNAL_ROLE}' cannot be combined with an internal role.`
    )
  }
}

/** The projection format: sorted and comma-separated, so it is stable and comparable. */
export function projectRoles(roles: readonly RoleCode[]): string {
  return [...new Set(roles)].sort().join(',')
}

export function parseProjection(value: string): RoleCode[] {
  return value === '' ? [] : (value.split(',') as RoleCode[])
}

export interface SetRolesInput {
  userId: string
  roles: readonly RoleCode[]
  /** Who is making the change. Recorded on the grant and in the audit event. */
  actorUserId: string
}

export function createRolesRepository(db: Db) {
  return {
    async listRoles(userId: string): Promise<RoleCode[]> {
      const rows = await db
        .select({ role: identityUserRoles.role })
        .from(identityUserRoles)
        .where(eq(identityUserRoles.userId, userId))
      return rows.map((r) => r.role).sort()
    },

    /**
     * Replaces a user's grants, rewrites the projection, revokes their sessions, and appends an
     * audit event — all in one transaction, so the table and its projection cannot diverge.
     */
    async setRoles({ userId, roles, actorUserId }: SetRolesInput): Promise<void> {
      assertRolesAllowed(roles)
      const next = [...new Set(roles)].sort()

      const before = await this.listRoles(userId)

      await db.transaction(async (tx) => {
        await tx.delete(identityUserRoles).where(eq(identityUserRoles.userId, userId))

        if (next.length > 0) {
          await tx.insert(identityUserRoles).values(
            next.map((role) => ({
              id: crypto.randomUUID(),
              userId,
              role,
              grantedAt: new Date(),
              grantedBy: actorUserId,
            }))
          )
        }

        await tx
          .update(identityUser)
          .set({ roles: projectRoles(next), updatedAt: new Date() })
          .where(eq(identityUser.id, userId))

        // A stale role in a cached session is the whole risk of the projection, so every change
        // invalidates the user's sessions rather than waiting for the 60s cookie cache to lapse.
        await tx.delete(identitySession).where(eq(identitySession.userId, userId))

        const event = identityAuditEvent({
          event_type: 'identity.role_change',
          before,
          after: next,
        })
        await createAuditRepository(tx as unknown as Db).append({
          ...event,
          actorUserId,
          targetUserId: userId,
        })
      })
    },

    /** Used by tests and by an operational check: does the projection still match the table? */
    async projectionMatchesTable(userId: string): Promise<boolean> {
      const [user] = await db
        .select({ roles: identityUser.roles })
        .from(identityUser)
        .where(and(eq(identityUser.id, userId)))
      if (!user) return false
      return user.roles === projectRoles(await this.listRoles(userId))
    },
  }
}
