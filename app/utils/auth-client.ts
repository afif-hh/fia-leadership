import { createAuthClient } from 'better-auth/vue'

/**
 * The browser-side auth client.
 *
 * Nothing here is a security boundary — the UI never is. Every authorization decision is made
 * server-side in server/domain/identity/policy.ts; this exists so the interface can show the right
 * thing, and being wrong about that is a cosmetic bug, not a vulnerability.
 */
export const authClient = createAuthClient({
  // Same-origin: the auth routes are mounted at /api/auth/** by this application.
  baseURL: '',
})

export const { signIn, signOut, useSession } = authClient
