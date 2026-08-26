import {
  CrossInstrumentError,
  IllegalTransitionError,
  InvalidReorderError,
  InvalidSourceVersionError,
  NotFoundError,
  OpenVersionExistsError,
  VersionFrozenError,
  VersionNotPublishableError,
} from '../domain/assessment/index.ts'

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
  if (error instanceof NotFoundError) {
    // 404 rather than 422: api-design.md gives 404 to "resource tidak ada, atau tidak boleh
    // diketahui keberadaannya", and an id the caller cannot see must be indistinguishable from
    // one that does not exist.
    return { status: 404, code: 'NOT_FOUND', message: 'Not found.' }
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
