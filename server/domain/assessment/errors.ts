import type { VersionStatus } from '../../db/schema/assessment.ts'
import type { Locale } from '../../db/schema/locale.ts'

/**
 * What the `assessment` domain refuses, and why.
 *
 * Split out of `repository.ts` when it crossed 1000 lines. These are the domain's vocabulary of
 * refusal, not part of any one write, and `server/http/domain-errors.ts` maps each to the status
 * `docs/architecture/api-design.md` assigns it. Keeping them here means a reader looking for "what
 * can this domain say no to" reads one short file rather than scrolling a repository.
 *
 * No error carries an HTTP status. Knowing that a frozen version is a 409 is a transport concern;
 * putting it here would invert the layering the HTTP mapper exists to hold.
 */

export class NotFoundError extends Error {
  constructor(label: string, id: string) {
    super(`${label} '${id}' not found.`)
    this.name = 'NotFoundError'
  }
}

export class CrossInstrumentError extends Error {
  constructor(label: string) {
    super(`${label} belongs to a different instrument.`)
    this.name = 'CrossInstrumentError'
  }
}

/**
 * A mutation was attempted against a `published` or `retired` version.
 *
 * The nine triggers from #48 are the actual guarantee and would abort this write regardless. This
 * error exists so the caller sees why rather than a raw `SQLITE_CONSTRAINT`, which is exactly the
 * division of labour #48 settled on: the trigger is what cannot be bypassed, the guard is what
 * can be acted on. Never remove one on the grounds that the other exists.
 */
export class VersionFrozenError extends Error {
  readonly versionId: string
  readonly status: VersionStatus

  constructor(versionId: string, status: VersionStatus) {
    super(
      `Assessment version '${versionId}' is ${status} and cannot be changed. ` +
        'Create a new version instead (FR-005).'
    )
    this.name = 'VersionFrozenError'
    this.versionId = versionId
    this.status = status
  }
}

/**
 * An instrument already has a `draft` or `review` version, and only one may be open at a time.
 *
 * The partial unique index `assessment_versions_one_open_per_instrument` is the guarantee. Without
 * this pre-check the index aborts with a raw `SQLITE_CONSTRAINT` that no mapper recognises, so
 * "you already have a draft open" — a thing an author does by accident, not by abuse — reached the
 * caller as a 500. Same division of labour as {@link VersionFrozenError}, and the same reason
 * `createInstrument` and `identity/roles.ts` pre-check their own unique constraints.
 */
export class OpenVersionExistsError extends Error {
  readonly instrumentId: string
  readonly openVersionId: string

  constructor(instrumentId: string, openVersionId: string, versionNo: number) {
    super(
      `This instrument already has an open version (v${versionNo}). ` +
        'Publish or discard it before starting another.'
    )
    this.name = 'OpenVersionExistsError'
    this.instrumentId = instrumentId
    this.openVersionId = openVersionId
  }
}

/**
 * A version cannot be published as it stands. Distinct from {@link IllegalTransitionError}: the
 * transition itself is legal, the version's *contents* are not ready.
 *
 * `reason` is a stable code rather than prose so the UI can say something specific — see the
 * matching blockers in `app/lib/assessment-authoring.ts`, which this mirrors server-side because
 * CLAUDE.md §6 makes the UI not a boundary.
 */
export class VersionNotPublishableError extends Error {
  readonly reason: 'no-items' | 'unmapped-items'
  /** Item codes at fault. Codes, never stems — a stem is authored content and this rides into an
   * HTTP body. */
  readonly itemCodes: string[]

  constructor(reason: 'no-items' | 'unmapped-items', itemCodes: string[] = []) {
    super(
      reason === 'no-items'
        ? 'Cannot publish a version with no items.'
        : `Every item must measure at least one dimension before publishing. Unmapped: ${itemCodes.join(', ')}.`
    )
    this.name = 'VersionNotPublishableError'
    this.reason = reason
    this.itemCodes = itemCodes
  }
}

/** A fork was requested from a version that never froze, so it has no snapshot to fork from (#49). */
export class InvalidSourceVersionError extends Error {
  readonly status: VersionStatus

  constructor(status: VersionStatus) {
    super(`A new version may only be based on a published or retired one, not a ${status} one.`)
    this.name = 'InvalidSourceVersionError'
    this.status = status
  }
}

/** A reorder that is not a permutation of the version's current items. */
export class InvalidReorderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidReorderError'
  }
}

/** A translation was offered for the language the base row already holds. */
export class BaseLocaleNotTranslatableError extends Error {
  readonly locale: Locale

  constructor(locale: Locale) {
    super(
      `'${locale}' is the base language and lives on the row itself, so it cannot be stored as a translation.`
    )
    this.name = 'BaseLocaleNotTranslatableError'
    this.locale = locale
  }
}
