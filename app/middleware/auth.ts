/**
 * Route middleware — **defence in depth only**.
 *
 * This redirects an unauthenticated visitor away from a protected page so they see a sign-in form
 * instead of an empty shell. It is not what protects the data: the server refuses unauthorised
 * requests regardless of what the client renders, and any endpoint relying on this file for
 * authorization is a bug (CLAUDE.md rule 6 — the UI is not a security boundary).
 */
import { authClient } from '../utils/auth-client'

export default defineNuxtRouteMiddleware(async (to) => {
  const { data } = await authClient.getSession()
  if (!data?.session) {
    return navigateTo({ path: '/sign-in', query: { redirect: to.fullPath } })
  }
})
