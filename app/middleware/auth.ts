/**
 * Route middleware — **defence in depth only**.
 *
 * This redirects an unauthenticated visitor away from a protected page so they see a sign-in form
 * instead of an empty shell. It is not what protects the data: the server refuses unauthorised
 * requests regardless of what the client renders, and any endpoint relying on this file for
 * authorization is a bug (CLAUDE.md rule 6 — the UI is not a security boundary).
 *
 * It uses `$fetch` with the incoming cookie header rather than `authClient.getSession()`. The
 * client is configured with `baseURL: ''`, which is correct in a browser and unusable during SSR:
 * server-side `fetch` cannot parse a relative URL, so the previous version threw
 * "Failed to parse URL from /api/auth/get-session" and every protected route returned 500. It was
 * never exercised until the shell was actually loaded — source-level tests read the file and
 * proved nothing about it.
 *
 * `$fetch` resolves a relative path against Nitro itself on the server and against the origin in
 * the browser, so one call works on both sides. The cookie has to be forwarded explicitly: an
 * SSR request carries no credentials of its own.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined

  try {
    const session = await $fetch<{ session?: unknown } | null>('/api/auth/get-session', { headers })
    if (session?.session) return
  } catch {
    // A failed or unauthenticated session lookup is a redirect, not an error page. Distinguishing
    // "no session" from "auth service down" would only change the copy, and the safe action is the
    // same either way.
  }

  return navigateTo({ path: '/sign-in', query: { redirect: to.fullPath } })
})
