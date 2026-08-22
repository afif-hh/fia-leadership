import { and, eq } from 'drizzle-orm'

import { auditLogs } from '../../db/schema/platform.ts'
import type { Db } from '../../db/client.ts'
import { ROLE_CODES, type RoleCode } from '../../db/schema/identity.ts'
import type { AuthPrincipal } from './session.ts'

/**
 * The server-side RBAC policy layer. `docs/security/rbac.md` is the source of truth; `policy.test.ts`
 * fails if this file and that document diverge in either direction.
 *
 * Hand-rolled rather than CASL or oso — see issue #20 for why.
 */

/* ------------------------------------------------------------------ resources and actions --- */

/** Values are the exact row labels in rbac.md — the parity test matches on them character for
 * character. */
export const RESOURCE_LABELS = {
  ownProfile: 'Own Profile',
  ownAssessment: 'Own Assessment',
  assignedStudentDetail: 'Assigned Student Detail',
  assessmentConfiguration: 'Assessment Configuration',
  scoringRules: 'Scoring Rules',
  aggregateDashboard: 'Aggregate Dashboard',
  researchExport: 'Research Export',
  auditLog: 'Audit Log',
  /** The ninth resource, added in issue #22. See the note under the matrix in rbac.md. */
  userAdministration: 'User Administration',
} as const

export type Resource = keyof typeof RESOURCE_LABELS
export const RESOURCES = Object.keys(RESOURCE_LABELS) as Resource[]

/** `Approve` and `Draft` are distinct actions: the Scoring Rules row separates who may do which. */
export const ACTIONS = ['create', 'read', 'update', 'delete', 'approve', 'draft'] as const
export type Action = (typeof ACTIONS)[number]

/* ----------------------------------------------------------------------------- the matrix --- */

/**
 * The cell vocabulary, exactly as rbac.md writes it. Note the en dash (U+2013) in `–`: the
 * document uses it and the parity test compares literally, so an ASCII hyphen would fail.
 */
export const CELL_TOKENS = [
  'CRUD',
  'R',
  'R*',
  '–',
  'Approve',
  'Draft',
  'Approve (op.)',
  'Approve (acad.)',
  'Own cohort',
  'Own actions',
] as const
export type CellToken = (typeof CELL_TOKENS)[number]

/** Stores the document's own tokens, so parity is a string comparison and interpretation lives in
 * one separately tested function. */
export const MATRIX: Readonly<Record<Resource, Readonly<Record<RoleCode, CellToken>>>> = {
  ownProfile: {
    student: 'CRUD', lecturer_coach: 'R', lab_admin: 'R', academic_lead: 'R',
    researcher: '–', faculty_executive: '–', external_partner: '–',
  },
  ownAssessment: {
    student: 'CRUD', lecturer_coach: 'R*', lab_admin: 'R', academic_lead: 'R',
    researcher: '–', faculty_executive: '–', external_partner: '–',
  },
  assignedStudentDetail: {
    student: '–', lecturer_coach: 'R', lab_admin: 'R', academic_lead: 'R',
    researcher: '–', faculty_executive: '–', external_partner: 'R*',
  },
  assessmentConfiguration: {
    student: '–', lecturer_coach: '–', lab_admin: 'CRUD', academic_lead: 'Approve',
    researcher: '–', faculty_executive: '–', external_partner: '–',
  },
  scoringRules: {
    student: '–', lecturer_coach: '–', lab_admin: 'Draft', academic_lead: 'Approve',
    researcher: '–', faculty_executive: '–', external_partner: '–',
  },
  aggregateDashboard: {
    student: 'Own cohort', lecturer_coach: 'R', lab_admin: 'R', academic_lead: 'R',
    researcher: 'R*', faculty_executive: 'R', external_partner: 'R*',
  },
  researchExport: {
    student: '–', lecturer_coach: '–', lab_admin: 'Approve (op.)',
    academic_lead: 'Approve (acad.)', researcher: 'R*', faculty_executive: '–',
    external_partner: '–',
  },
  auditLog: {
    student: 'Own actions', lecturer_coach: '–', lab_admin: 'R', academic_lead: 'R',
    researcher: '–', faculty_executive: '–', external_partner: '–',
  },
  userAdministration: {
    student: '–', lecturer_coach: '–', lab_admin: 'CRUD', academic_lead: 'R',
    researcher: '–', faculty_executive: '–', external_partner: '–',
  },
}

/* -------------------------------------------------------------------------- interpretation --- */

/**
 * `scoped` means the matrix *cannot answer*, not "probably yes". It dispatches to a predicate that
 * takes the database, so the five `R*` rows cannot be resolved by table lookup.
 */
export type Decision = 'allow' | 'deny' | 'scoped'

const CRUD_ACTIONS: readonly Action[] = ['create', 'read', 'update', 'delete']

/** One token plus one action to one decision. The whole of the interpretation, in one place. */
export function interpret(token: CellToken, action: Action): Decision {
  switch (token) {
    case '–':
      return 'deny'
    case 'CRUD':
      return CRUD_ACTIONS.includes(action) ? 'allow' : 'deny'
    case 'R':
      return action === 'read' ? 'allow' : 'deny'
    case 'R*':
    case 'Own cohort':
    case 'Own actions':
      // Every scoped token in the document is a restricted *read*. The parenthetical differs —
      // cohort, assignment, tenancy — but the restriction is resolved by the predicate, not here.
      return action === 'read' ? 'scoped' : 'deny'
    case 'Approve':
    case 'Approve (op.)':
    case 'Approve (acad.)':
      // The parenthetical records *which* approval a role gives, operational or academic. Both
      // are the `approve` action; the distinction matters to the workflow, not to the gate.
      return action === 'approve' ? 'allow' : 'deny'
    case 'Draft':
      return action === 'draft' ? 'allow' : 'deny'
  }
}

/** Strongest role wins: `allow` over `scoped` over `deny`. */
export function authorize(
  roles: readonly RoleCode[],
  resource: Resource,
  action: Action
): Decision {
  let best: Decision = 'deny'
  for (const role of roles) {
    const decision = interpret(MATRIX[resource][role], action)
    if (decision === 'allow') return 'allow'
    if (decision === 'scoped') best = 'scoped'
  }
  return best
}

/* ------------------------------------------------------------------------ scope predicates --- */

export interface ScopeContext {
  db: Db
  principal: AuthPrincipal
  /** Whatever the route needs to identify the row. Route params, query, or body — the caller's. */
  target: Readonly<Record<string, unknown>>
}

export type ScopePredicate = (ctx: ScopeContext) => Promise<boolean>

export class ScopeNotImplementedError extends Error {
  readonly resource: Resource

  constructor(resource: Resource) {
    super(
      `No scope predicate for "${resource}". Its cell is scoped in rbac.md, so the matrix cannot ` +
        'answer it, and this foundation does not build the schema the predicate would read. ' +
        'Implement it with that domain — never fall back to a decision.'
    )
    this.name = 'ScopeNotImplementedError'
    this.resource = resource
  }
}

/**
 * Only `auditLog` is reachable; the other scoped resources need schemas this foundation does not
 * build. They are absent rather than stubbed to `false`, because `false` is a decision and absence
 * is not — reaching one throws.
 */
export const SCOPE_PREDICATES: Partial<Record<Resource, ScopePredicate>> = {
  /** `actorUserId` is required: a missing target would read as an unrestricted query, so it
   * refuses rather than guessing. */
  auditLog: async ({ db, principal, target }) => {
    const actorUserId = target.actorUserId
    if (typeof actorUserId !== 'string' || actorUserId !== principal.userId) return false

    // An id they do not own must be indistinguishable from one that does not exist.
    const id = target.id
    if (typeof id !== 'string') return true

    const rows = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(eq(auditLogs.id, id), eq(auditLogs.actorUserId, principal.userId)))
      .limit(1)

    return rows.length > 0
  },
}

/** Runs the predicate for a scoped cell, or throws if this foundation has none. */
export async function resolveScope(resource: Resource, ctx: ScopeContext): Promise<boolean> {
  const predicate = SCOPE_PREDICATES[resource]
  if (!predicate) throw new ScopeNotImplementedError(resource)
  return predicate(ctx)
}

/** Every role code, re-exported so callers do not reach into the schema for it. */
export { ROLE_CODES }
export type { RoleCode }
