import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { buildAuth } from '../../utils/auth.ts'

/**
 * Pins the two halves of the session-IP decision from issue #38's reconciliation comment.
 *
 * This is deliberately a *configuration* test rather than a behavioural one. The failure it
 * guards against has no symptom: setting `disableIpTracking: true` disables better-auth's rate
 * limiting outright, and the only visible sign is an attacker discovering it. Nothing in the
 * request path throws, no log is emitted per request, and every other test still passes — which
 * is exactly how it reached a commit once already.
 *
 * From @better-auth/core/dist/utils/ip.mjs at 1.7.1:
 *
 *   const DEFAULT_IP_HEADERS = ["x-forwarded-for"]
 *
 *   function getIP(req, options) {
 *     if (options.advanced?.ipAddress?.disableIpTracking) return null      // <- unconditional
 *     const ipHeaders = options.advanced?.ipAddress?.ipAddressHeaders || DEFAULT_IP_HEADERS
 *     ...
 *   }
 *
 * and from dist/api/rate-limiter/index.mjs:
 *
 *   const ip = getIP(req, ctx.options)
 *   if (!ip && ctx.options.advanced?.ipAddress?.disableIpTracking) return null   // <- skipped
 *   const key = createRateLimitKey(ip ?? NO_TRUSTED_IP_KEY, path)                // <- one bucket
 */
describe('better-auth client-IP configuration', () => {
  const env = {
    BETTER_AUTH_SECRET: 'test-secret-not-used-for-anything-real',
    BETTER_AUTH_URL: 'http://localhost:3000',
    TURSO_DATABASE_URL: ':memory:',
  }

  it('does not set disableIpTracking, which would switch rate limiting off entirely', () => {
    const options = buildAuth(env).options as {
      advanced?: { ipAddress?: { disableIpTracking?: boolean } }
    }
    expect(options.advanced?.ipAddress?.disableIpTracking).toBeUndefined()
  })

  it('resolves the client IP from cf-connecting-ip, not the x-forwarded-for default', () => {
    const options = buildAuth(env).options as {
      advanced?: { ipAddress?: { ipAddressHeaders?: string[] } }
    }
    const headers = options.advanced?.ipAddress?.ipAddressHeaders

    // Explicit rather than defaulted: on Workers the edge sets cf-connecting-ip and a client
    // cannot forge it. x-forwarded-for is client-supplied, and getIPFromHeader bails with
    // `if (forwardedIps.length !== 1) return null` when no trustedProxies are set — so a client
    // sending their own XFF makes it multi-valued and drops everyone into one shared bucket.
    expect(headers).toEqual(['cf-connecting-ip'])
  })

  it('still discards both retained columns, so resolving is not retaining', () => {
    const options = buildAuth(env).options as {
      databaseHooks?: {
        session?: { create?: { before?: (s: Record<string, unknown>) => Promise<unknown> } }
      }
    }
    const before = options.databaseHooks?.session?.create?.before
    expect(before).toBeTypeOf('function')

    return Promise.resolve(
      before!({ id: 's1', ipAddress: '203.0.113.42', userAgent: 'Mozilla/5.0' })
    ).then((result) => {
      const data = (result as { data: Record<string, unknown> }).data
      expect(data.ipAddress).toBeNull()
      expect(data.userAgent).toBeNull()
    })
  })

  it('records in the source why disableIpTracking must not come back', async () => {
    // The config above is one word away from the bug. A future reader deleting the comment as
    // noise is the realistic regression path, so the comment itself is asserted.
    const source = await readFile(
      fileURLToPath(new URL('../../utils/auth.ts', import.meta.url)),
      'utf8'
    )
    expect(source).toMatch(/disableIpTracking: true` must NOT be set/)
  })
})
