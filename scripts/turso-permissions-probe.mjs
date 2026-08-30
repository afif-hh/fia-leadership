/**
 * Probe: does the libSQL engine that @libsql/client reaches actually enforce
 * fine-grained table-level permissions?
 *
 * Settles the experiment in issue #31. Documentation cannot answer it — see
 * docs/architecture/research/turso-fine-grained-tokens.md, which found that
 * tursodatabase/libsql carries no table-level permission machinery and that its
 * merge_legacy(None, None) path treats unrecognised claims as FullAccess. That is
 * a fail-open path, so a negative result here is plausible and the probe is built
 * to catch it.
 *
 * The thing being tested is NOT "are some writes denied". It is "does any write
 * that should have been denied succeed". A permission system that denies four
 * statements and quietly allows a fifth is not a security control, and the report
 * below treats one unexpected success as a failure of the whole mechanism.
 *
 * Usage:
 *   TURSO_URL=libsql://<db>-<org>.turso.io \
 *   TURSO_ADMIN_TOKEN=<full-access token> \
 *   TURSO_SCOPED_TOKEN=<token minted with -p probe_audit:data_read,data_add> \
 *   node scripts/turso-permissions-probe.mjs
 *
 * Requires @libsql/client. Run it from a throwaway directory if you do not want
 * the dependency in this repo yet — the database decision is still under review
 * in #33.
 */

import { createClient } from '@libsql/client'

const { TURSO_URL, TURSO_ADMIN_TOKEN, TURSO_SCOPED_TOKEN } = process.env

for (const [name, value] of Object.entries({ TURSO_URL, TURSO_ADMIN_TOKEN, TURSO_SCOPED_TOKEN })) {
  if (!value) {
    console.error(`Missing ${name}. See the usage block at the top of this file.`)
    process.exit(2)
  }
}

if (!TURSO_URL.startsWith('libsql://') && !TURSO_URL.startsWith('https://')) {
  console.error(`TURSO_URL must be a remote libsql:// or https:// URL, got ${TURSO_URL}.`)
  console.error('A local file: database has no authorization layer at all, so it cannot test this.')
  process.exit(2)
}

const admin = createClient({ url: TURSO_URL, authToken: TURSO_ADMIN_TOKEN })
const scoped = createClient({ url: TURSO_URL, authToken: TURSO_SCOPED_TOKEN })

/** Captures the full error shape. #27 found extendedCode is undefined over HTTP. */
function shapeOf(err) {
  return {
    name: err?.name ?? null,
    code: err?.code ?? null,
    extendedCode: err?.extendedCode ?? null,
    rawCode: err?.rawCode ?? null,
    message: (err?.message ?? String(err)).replace(/\s+/g, ' ').slice(0, 240),
  }
}

async function attempt(client, sql) {
  try {
    const r = await client.execute(sql)
    return { ok: true, rowsAffected: r.rowsAffected ?? null }
  } catch (err) {
    return { ok: false, error: shapeOf(err) }
  }
}

// ---------------------------------------------------------------------------
// Setup, with the full-access token. Torn down at the end.
// ---------------------------------------------------------------------------

const SETUP = [
  'DROP TRIGGER IF EXISTS probe_audit_no_update',
  'DROP TRIGGER IF EXISTS probe_audit_no_delete',
  'DROP TRIGGER IF EXISTS probe_fanout',
  'DROP TABLE IF EXISTS probe_audit',
  'DROP TABLE IF EXISTS probe_unrelated',
  'DROP TABLE IF EXISTS probe_fanout_target',
  'CREATE TABLE probe_audit (id INTEGER PRIMARY KEY, event TEXT NOT NULL UNIQUE, note TEXT)',
  'CREATE TABLE probe_unrelated (id INTEGER PRIMARY KEY, secret TEXT)',
  'CREATE TABLE probe_fanout_target (id INTEGER PRIMARY KEY, copied TEXT)',
  "INSERT INTO probe_audit (id, event, note) VALUES (1, 'seed', 'original')",
  "INSERT INTO probe_unrelated (id, secret) VALUES (1, 'should-not-be-readable')",
  // Writes into a table the scoped token has no grant on, triggered by an insert
  // the token IS allowed to make. If permissions are enforced per statement but
  // not per trigger-initiated write, this is the hole it slips through.
  `CREATE TRIGGER probe_fanout AFTER INSERT ON probe_audit
   BEGIN INSERT INTO probe_fanout_target (copied) VALUES (NEW.event); END`,
]

console.log('# Turso fine-grained permission probe\n')
console.log(`database: ${TURSO_URL}\n`)
console.log('## Setup (full-access token)\n')
for (const sql of SETUP) {
  const r = await attempt(admin, sql)
  if (!r.ok) {
    console.log(`FAILED  ${sql}`)
    console.log(`        ${JSON.stringify(r.error)}`)
    console.error('\nSetup failed. Nothing below is meaningful; fix this first.')
    process.exit(1)
  }
}
console.log('all setup statements succeeded\n')

// ---------------------------------------------------------------------------
// The probes, with the scoped token: probe_audit:data_read,data_add
// ---------------------------------------------------------------------------

/** expect: 'allow' means the grant covers it; 'deny' means it must be rejected. */
const PROBES = [
  { expect: 'allow', label: 'SELECT on granted table', sql: 'SELECT * FROM probe_audit' },
  {
    expect: 'allow',
    label: 'INSERT on granted table',
    sql: "INSERT INTO probe_audit (event) VALUES ('probe-insert')",
  },
  { expect: 'deny', label: 'UPDATE', sql: "UPDATE probe_audit SET note = 'mutated' WHERE id = 1" },
  { expect: 'deny', label: 'DELETE', sql: 'DELETE FROM probe_audit WHERE id = 1' },
  { expect: 'deny', label: 'DROP TABLE', sql: 'DROP TABLE probe_audit' },
  { expect: 'deny', label: 'ALTER TABLE', sql: 'ALTER TABLE probe_audit ADD COLUMN sneaky TEXT' },
  // The three holes #27 named as unverified. Each is an UPDATE wearing an INSERT's
  // clothes; if the check is syntactic rather than semantic, these get through.
  {
    expect: 'deny',
    label: 'INSERT … ON CONFLICT DO UPDATE',
    sql: "INSERT INTO probe_audit (id, event, note) VALUES (1, 'seed', 'via-upsert') ON CONFLICT(event) DO UPDATE SET note = 'via-upsert'",
  },
  {
    expect: 'deny',
    label: 'REPLACE INTO',
    sql: "REPLACE INTO probe_audit (id, event, note) VALUES (1, 'seed', 'via-replace')",
  },
  {
    expect: 'deny',
    label: 'trigger-initiated write to ungranted table',
    sql: "INSERT INTO probe_audit (event) VALUES ('fanout-probe')",
  },
  { expect: 'deny', label: 'SELECT on ungranted table', sql: 'SELECT * FROM probe_unrelated' },
  {
    expect: 'allow',
    label: 'SELECT on sqlite_master (always granted per docs)',
    sql: 'SELECT name FROM sqlite_master LIMIT 1',
  },
]

console.log('## Probes (scoped token: probe_audit:data_read,data_add)\n')

const results = []
for (const p of PROBES) {
  const r = await attempt(scoped, p.sql)
  const verdict = r.ok
    ? p.expect === 'allow'
      ? 'OK'
      : 'UNEXPECTED SUCCESS'
    : p.expect === 'deny'
      ? 'OK (denied)'
      : 'UNEXPECTED DENIAL'
  results.push({ ...p, ...r, verdict })
  console.log(`${verdict.padEnd(20)} ${p.label}`)
  if (!r.ok) console.log(`${''.padEnd(20)} ${JSON.stringify(r.error)}`)
}

// The trigger-initiated write needs a second look: the INSERT succeeding is
// correct, so the question is whether its side effect landed in the table the
// token has no grant on.
let fanoutRows = null
try {
  const r = await admin.execute('SELECT COUNT(*) AS n FROM probe_fanout_target')
  fanoutRows = Number(r.rows[0]?.n ?? 0)
} catch (err) {
  console.log(`could not read the trigger target table: ${shapeOf(err).message}`)
}
console.log(`\ntrigger side-effect rows in the ungranted table: ${fanoutRows}`)
console.log(
  fanoutRows
    ? '  -> a trigger wrote into a table the token has no grant on'
    : '  -> no trigger-initiated write landed'
)

// ---------------------------------------------------------------------------
// Does RAISE(ABORT) work here? This is the fallback mechanism if tokens do not
// enforce anything, so it needs its own answer either way. Tested with the
// admin token, since the point is engine support, not authorization.
// ---------------------------------------------------------------------------

console.log('\n## RAISE(ABORT) trigger as the append-only fallback\n')
const trig = await attempt(
  admin,
  `CREATE TRIGGER probe_audit_no_update BEFORE UPDATE ON probe_audit
  BEGIN SELECT RAISE(ABORT, 'probe_audit is append-only'); END`
)
console.log(`CREATE TRIGGER accepted: ${trig.ok}`)
if (!trig.ok) console.log(`  ${JSON.stringify(trig.error)}`)

let enforced = null
if (trig.ok) {
  const blocked = await attempt(
    admin,
    "UPDATE probe_audit SET note = 'trigger-should-block' WHERE id = 1"
  )
  enforced = !blocked.ok
  console.log(`UPDATE blocked by trigger: ${enforced}`)
  if (!blocked.ok) console.log(`  ${JSON.stringify(blocked.error)}`)
  else
    console.log('  -> the trigger was accepted but NOT enforced; the fallback does not work either')
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

const unexpectedSuccesses = results.filter((r) => r.verdict === 'UNEXPECTED SUCCESS')
console.log('\n## Verdict\n')
if (unexpectedSuccesses.length === 0 && fanoutRows === 0) {
  console.log('Fine-grained tokens ARE enforced on this engine. Every write outside the')
  console.log('grant was rejected, including the upsert, replace, and trigger paths.')
} else {
  console.log('Fine-grained tokens are NOT a security control on this engine.')
  console.log('The following should have been denied and were not:')
  for (const r of unexpectedSuccesses) console.log(`  - ${r.label}`)
  if (fanoutRows) console.log('  - a trigger wrote into a table the token has no grant on')
}
console.log(
  `\nRAISE(ABORT) fallback usable: ${enforced === null ? 'unknown (CREATE TRIGGER failed)' : enforced}`
)

console.log('\n## Teardown\n')
for (const sql of [
  'DROP TRIGGER IF EXISTS probe_audit_no_update',
  'DROP TRIGGER IF EXISTS probe_fanout',
  'DROP TABLE IF EXISTS probe_audit',
  'DROP TABLE IF EXISTS probe_unrelated',
  'DROP TABLE IF EXISTS probe_fanout_target',
])
  await attempt(admin, sql)
console.log('done')
