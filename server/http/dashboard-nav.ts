import { authorize, type Action, type Resource } from '../domain/identity/policy.ts'
import type { RoleCode } from '../db/schema/identity.ts'

/**
 * The Lab Admin navigation tree (issue #22).
 *
 * The rail is a projection of the access matrix, not a second list: each item declares its resource
 * and action, and the server resolves them through the matrix it enforces with. Filtering here
 * rather than in the browser keeps one authority.
 *
 * Hiding an item is convenience, never enforcement (CLAUDE.md rule 6). Roles are up to 60s stale,
 * so a demoted user may briefly still see one; the route denies.
 */

export interface NavItem {
  /** The translation key too: the browser renders `dashboard.nav.<id>`. */
  id: string
  group: 'operate' | 'configure' | 'insight'
  /** Null for items whose domain this foundation does not build. */
  to: string | null
  resource: Resource
  action: Action
  /** False renders the item disabled with a visible reason, rather than hiding it. */
  available: boolean
}

/**
 * Grouped by activity, working items first. Own Profile and Own Assessment are absent on purpose —
 * they belong in the user dropdown, not the administrative rail.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'overview',
    group: 'operate',
    to: '/dashboard',
    resource: 'ownProfile',
    action: 'read',
    available: true,
  },
  {
    id: 'users',
    group: 'operate',
    to: '/dashboard/users',
    resource: 'userAdministration',
    action: 'read',
    available: true,
  },
  {
    id: 'audit',
    group: 'operate',
    to: '/dashboard/audit',
    resource: 'auditLog',
    action: 'read',
    available: true,
  },
  {
    id: 'assessment-config',
    group: 'configure',
    to: '/dashboard/assessment',
    resource: 'assessmentConfiguration',
    action: 'read',
    available: true,
  },
  {
    id: 'scoring-rules',
    group: 'configure',
    to: null,
    resource: 'scoringRules',
    action: 'draft',
    available: false,
  },
  {
    id: 'assigned-students',
    group: 'insight',
    to: null,
    resource: 'assignedStudentDetail',
    action: 'read',
    available: false,
  },
  {
    id: 'aggregate',
    group: 'insight',
    to: null,
    resource: 'aggregateDashboard',
    action: 'read',
    available: false,
  },
  {
    id: 'research-exports',
    group: 'insight',
    to: null,
    resource: 'researchExport',
    action: 'approve',
    available: false,
  },
]

/**
 * Excludes `resource` and `action`: shipping them would invite re-implementing the decision in the
 * browser.
 *
 * It carries no display text either. The rail is bilingual, and a label chosen here would be
 * chosen in one language for every reader — so the wire carries `id` and the browser translates
 * it. Same rule as the error envelope in api-design.md, where the code is stable and the message
 * is rendered at the edge.
 */
export interface VisibleNavItem {
  id: string
  group: NavItem['group']
  to: string | null
  available: boolean
}

/** A `scoped` cell resolves to visible: no navigation-time answer exists, and hiding on a guess is
 * worse than showing an item whose route then denies precisely. */
export function visibleNavItems(roles: readonly RoleCode[]): VisibleNavItem[] {
  return NAV_ITEMS.filter((item) => authorize(roles, item.resource, item.action) !== 'deny').map(
    ({ id, group, to, available }) => ({ id, group, to, available })
  )
}
