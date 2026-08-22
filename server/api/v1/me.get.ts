import { definePolicyHandler } from '../../http/define-policy-handler.ts'
import { visibleNavItems } from '../../http/dashboard-nav.ts'

/**
 * The current principal, plus the navigation the matrix permits them.
 *
 * Mapped to the **Own Profile** row of `docs/security/rbac.md`, per api-design.md's rule that
 * every endpoint maps to exactly one row. Not audit-classified: reading your own identity is not
 * on rbac.md's Audit Classification list, so this takes the cached session and costs no database
 * read on the hot path — which is the entire reason `roles` is a projection on the user row.
 */
export default definePolicyHandler({
  resource: 'ownProfile',
  action: 'read',
  handler: (_event, principal) => ({
    userId: principal.userId,
    email: principal.email,
    roles: principal.roles,
    navigation: visibleNavItems(principal.roles),
  }),
})
