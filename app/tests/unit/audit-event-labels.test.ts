import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { message, type Locale } from '../support/messages'

/**
 * The lever for the audit log's event names (FR-011).
 *
 * The filter renders each event type through `dashboard.audit.eventTypes.<domain>.<action>`, built
 * from the code at runtime. `translations.test.ts` cannot see that: it scans for `t('literal')`, and
 * a key assembled from a variable is invisible to it. So the one place the message files are read
 * dynamically is the one place their completeness was unenforced, and an unlabelled event would
 * simply render as `assessment.version_published` to an admin in both languages.
 *
 * The vocabulary is deliberately not centralised — each domain declares its own in
 * `server/domain/<domain>/audit-events.ts` (issue #28 and its amendment). This reads those
 * declarations the same way `audit-detail.test.ts` does, so a domain adding an audited action is
 * told to add its two sentences instead of discovering the gap in production.
 */

const DOMAIN_DIR = resolve(import.meta.dirname, '../../../server/domain')

function declaredEventTypes(): string[] {
  const found = new Set<string>()

  for (const entry of readdirSync(DOMAIN_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    let source: string
    try {
      source = readFileSync(join(DOMAIN_DIR, entry.name, 'audit-events.ts'), 'utf-8')
    } catch {
      continue
    }
    for (const match of source.matchAll(/'([a-z][a-z_]*\.[a-z][a-z_]*)'/g)) {
      if (match[1]) found.add(match[1])
    }
  }

  return [...found].sort()
}

describe('every audit event type', () => {
  it('is declared by some domain, so this test is looking at something', () => {
    expect(declaredEventTypes().length).toBeGreaterThan(0)
  })

  it('reads as a sentence in both languages, not as its code', () => {
    const missing: string[] = []

    for (const code of declaredEventTypes()) {
      for (const locale of ['id', 'en'] as Locale[]) {
        if (message(locale, `dashboard.audit.eventTypes.${code}`) === undefined) {
          missing.push(`${locale}: dashboard.audit.eventTypes.${code}`)
        }
      }
    }

    expect(missing, 'add these to i18n/locales/, nested by domain then action').toEqual([])
  })
})
