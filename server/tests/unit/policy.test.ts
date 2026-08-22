import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import {
  ACTIONS,
  CELL_TOKENS,
  MATRIX,
  RESOURCES,
  RESOURCE_LABELS,
  ROLE_CODES,
  SCOPE_PREDICATES,
  ScopeNotImplementedError,
  authorize,
  interpret,
  resolveScope,
  type CellToken,
  type Resource,
} from '../../domain/identity/policy.ts'

const repoRoot = new URL('../../../', import.meta.url)

/**
 * Parses the access matrix out of docs/security/rbac.md.
 *
 * Reading the rendered table rather than keeping a transcription is the point: a transcription is
 * a second copy that can drift silently, whereas this fails the moment the document and the code
 * disagree — in either direction.
 */
async function parseMatrixFromDoc() {
  const source = await readFile(new URL('docs/security/rbac.md', repoRoot), 'utf8')
  const lines = source.split('\n')

  const headerIndex = lines.findIndex((l) => l.startsWith('| Resource |'))
  expect(headerIndex, 'access matrix header not found in rbac.md').toBeGreaterThan(-1)

  const cells = (line: string) =>
    line.split('|').slice(1, -1).map((c) => c.trim())

  const header = cells(lines[headerIndex]!).slice(1)

  const rows: Record<string, Record<string, string>> = {}
  for (let i = headerIndex + 2; i < lines.length; i++) {
    const line = lines[i]!
    if (!line.startsWith('|')) break
    const [label, ...values] = cells(line)
    rows[label!] = Object.fromEntries(header.map((role, j) => [role, values[j]!]))
  }
  return { header, rows }
}

/** rbac.md's column headings, in order, mapped to the schema's role codes. */
const COLUMN_TO_ROLE: Record<string, string> = {
  Student: 'student',
  'Lecturer/Coach': 'lecturer_coach',
  'Lab Admin': 'lab_admin',
  'Academic Lead': 'academic_lead',
  Researcher: 'researcher',
  'Faculty Executive': 'faculty_executive',
  'External Partner': 'external_partner',
}

describe('parity with docs/security/rbac.md', () => {
  it('has the same nine resources as the document, in the same order', async () => {
    const { rows } = await parseMatrixFromDoc()
    expect(Object.keys(rows)).toEqual(RESOURCES.map((r) => RESOURCE_LABELS[r]))
  })

  it('has the same seven roles as the document', async () => {
    const { header } = await parseMatrixFromDoc()
    expect(header.map((h) => COLUMN_TO_ROLE[h])).toEqual([...ROLE_CODES])
  })

  it('matches the document on all 63 cells', async () => {
    const { rows } = await parseMatrixFromDoc()

    let compared = 0
    for (const resource of RESOURCES) {
      for (const role of ROLE_CODES) {
        const label = RESOURCE_LABELS[resource]
        const column = Object.keys(COLUMN_TO_ROLE).find((k) => COLUMN_TO_ROLE[k] === role)!
        expect(rows[label]?.[column], `${label} / ${column}`).toBe(MATRIX[resource][role])
        compared++
      }
    }

    // Asserted rather than assumed: a loop over an empty RESOURCES would otherwise pass silently.
    expect(compared).toBe(63)
  })

  it('uses only tokens the interpreter knows', async () => {
    const { rows } = await parseMatrixFromDoc()
    for (const [label, byRole] of Object.entries(rows)) {
      for (const [column, token] of Object.entries(byRole)) {
        expect(CELL_TOKENS, `${label} / ${column} = ${JSON.stringify(token)}`).toContain(token)
      }
    }
  })
})

describe('interpretation', () => {
  it('gives every token a decision for every action', () => {
    for (const token of CELL_TOKENS) {
      for (const action of ACTIONS) {
        expect(['allow', 'deny', 'scoped']).toContain(interpret(token as CellToken, action))
      }
    }
  })

  it('expands CRUD to exactly the four data actions, not approve or draft', () => {
    expect(ACTIONS.filter((a) => interpret('CRUD', a) === 'allow')).toEqual([
      'create', 'read', 'update', 'delete',
    ])
  })

  it('keeps Draft and Approve distinct, because the Scoring Rules row depends on it', () => {
    expect(interpret('Draft', 'draft')).toBe('allow')
    expect(interpret('Draft', 'approve')).toBe('deny')
    expect(interpret('Approve', 'approve')).toBe('allow')
    expect(interpret('Approve', 'draft')).toBe('deny')
    // The row itself: Lab Admin drafts, Academic Lead approves, and neither does the other.
    expect(authorize(['lab_admin'], 'scoringRules', 'draft')).toBe('allow')
    expect(authorize(['lab_admin'], 'scoringRules', 'approve')).toBe('deny')
    expect(authorize(['academic_lead'], 'scoringRules', 'approve')).toBe('allow')
    expect(authorize(['academic_lead'], 'scoringRules', 'draft')).toBe('deny')
  })

  it('treats every restricted token as a scoped read and nothing else', () => {
    for (const token of ['R*', 'Own cohort', 'Own actions'] as const) {
      expect(interpret(token, 'read')).toBe('scoped')
      for (const action of ACTIONS.filter((a) => a !== 'read')) {
        expect(interpret(token, action)).toBe('deny')
      }
    }
  })

  it('never lets a scoped cell resolve to allow without a predicate', () => {
    // The failure this design exists to prevent: a scoped cell answered by table lookup.
    for (const resource of RESOURCES) {
      for (const role of ROLE_CODES) {
        if (['R*', 'Own cohort', 'Own actions'].includes(MATRIX[resource][role])) {
          expect(authorize([role], resource, 'read')).not.toBe('allow')
        }
      }
    }
  })
})

describe('authorize across multiple roles', () => {
  it('lets the strongest role win', () => {
    // researcher alone is scoped on the aggregate dashboard; faculty_executive is an outright R.
    expect(authorize(['researcher'], 'aggregateDashboard', 'read')).toBe('scoped')
    expect(authorize(['researcher', 'faculty_executive'], 'aggregateDashboard', 'read')).toBe('allow')
  })

  it('does not let a scoped role downgrade an allow', () => {
    expect(authorize(['faculty_executive', 'researcher'], 'aggregateDashboard', 'read')).toBe('allow')
  })

  it('denies when no role is held at all', () => {
    for (const resource of RESOURCES) {
      for (const action of ACTIONS) {
        expect(authorize([], resource, action)).toBe('deny')
      }
    }
  })
})

describe('the ninth resource', () => {
  it('lets Lab Admin administer users and Academic Lead only read', () => {
    expect(authorize(['lab_admin'], 'userAdministration', 'update')).toBe('allow')
    expect(authorize(['lab_admin'], 'userAdministration', 'delete')).toBe('allow')
    expect(authorize(['academic_lead'], 'userAdministration', 'read')).toBe('allow')
    expect(authorize(['academic_lead'], 'userAdministration', 'update')).toBe('deny')
  })

  it('denies it to everyone else', () => {
    for (const role of ROLE_CODES) {
      if (role === 'lab_admin' || role === 'academic_lead') continue
      for (const action of ACTIONS) {
        expect(authorize([role], 'userAdministration', action), role).toBe('deny')
      }
    }
  })
})

describe('scope predicates', () => {
  const scopedResources = RESOURCES.filter((r) =>
    ROLE_CODES.some((role) => ['R*', 'Own cohort', 'Own actions'].includes(MATRIX[r][role]))
  )

  it('identifies exactly the resources the document marks as restricted', () => {
    expect(scopedResources.sort()).toEqual(
      [
        'aggregateDashboard',
        'assignedStudentDetail',
        'auditLog',
        'ownAssessment',
        'researchExport',
      ].sort()
    )
  })

  it('throws rather than deciding when a predicate is not implemented', async () => {
    const unimplemented = scopedResources.filter((r) => !SCOPE_PREDICATES[r])
    expect(unimplemented.length, 'expected some resources to be out of this map').toBeGreaterThan(0)

    for (const resource of unimplemented) {
      await expect(
        resolveScope(resource as Resource, {
          db: null as never,
          principal: { userId: 'u1', email: '', roles: [], sessionId: 's1', status: 'active' },
          target: {},
        })
      ).rejects.toBeInstanceOf(ScopeNotImplementedError)
    }
  })

  it('refuses an audit-log scope with no target rather than guessing', async () => {
    const allowed = await resolveScope('auditLog', {
      db: null as never,
      principal: { userId: 'u1', email: '', roles: ['student'], sessionId: 's1', status: 'active' },
      target: {},
    })
    expect(allowed).toBe(false)
  })

  it("refuses an audit-log scope targeting somebody else's actions", async () => {
    const allowed = await resolveScope('auditLog', {
      db: null as never,
      principal: { userId: 'u1', email: '', roles: ['student'], sessionId: 's1', status: 'active' },
      target: { actorUserId: 'someone-else' },
    })
    expect(allowed).toBe(false)
  })
})

describe('the wrapper is the only way into server/api/v1', () => {
  it('has no raw defineEventHandler under server/api/v1/**', async () => {
    const root = fileURLToPath(new URL('server/api/v1', repoRoot))
    const offenders: string[] = []

    async function walk(dir: string): Promise<void> {
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return // no v1 routes yet; the guard is in place for when there are
      }
      for (const entry of entries) {
        const path = `${dir}/${entry.name}`
        if (entry.isDirectory()) await walk(path)
        else if (entry.name.endsWith('.ts')) {
          const source = await readFile(path, 'utf8')
          if (/\bdefineEventHandler\s*\(/.test(source)) offenders.push(path)
        }
      }
    }

    await walk(root)

    // This grep is the ONLY control catching a deliberately unwrapped handler. definePolicyHandler
    // makes omission impossible, not bypass: a hand-written defineEventHandler still compiles, and
    // the deny-by-default backstop middleware that would have caught it at runtime was declined
    // (issue #20). If this test is ever weakened, that decision has to be revisited with it.
    expect(offenders).toEqual([])
  })
})
