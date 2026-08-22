import { defineEventHandler, setResponseStatus } from 'h3'

import { createDb } from '../db/client.ts'
import { useServerAuth } from '../utils/auth.ts'
import { runPolicyHandler, type PolicySpec } from './policy-handler.ts'
import type { SessionSource } from '../domain/identity/session.ts'

/**
 * The Nitro binding around `runPolicyHandler`.
 *
 * Deliberately thin and deliberately separate: everything worth testing lives next door in a
 * module that imports no framework runtime, so the decision path runs under plain Node. All this
 * file does is resolve per-request dependencies and apply the status the core chose.
 *
 * The env is read per request rather than at module scope because on Workers request-scoped
 * bindings do not exist in module scope; `useServerAuth` memoises per isolate anyway.
 */
export function definePolicyHandler<T>(spec: PolicySpec<T>) {
  return defineEventHandler(async (event) => {
    const config = useRuntimeConfig(event)
    const env = {
      BETTER_AUTH_SECRET: config.betterAuthSecret,
      BETTER_AUTH_URL: config.public?.betterAuthUrl,
      TURSO_DATABASE_URL: config.tursoDatabaseUrl,
      TURSO_AUTH_TOKEN: config.tursoAuthToken,
    }

    const result = await runPolicyHandler(
      {
        auth: useServerAuth(env) as unknown as SessionSource,
        db: createDb(env, 'identity'),
      },
      spec,
      event
    )

    if (result.status !== 200) setResponseStatus(event, result.status)
    return result.body
  })
}
