import { createAuthClient } from 'better-auth/vue'

/**
 * The browser-side auth client.
 *
 * Nothing here is a security boundary — the UI never is. Every authorization decision is made
 * server-side in server/domain/identity/policy.ts; this exists so the interface can show the right
 * thing, and being wrong about that is a cosmetic bug, not a vulnerability.
 *
 * ## Why the exports are guarded
 *
 * `baseURL: ''` is correct in a browser and unusable anywhere else: server-side `fetch` cannot
 * parse a relative URL. Calling any of these during SSR previously produced
 * `Failed to parse URL from /api/auth/get-session` — a 500 with a message that names neither the
 * cause nor the fix. `app/middleware/auth.ts` did exactly that, and every protected route returned
 * 500 from the day it was written until the shell was first loaded in a browser.
 *
 * The base URL is deliberately NOT made absolute for the server. The server already has
 * `useServerAuth()` in server/utils/auth.ts, which talks to better-auth directly; giving this
 * client an absolute URL would make it "work" on the server by adding a pointless HTTP round trip
 * to the application itself.
 *
 * So instead the failure is made legible. The guard has to fire at **call** time rather than at
 * module scope: `createAuthClient` and the destructuring below both run on the server too, and
 * throwing there would break every page that imports this file, including the sign-in page.
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

/**
 * Wraps a callable so invoking it on the server throws the message above, and wraps one level of
 * nested callables so `signIn.email(...)` is covered as well as `signOut(...)`.
 *
 * Property reads are left alone — only application is guarded. Reading a property during SSR is
 * harmless; it is the network call that cannot work.
 */
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
