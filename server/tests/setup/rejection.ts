/**
 * Awaits a rejection and narrows it to its own type, so a test can assert on an error's fields
 * rather than only its class.
 *
 * `promise.catch((e) => e)` is the obvious shorthand and does not typecheck: the result is a union
 * of the error and the resolved value, so `error.missingVersionItemIds` is a type error. It also
 * passes silently if the call unexpectedly *succeeds*, which is the more dangerous half — the
 * assertions after it would run against a resolved value and quietly test nothing.
 */
export async function rejectionOf<E extends Error>(
  promise: Promise<unknown>,
  type: new (...args: never[]) => E
): Promise<E> {
  try {
    await promise
  } catch (error) {
    if (error instanceof type) return error
    throw error
  }
  throw new Error(`Expected the call to reject with ${type.name}, but it resolved.`)
}
