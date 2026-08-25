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
 * Grouped by activity, working items first. Own Profile and Own Assessment are absent on purpose —
 * they belong in the user dropdown, not the administrative rail.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    group: 'operate',
    to: '/dashboard',
    resource: 'ownProfile',
    action: 'read',
    available: true,
  },
  {
    id: 'users',
    label: 'Users',
    group: 'operate',
    to: '/dashboard/users',
    resource: 'userAdministration',
    action: 'read',
    available: true,
  },
  {
    id: 'audit',
    label: 'Audit log',
    group: 'operate',
    to: '/dashboard/audit',
    resource: 'auditLog',
    action: 'read',
    available: true,
  },
  {
    id: 'assessment-config',
    label: 'Assessment configuration',
    group: 'configure',
    to: '/dashboard/assessment',
    resource: 'assessmentConfiguration',
    action: 'read',
    available: true,
  },
  {
    id: 'scoring-rules',
    label: 'Scoring rules',
    group: 'configure',
    to: null,
    resource: 'scoringRules',
    action: 'draft',
    available: false,
  },
  {
    id: 'assigned-students',
    label: 'Assigned students',
    group: 'insight',
    to: null,
    resource: 'assignedStudentDetail',
    action: 'read',
    available: false,
  },
  {
    id: 'aggregate',
    label: 'Aggregate dashboard',
    group: 'insight',
    to: null,
    resource: 'aggregateDashboard',
    action: 'read',
    available: false,
  },
  {
    id: 'research-exports',
    label: 'Research exports',
    group: 'insight',
    to: null,
    resource: 'researchExport',
    action: 'approve',
    available: false,
  },
]

export const NAV_GROUP_LABELS: Record<NavItem['group'], string> = {
  operate: 'Operate',
  configure: 'Configure',
  insight: 'Insight',
}

/** Excludes `resource` and `action`: shipping them would invite re-implementing the decision in the
 * browser. */
export interface VisibleNavItem {
  id: string
  label: string
  group: NavItem['group']
  to: string | null
  available: boolean
}

/** A `scoped` cell resolves to visible: no navigation-time answer exists, and hiding on a guess is
 * worse than showing an item whose route then denies precisely. */
export function visibleNavItems(roles: readonly RoleCode[]): VisibleNavItem[] {
  return NAV_ITEMS.filter((item) => authorize(roles, item.resource, item.action) !== 'deny').map(
    ({ id, label, group, to, available }) => ({ id, label, group, to, available })
  )
}
