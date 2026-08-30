import { ConsentRequiredError } from '../domain/identity/index.ts'
import {
  CrossInstrumentError,
  DuplicateCodeError,
  IllegalTransitionError,
  InvalidReorderError,
  InvalidSourceVersionError,
  NotFoundError,
  OpenVersionExistsError,
  VersionFrozenError,
  VersionNotPublishableError,
  IncompleteResponseSetError,
  InvalidAnswerError,
  SessionAlreadySubmittedError,
  VersionNotTakeableError,
  BaseLocaleNotTranslatableError,
} from '../domain/assessment/index.ts'
import { UnsupportedLocaleError } from '../db/schema/locale.ts'

/**
 * Maps a domain error to `docs/architecture/api-design.md`'s status table.
 *
 * This lives in the HTTP layer rather than the domain: knowing that a frozen version is a 409 is
 * a transport concern, and putting `httpStatus` on a domain error would invert that. Domains throw
 * meaningful errors; this file decides what they look like over the wire.
 *
 * Without it every one of these surfaced as an unhandled throw, which `runPolicyHandler` would
 * have turned into a 500 — leaking a stack for what is really "you cannot edit a published
 * version". #48 paired its triggers with a service guard precisely so the caller gets an
 * actionable message, and a 500 would have thrown that away at the last hop.
 */

export interface MappedDomainError {
  status: 400 | 404 | 409 | 422
  code: string
  message: string
  fields?: { path: string; code: string }[]
}

/** A `zod/mini` failure. Matched structurally — importing zod here only to name a type is not
 * worth the coupling, and the shape is stable across both zod builds. */
interface ZodLike {
  name: string
  issues: { path: (string | number)[]; code: string; message: string }[]
}

function isZodError(error: unknown): error is ZodLike {
  return (
    error instanceof Error &&
    error.name === '$ZodError' &&
    Array.isArray((error as unknown as ZodLike).issues)
  )
}

export function mapDomainError(error: unknown): MappedDomainError | null {
  if (error instanceof UnsupportedLocaleError) {
    // 422 rather than 404: the route exists and the request is well-formed, but the language it
    // names is not one the platform serves. Storing it as the default instead would be a silent
    // wrong answer.
    return {
      status: 422,
      code: 'UNSUPPORTED_LOCALE',
      message: error.message,
    }
  }

  if (error instanceof BaseLocaleNotTranslatableError) {
    return {
      status: 422,
      code: 'ASSESSMENT_BASE_LOCALE_NOT_TRANSLATABLE',
      message: error.message,
    }
  }

  if (error instanceof NotFoundError) {
    // 404 rather than 422: api-design.md gives 404 to "resource tidak ada, atau tidak boleh
    // diketahui keberadaannya", and an id the caller cannot see must be indistinguishable from
    // one that does not exist.
    return { status: 404, code: 'NOT_FOUND', message: 'Not found.' }
  }

  if (error instanceof DuplicateCodeError) {
    // 409, not 422: api-design.md gives 409 to a state conflict, and the request itself is well
    // formed — it is the instrument's existing contents that refuse it. `fields` still names
    // `code` so the authoring form can mark the offending input instead of showing a banner.
    return {
      status: 409,
      code: 'ASSESSMENT_CODE_TAKEN',
      message: error.message,
      fields: [{ path: 'code', code: 'TAKEN' }],
    }
  }

  if (error instanceof VersionFrozenError) {
    return {
      status: 409,
      code: 'ASSESSMENT_VERSION_IMMUTABLE',
      message: error.message,
    }
  }

  if (error instanceof IllegalTransitionError) {
    return {
      status: 409,
      code: 'ASSESSMENT_VERSION_TRANSITION_ILLEGAL',
      message: error.message,
    }
  }

  if (error instanceof OpenVersionExistsError) {
    return {
      status: 409,
      code: 'ASSESSMENT_OPEN_VERSION_EXISTS',
      message: error.message,
    }
  }

  if (error instanceof VersionNotPublishableError) {
    // 422, not 409: api-design.md gives 409 to a state conflict and 422 to a request the domain
    // refuses on its contents. The transition draft/review -> published is legal; what the version
    // contains is not ready.
    return {
      status: 422,
      code:
        error.reason === 'no-items'
          ? 'ASSESSMENT_VERSION_EMPTY'
          : 'ASSESSMENT_VERSION_UNMAPPED_ITEMS',
      message: error.message,
      // Item codes, not stems — authored content never rides out through an error body.
      fields: error.itemCodes.map((code) => ({ path: code, code: 'UNMAPPED' })),
    }
  }

  if (error instanceof InvalidSourceVersionError) {
    return {
      status: 422,
      code: 'ASSESSMENT_SOURCE_VERSION_INVALID',
      message: error.message,
      fields: [{ path: 'sourceVersionId', code: 'NOT_FROZEN' }],
    }
  }

  if (error instanceof InvalidReorderError) {
    return {
      status: 422,
      code: 'ASSESSMENT_REORDER_INVALID',
      message: error.message,
      fields: [{ path: 'itemIds', code: 'NOT_A_PERMUTATION' }],
    }
  }

  if (error instanceof CrossInstrumentError) {
    return {
      status: 422,
      code: 'ASSESSMENT_CROSS_INSTRUMENT',
      message: error.message,
      fields: [],
    }
  }

  // ------------------------------------------------------------------ the taking flow (#64) ---

  if (error instanceof SessionAlreadySubmittedError) {
    // Covers a repeated submit and any write against a session that is already closed — the HTTP
    // translation of migration 0007's freeze triggers.
    return {
      status: 409,
      code: 'SESSION_ALREADY_SUBMITTED',
      message: 'This assessment has already been submitted and can no longer be changed.',
    }
  }

  if (error instanceof VersionNotTakeableError) {
    // Only `retired` is a 409. A `draft` or `review` version has never been handed out, so
    // confirming it exists would leak an unpublished instrument to a student — api-design.md gives
    // 404 to "resource tidak ada, atau tidak boleh diketahui keberadaannya", and that is the
    // honest answer here. Retirement is different: #61 still shows a retired version to a student
    // holding an in-progress session, so its existence is not a secret and the state conflict is
    // the useful thing to report.
    if (error.status !== 'retired') {
      return { status: 404, code: 'NOT_FOUND', message: 'Not found.' }
    }
    return {
      status: 409,
      code: 'ASSESSMENT_VERSION_RETIRED',
      message: 'This assessment is no longer available to start.',
    }
  }

  if (error instanceof ConsentRequiredError) {
    // Not an error the student caused — the client sends them to the consent page and retries.
    return {
      status: 409,
      code: 'CONSENT_REQUIRED',
      message: 'Consent is required before this assessment can be started.',
    }
  }

  if (error instanceof IncompleteResponseSetError) {
    // SC-06. `fields` names the unanswered items so the client can mark them without re-deriving
    // the list; it carries ids only, never answers.
    return {
      status: 422,
      code: 'ASSESSMENT_RESPONSE_SET_INCOMPLETE',
      message: 'Every question must be answered before submitting.',
      fields: error.missingVersionItemIds.map((id) => ({ path: id, code: 'REQUIRED' })),
    }
  }

  if (error instanceof InvalidAnswerError) {
    // `message` comes from the error, which names only the item — never the rejected value. That
    // is the whole point of InvalidAnswerError's shape; see the note on it in taking.ts.
    return {
      status: 422,
      code: 'ASSESSMENT_ANSWER_NOT_ON_SCALE',
      message: error.message,
      fields: [{ path: 'answerValue', code: 'NOT_ON_SCALE' }],
    }
  }

  if (isZodError(error)) {
    return {
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'The request body is not valid.',
      // 422 must carry `fields` per api-design.md. No value is ever echoed back — only the path
      // and the reason — so a request that carried answer content cannot be reflected out of it.
      fields: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code.toUpperCase(),
      })),
    }
  }

  return null
}
