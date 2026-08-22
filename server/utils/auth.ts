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
 * A memoised lazy singleton. Lazy because a module-scope `betterAuth()` was never verified to
 * construct on a real Worker, where module scope has no I/O; memoised so it is once per isolate.
 * `better-auth/minimal` omits the plugin surface this foundation does not use.
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
      /** `identity_` prefix rather than `schemaName`, which is Postgres-only. */
      schema: {
        user: identityUser,
        session: identitySession,
        account: identityAccount,
        verification: identityVerification,
      },
      /** Flipped from the package default: libSQL has real interactive transactions. */
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
         * A projection of `identity_user_roles`, written only by `setRoles()`; the table stays the
         * authority. Here rather than in `customSession` because `additionalFields` ride the
         * cookie cache, so authorization costs zero reads. `input: false` keeps it client-unwritable.
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
        /** Bounds role staleness at 60s; `requireFreshSession()` bypasses it for audited actions. */
        maxAge: 60,
      },
    },

    advanced: {
      /** No cross-site posting of auth requests in this application. */
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
      /**
       * The IP is resolved per request but never persisted — the hooks below blank the row (#38).
       *
       * `disableIpTracking: true` must NOT be set: `getIP()` then returns null unconditionally and
       * the rate limiter skips entirely rather than degrading, removing the abuse control that
       * bounds scrypt hashing (#36).
       *
       * `cf-connecting-ip`, not the `x-forwarded-for` default: the edge sets it and a client
       * cannot forge it, and a client-supplied multi-valued XFF drops every request into one
       * shared bucket.
       */
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },

    databaseHooks: {
      session: {
        create: {
          /** Retention is enforced here: the adapter needs both columns, so they are blanked
           * rather than removed. */
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
