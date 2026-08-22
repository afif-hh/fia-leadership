import { authorize, type Action, type Resource } from '../domain/identity/policy.ts'
import type { RoleCode } from '../db/schema/identity.ts'

/**
 * The Lab Admin navigation tree, decided in issue #22.
 *
 * The rail is a **projection of the access matrix**, not a second list — each item declares the
 * resource and action it needs, and the server resolves them through the same matrix it enforces
 * with. Another role therefore costs a matrix row rather than a second navigation list.
 *
 * The manifest lives server-side and the API returns the permitted items. #22 sketched the filter
 * running in the browser, which would have meant a copy of the matrix in `app/` — the exact drift
 * the projection was meant to prevent. Filtering here keeps one authority.
 *
 * **Hiding an item is convenience, never enforcement** (CLAUDE.md rule 6). Every route the items
 * point at is independently gated by `definePolicyHandler`. Because `requireSession` reads roles
 * from a cookie cache with up to 60 seconds of staleness, a demoted user may briefly still see an
 * item; clicking it returns 403 or 404 from the server, which is the only real guarantee.
 */

export interface NavItem {
  id: string
  label: string
  group: 'operate' | 'configure' | 'insight'
  /** Null for items whose domain this foundation does not build. */
  to: string | null
  resource: Resource
  action: Action
  /** False renders the item disabled with a visible reason, rather than hiding it. */
  available: boolean
}

/**
 * Order is deliberate: what works first, then what is coming, grouped by activity rather than by
 * the matrix's own row order.
 *
 * Own Profile and Own Assessment are absent on purpose. They are the admin's own records rather
 * than administrative surfaces, and belong in the user dropdown at the foot of the rail.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'overview', label: 'Overview', group: 'operate', to: '/dashboard',
    resource: 'ownProfile', action: 'read', available: true,
  },
  {
    id: 'users', label: 'Users', group: 'operate', to: '/dashboard/users',
    resource: 'userAdministration', action: 'read', available: true,
  },
  {
    id: 'audit', label: 'Audit log', group: 'operate', to: '/dashboard/audit',
    resource: 'auditLog', action: 'read', available: true,
  },
  {
    id: 'assessment-config', label: 'Assessment configuration', group: 'configure', to: null,
    resource: 'assessmentConfiguration', action: 'read', available: false,
  },
  {
    id: 'scoring-rules', label: 'Scoring rules', group: 'configure', to: null,
    resource: 'scoringRules', action: 'draft', available: false,
  },
  {
    id: 'assigned-students', label: 'Assigned students', group: 'insight', to: null,
    resource: 'assignedStudentDetail', action: 'read', available: false,
  },
  {
    id: 'aggregate', label: 'Aggregate dashboard', group: 'insight', to: null,
    resource: 'aggregateDashboard', action: 'read', available: false,
  },
  {
    id: 'research-exports', label: 'Research exports', group: 'insight', to: null,
    resource: 'researchExport', action: 'approve', available: false,
  },
]

export const NAV_GROUP_LABELS: Record<NavItem['group'], string> = {
  operate: 'Operate',
  configure: 'Configure',
  insight: 'Insight',
}

/** What the client renders. Deliberately excludes `resource` and `action`: the browser has no use
 * for them, and shipping them would invite someone to re-implement the decision there. */
export interface VisibleNavItem {
  id: string
  label: string
  group: NavItem['group']
  to: string | null
  available: boolean
}

/**
 * Projects the manifest through the matrix for one principal.
 *
 * A `scoped` cell resolves to **visible**. The predicate needs a database read and a target row,
 * so no navigation-time answer exists — and hiding on a guess would be worse than showing an item
 * whose route then denies precisely.
 */
export function visibleNavItems(roles: readonly RoleCode[]): VisibleNavItem[] {
  return NAV_ITEMS.filter((item) => authorize(roles, item.resource, item.action) !== 'deny').map(
    ({ id, label, group, to, available }) => ({ id, label, group, to, available })
  )
}
