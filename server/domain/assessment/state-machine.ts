import type { VersionStatus } from '../../db/schema/assessment.ts'

/**
 * The version lifecycle: `draft → review → published → retired`, one step at a time, never
 * backwards (#47, #48, #49). `published → draft` is explicitly illegal — un-publishing would
 * make `assessment_version_id` stop identifying a fixed instrument, breaking NFR-11
 * traceability (#48).
 *
 * This duplicates nothing the database enforces: the CHECK on `status` only holds membership in
 * the four values, not the order between them, and the immutability triggers only fire once a
 * row is frozen — a `draft → published` skip would sail past both untouched. This is the only
 * place transition order is checked.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<VersionStatus, readonly VersionStatus[]>> = {
  draft: ['review'],
  review: ['published'],
  published: ['retired'],
  retired: [],
}

export class IllegalTransitionError extends Error {
  readonly from: VersionStatus
  readonly to: VersionStatus

  constructor(from: VersionStatus, to: VersionStatus) {
    super(`Cannot transition an assessment version from '${from}' to '${to}'.`)
    this.name = 'IllegalTransitionError'
    this.from = from
    this.to = to
  }
}

export function assertTransitionAllowed(from: VersionStatus, to: VersionStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new IllegalTransitionError(from, to)
  }
}
