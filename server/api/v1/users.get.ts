import { count, eq } from 'drizzle-orm'
import { getQuery } from 'h3'

import { definePolicyHandler } from '../../http/define-policy-handler.ts'
import { createDb } from '../../db/client.ts'
import { identityUser, identityUserRoles } from '../../db/schema/identity.ts'

/**
 * Users, and the role distribution the Overview summarises.
 *
 * Maps to the **User Administration** row added in issue #22. Reading is not audit-classified —
 * audit-log reads were considered and declined in #20 — so this takes the cached session. The
 * write path (`setRoles`, account deactivation) is audit-classified and will use `audit: true`,
 * which forces a fresh session; it is not built here.
 *
 * No email or name is returned by the summary shape. `docs/security/rbac.md` classes a student
 * profile as Confidential, and the Overview needs counts rather than people.
 */
export default definePolicyHandler({
  resource: 'userAdministration',
  action: 'read',
  handler: async (event) => {
    const config = useRuntimeConfig(event)
    const db = createDb(
      {
        TURSO_DATABASE_URL: config.tursoDatabaseUrl,
        TURSO_AUTH_TOKEN: config.tursoAuthToken,
      },
      'identity'
    )

    const query = getQuery(event)
    const summaryOnly = query.summary === '1' || query.summary === 'true'

    const [totals] = await db.select({ total: count() }).from(identityUser)

    const distribution = await db
      .select({ role: identityUserRoles.role, total: count() })
      .from(identityUserRoles)
      .groupBy(identityUserRoles.role)

    const active = await db
      .select({ total: count() })
      .from(identityUser)
      .where(eq(identityUser.status, 'active'))

    const summary = {
      total: totals?.total ?? 0,
      active: active[0]?.total ?? 0,
      rolesInUse: distribution.length,
      distribution: distribution.map((row) => ({ role: row.role, total: row.total })),
    }

    if (summaryOnly) return { summary }

    // The list view. Email is included here and not in the summary, because administering an
    // account requires identifying it — but it stays behind the same single matrix row.
    const users = await db
      .select({
        id: identityUser.id,
        email: identityUser.email,
        name: identityUser.name,
        status: identityUser.status,
        roles: identityUser.roles,
      })
      .from(identityUser)
      .limit(50)

    return { summary, users }
  },
})
