import type { SessionStatus } from '../../db/schema/assessment.ts'

/**
 * The session lifecycle: `in_progress → submitted → scored`, one step at a time, never backwards.
 *
 * Separate from `state-machine.ts`, which owns the *version* lifecycle. Two different things move
 * through two different sequences, and merging them would mean one map whose keys only make sense
 * once you know which of the two you are holding.
 *
 * `submitted → scored` is declared here and **deliberately unreachable**: nothing in this map
 * calls it, because the scoring engine is a separate effort (#58, #70). It is written down so
 * that effort inherits a contract rather than inventing one, and so the freeze triggers in
 * migration 0007 — which already treat `scored` as frozen — are not guarding a state no code
 * admits exists.
 *
 * As with versions, this duplicates nothing the database enforces: the CHECK on `status` holds
 * membership in the three values, not the order between them, so an `in_progress → scored` skip
 * would sail straight past it.
 */
export const ALLOWED_SESSION_TRANSITIONS: Readonly<
  Record<SessionStatus, readonly SessionStatus[]>
> = {
  in_progress: ['submitted'],
  submitted: ['scored'],
  scored: [],
}

export class IllegalSessionTransitionError extends Error {
  readonly from: SessionStatus
  readonly to: SessionStatus

  constructor(from: SessionStatus, to: SessionStatus) {
    super(`Cannot transition an assessment session from '${from}' to '${to}'.`)
    this.name = 'IllegalSessionTransitionError'
    this.from = from
    this.to = to
  }
}

export function assertSessionTransitionAllowed(from: SessionStatus, to: SessionStatus): void {
  if (!ALLOWED_SESSION_TRANSITIONS[from].includes(to)) {
    throw new IllegalSessionTransitionError(from, to)
  }
}

/** Whether answers may still be written. The freeze triggers enforce the same rule in SQLite. */
export function isOpenForAnswers(status: SessionStatus): boolean {
  return status === 'in_progress'
}
