/**
 * Route middleware — defence in depth only. The server refuses unauthorised requests regardless of
 * what the client renders; an endpoint relying on this file for authorization is a bug
 * (CLAUDE.md rule 6).
 *
 * `useRequestFetch()` rather than the browser auth client, whose baseURL is relative and unusable
 * during SSR. `/api/auth/get-session` returns null/200 when unauthenticated and never throws, so a
 * throw here means the platform is broken, not that the visitor is signed out.
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
    throw createError({
      statusCode: 503,
      statusMessage: 'Sign-in is temporarily unavailable. Please try again shortly.',
    })
  }

  if (!session?.session) {
    return navigateTo({ path: '/sign-in', query: { redirect: to.fullPath } })
  }

  // FR-023: deactivation changes login status. No `redirect`, since the account cannot sign in.
  if (session.user?.status === 'disabled') {
    return navigateTo({ path: '/sign-in', query: { reason: 'disabled' } })
  }
})
