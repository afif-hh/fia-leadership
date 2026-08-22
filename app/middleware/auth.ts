/**
 * Route middleware — **defence in depth only**.
 *
 * This redirects a visitor who should not be looking at a protected page, so they see a sign-in
 * form instead of an empty shell. It is not what protects the data: the server refuses
 * unauthorised requests regardless of what the client renders, and any endpoint relying on this
 * file for authorization is a bug (CLAUDE.md rule 6 — the UI is not a security boundary).
 *
 * ## Three things this gets right that the first version did not
 *
 * **1. It works during SSR.** The first version called the browser auth client, whose baseURL is
 * relative; server-side fetch cannot parse a relative URL, so every protected route returned 500
 * from the day this file was written. `useRequestFetch()` is Nuxt's API for exactly this — it
 * resolves to the request-bound `$fetch`, forwarding the incoming headers, and falls back to plain
 * `$fetch` in the browser. `useFetch` uses it internally for relative URLs during SSR, which is
 * why the data pages worked while this file did not.
 *
 * **2. It refuses a disabled account.** FR-023 makes deactivation a change to login status, and
 * the server already rejects every request from such a user with 401 ACCOUNT_DISABLED. Checking
 * only for the presence of a session let them through to a shell that could load nothing, with no
 * explanation of why.
 *
 * **3. It distinguishes "not signed in" from "the platform is broken."** `/api/auth/get-session`
 * returns `null` with HTTP 200 when there is no session — verified, both with no cookie and with a
 * garbage one. It does not throw. So a thrown error means genuine failure: an unreachable
 * database, a misconfigured secret. Swallowing that and redirecting to sign-in produced a loop
 * that could never succeed and logged nothing.
 */

interface SessionResponse {
  session?: { id?: string } | null
  user?: { status?: string } | null
}

export default defineNuxtRouteMiddleware(async (to) => {
  const request = useRequestFetch()

  let session: SessionResponse | null
  try {
    session = await request<SessionResponse | null>('/api/auth/get-session')
  } catch {
    // Deliberately surfaced rather than redirected. See note 3 above.
    throw createError({
      statusCode: 503,
      statusMessage: 'Sign-in is temporarily unavailable. Please try again shortly.',
    })
  }

  if (!session?.session) {
    return navigateTo({ path: '/sign-in', query: { redirect: to.fullPath } })
  }

  if (session.user?.status === 'disabled') {
    // No `redirect` here: sending them back would loop, since the account cannot sign in.
    return navigateTo({ path: '/sign-in', query: { reason: 'disabled' } })
  }
})
