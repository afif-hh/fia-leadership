import { describe, expect, it } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { asAuditEventType } from '../../domain/platform/audit'
import { IDENTITY_AUDIT_EVENT_TYPES, identityAuditDetail } from '../../domain/identity/audit-events'

const DOMAIN_DIR = join(process.cwd(), 'server', 'domain')

describe('audit detail validation', () => {
  it('accepts a declared event', () => {
    expect(() =>
      identityAuditDetail.parse({
        event_type: 'identity.role_change',
        before: [],
        after: ['lab_admin'],
      })
    ).not.toThrow()
  })

  /**
   * The criterion from issue #28, and the reason `zod/mini`'s strictObject is mandatory here: a
   * plain `z.object()` would *strip* an unknown key, so a stray PII field would never reach the
   * row but the attempt to log it would be invisible. On an append-only table there is no UPDATE
   * to remove a leak afterwards, so the attempt has to be loud.
   */
  it('REJECTS an undeclared key rather than silently stripping it', () => {
    let threw = false
    let result: unknown
    try {
      result = identityAuditDetail.parse({
        event_type: 'identity.role_change',
        before: [],
        after: ['lab_admin'],
        answer_value: 4,
      })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
    expect(result).toBeUndefined()
  })

  it('rejects an undeclared event type', () => {
    expect(() =>
      identityAuditDetail.parse({ event_type: 'identity.not_a_thing', before: [], after: [] })
    ).toThrow()
  })

  it('rejects an unknown role code inside the detail', () => {
    expect(() =>
      identityAuditDetail.parse({
        event_type: 'identity.role_change',
        before: [],
        after: ['superuser'],
      })
    ).toThrow()
  })
})

describe('the event-type registry', () => {
  it('brands only well-formed dotted event types', () => {
    expect(asAuditEventType('identity.role_change')).toBe('identity.role_change')
    for (const bad of ['role_change', 'Identity.X', 'identity.', 'ab', 'identity.role-change']) {
      expect(() => asAuditEventType(bad)).toThrow()
    }
  })

  it('matches every declared identity event against the format the database enforces', () => {
    for (const value of IDENTITY_AUDIT_EVENT_TYPES) {
      expect(() => asAuditEventType(value)).not.toThrow()
    }
  })

  /**
   * Each domain owns its own vocabulary (issue #28 amendment). This is what makes the convention
   * enforced rather than merely intended: every value's prefix must equal the folder declaring it,
   * and no two domains may declare the same value.
   */
  it('gives every event type a prefix matching its owning domain folder, uniquely', async () => {
    const entries = await readdir(DOMAIN_DIR, { withFileTypes: true })
    const seen = new Map<string, string>()

    for (const entry of entries.filter((e) => e.isDirectory())) {
      const file = join(DOMAIN_DIR, entry.name, 'audit-events.ts')
      let source: string
      try {
        source = await readFile(file, 'utf8')
      } catch {
        continue
      }

      const values = [...source.matchAll(/'([a-z][a-z_]*\.[a-z][a-z_]*)'/g)]
        .map((m) => m[1])
        .filter((v): v is string => v !== undefined)
      // A value legitimately appears more than once in a file — in the const array and again in
      // its z.literal discriminator. Uniqueness is a cross-domain property, not a per-file one.
      const declared = [...new Set(values.filter((v) => v.includes('.')))]
      expect(declared.length, `${entry.name} declares no audit events`).toBeGreaterThan(0)

      for (const value of declared) {
        const [prefix] = value.split('.')
        expect(prefix, `${value} declared in ${entry.name}/`).toBe(entry.name)
        const previous = seen.get(value)
        expect(previous, `${value} declared in both ${previous} and ${entry.name}`).toBeUndefined()
        seen.set(value, entry.name)
      }
    }

    expect(seen.size).toBeGreaterThan(0)
  })
})

/**
 * Comments are stripped before scanning. Without this, prose describing the very pattern being
 * forbidden — including the comment in platform/audit.ts explaining why no such method exists —
 * trips the scan. A source-scan test that cannot survive being documented is not much use.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('the append-only interface', () => {
  /**
   * A compensating control required alongside the triggers (issues #34 and #37): the triggers stop
   * an attempted write; the absence of a method stops one from being written. This scans source
   * rather than types, because a cast can defeat the type.
   */
  it('has no update or delete of audit_logs anywhere in server/', async () => {
    const offenders: string[] = []

    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(path)
          continue
        }
        if (!entry.name.endsWith('.ts')) continue
        const source = stripComments(await readFile(path, 'utf8'))
        if (/\.update\(\s*auditLogs\s*\)|\.delete\(\s*auditLogs\s*\)/.test(source)) {
          offenders.push(path)
        }
      }
    }

    await walk(join(process.cwd(), 'server'))
    // The tests themselves assert rejection through raw SQL, never through Drizzle's builders.
    expect(offenders.filter((p) => !p.includes('/tests/'))).toEqual([])
  })

  it('writes only through roles.ts inside the identity domain', async () => {
    const offenders: string[] = []
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(path)
          continue
        }
        if (!entry.name.endsWith('.ts')) continue
        if (path.includes('/tests/')) continue
        if (path.endsWith(join('domain', 'identity', 'roles.ts'))) continue
        const source = stripComments(await readFile(path, 'utf8'))
        if (/\.(insert|update|delete)\(\s*identityUserRoles\s*\)/.test(source)) {
          offenders.push(path)
        }
      }
    }
    await walk(join(process.cwd(), 'server'))
    expect(offenders).toEqual([])
  })
})
