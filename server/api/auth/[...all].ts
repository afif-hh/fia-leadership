import { defineEventHandler, toWebRequest } from 'h3'

import { useServerAuth } from '../../utils/auth'

/**
 * better-auth's own handler, mounted at /api/auth/**.
 *
 * This is a documented exception to the `server/api/v1/**` convention in
 * docs/architecture/api-design.md — better-auth owns these paths and its client expects them
 * there. Noted so a later reader does not "fix" it.
 *
 * The env is read per request rather than at module scope: on Workers, request-scoped bindings are
 * not available in module scope, and `useServerAuth` memoises the instance anyway.
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  return useServerAuth({
    BETTER_AUTH_SECRET: config.betterAuthSecret,
    BETTER_AUTH_URL: config.public?.betterAuthUrl,
    TURSO_DATABASE_URL: config.tursoDatabaseUrl,
    TURSO_AUTH_TOKEN: config.tursoAuthToken,
  }).handler(toWebRequest(event))
})
