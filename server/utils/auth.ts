import { betterAuth } from 'better-auth/minimal'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { hashPassword, verifyPassword } from 'better-auth/crypto'

import { createDb, type DbEnv } from '../db/client'
import {
  identityAccount,
  identitySession,
  identityUser,
  identityVerification,
  USER_STATUSES,
} from '../db/schema/identity'
import { createConcurrencyGate } from './hash-gate'

/**
 * The better-auth instance, as a **memoised lazy singleton**.
 *
 * Lazy is not stylistic. On Workers, secrets are readable at module scope via `cloudflare:workers`
 * but I/O is not, and the research could not verify that a module-scope `betterAuth()` constructs
 * cleanly on a real Worker (no I/O was found in the eager `init` path of the shipped dist, but
 * that is not the same as having deployed it). Constructing on first request removes the need to
 * find out. Memoising keeps it to once per isolate rather than once per request.
 *
 * `better-auth/minimal` rather than `better-auth`: the minimal entrypoint omits the plugin
 * surface this foundation does not use.
 */

export interface AuthEnv extends DbEnv {
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
}

/** Shared across every request in this isolate, which is exactly the scope the memory bound needs. */
const hashGate = createConcurrencyGate<string>()
const verifyGate = createConcurrencyGate<boolean>()

export function buildAuth(env: AuthEnv) {
  const db = createDb(env, 'identity')

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,

    database: drizzleAdapter(db, {
      provider: 'sqlite',
      /**
       * better-auth's model names mapped onto this repo's `identity_`-prefixed tables. The prefix
       * exists because `schemaName` is Postgres-only — on SQLite there is no namespace to put
       * these behind, so the boundary is the prefix plus the ESLint import rule.
       */
      schema: {
        user: identityUser,
        session: identitySession,
        account: identityAccount,
        verification: identityVerification,
      },
      /**
       * Flipped from the package default of `false`. libSQL has real interactive transactions —
       * one of the reasons Turso was chosen over D1 — so there is no reason to run better-auth's
       * multi-step operations non-atomically.
       *
       * (The research also called for flipping a `joins` option. There is no such option in
       * `DrizzleAdapterConfig` at 1.7.1; only `transaction` needed changing.)
       */
      transaction: true,
    }),

    emailAndPassword: {
      enabled: true,
      /** No self-service accounts on this platform: a Lab Admin is seeded, others are granted. */
      disableSignUp: true,
      /** Deferred with the email service; nothing here can send mail yet. See issue #19. */
      requireEmailVerification: false,
      minPasswordLength: 12,
      password: {
        /**
         * Same scrypt better-auth would use, behind the concurrency gate. The gate is the point:
         * see server/utils/hash-gate.ts and issue #36.
         */
        hash: (password) => hashGate.run(() => hashPassword(password)),
        verify: ({ hash, password }) => verifyGate.run(() => verifyPassword({ hash, password })),
      },
    },

    user: {
      additionalFields: {
        /**
         * A derived projection of `identity_user_roles`, written only by
         * IdentityService.setRoles(). `input: false` keeps it out of anything a client can send.
         *
         * It lives here rather than in `customSession` because `additionalFields` ride the session
         * cookie cache, so the authorization hot path costs zero database reads — whereas
         * `customSession` fields are documented as never cached. The table stays the authority.
         */
        roles: { type: 'string', required: false, defaultValue: '', input: false },
        status: {
          type: 'string',
          required: false,
          defaultValue: USER_STATUSES[0],
          input: false,
        },
      },
    },

    session: {
      cookieCache: {
        enabled: true,
        /**
         * Bounds worst-case role staleness at 60 seconds. `requireFreshSession()` bypasses this
         * for every audit-classified action, and `session.cookieCache.version` — if a future
         * better-auth exposes it here — is the incident-time global invalidation lever. Role
         * changes already revoke sessions outright, so this window only matters for a change made
         * by some path that does not.
         */
        maxAge: 60,
      },
    },

    advanced: {
      /** No cross-site posting of auth requests in this application. */
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
      ipAddress: { disableIpTracking: true },
    },

    databaseHooks: {
      session: {
        create: {
          /**
           * Where the retention decision is actually enforced. The adapter requires these columns
           * to exist, and `disableIpTracking` does not stop `userAgent` being written — so both
           * are blanked before the row is created. An integration test asserts they stay empty.
           */
          before: async (session: Record<string, unknown>) => ({
            data: { ...session, ipAddress: null, userAgent: null },
          }),
        },
      },
    },
  })
}

let cached: ReturnType<typeof buildAuth> | undefined

/** The memoised accessor. Call this, never `buildAuth`, outside tests. */
export function useServerAuth(env: AuthEnv) {
  cached ??= buildAuth(env)
  return cached
}

/** Test seam: forget the memoised instance. */
export function resetServerAuth() {
  cached = undefined
}

export const hashGates = { hash: hashGate, verify: verifyGate }
