import { createAuthClient } from 'better-auth/vue'

/**
 * The browser-side auth client. Not a security boundary — every authorization decision is made in
 * server/domain/identity/policy.ts.
 *
 * `baseURL` is relative, so these cannot run during SSR. The server has `useServerAuth()`; making
 * this work server-side would only add an HTTP round trip to the application itself. The guard
 * below fires at call time rather than module scope, because `createAuthClient` and the
 * destructuring both run on the server too.
 */

const authClientInstance = createAuthClient({
  // Same-origin: the auth routes are mounted at /api/auth/** by this application.
  baseURL: '',
})

function assertBrowser(what: string): void {
  if (import.meta.server) {
    throw new Error(
      `authClient.${what}() is browser-only: its baseURL is relative, and server-side fetch ` +
        'cannot parse a relative URL. On the server use useServerAuth() from ' +
        'server/utils/auth.ts. In SSR-capable code (route middleware, setup()) use ' +
        'useRequestFetch() to call /api/auth/** instead.'
    )
  }
}

/** Guards application, not property reads: it is the network call that cannot work, not the read. */
function browserOnly<T extends object>(name: string, value: T): T {
  return new Proxy(value, {
    apply(target, thisArg, args) {
      assertBrowser(name)
      return Reflect.apply(target as unknown as (...a: unknown[]) => unknown, thisArg, args)
    },
    get(target, prop, receiver) {
      const inner: unknown = Reflect.get(target, prop, receiver)
      return typeof inner === 'function'
        ? browserOnly(`${name}.${String(prop)}`, inner as unknown as object)
        : inner
    },
  })
}

export const authClient = browserOnly('authClient', authClientInstance)

export const signIn = browserOnly('signIn', authClientInstance.signIn)
export const signOut = browserOnly('signOut', authClientInstance.signOut)
export const useSession = browserOnly('useSession', authClientInstance.useSession)
