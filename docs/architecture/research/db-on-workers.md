---
id: research-db-on-workers
title: "Research: Database on Cloudflare Workers — D1, Turso/libSQL, or Postgres over Hyperdrive?"
audience: both
load_when: "memutuskan atau meninjau ulang pilihan database untuk deployment Cloudflare Workers, atau menulis ADR turunannya"
status: research (not yet an approved ADR)
issue: "#16"
---

# Database on Cloudflare Workers: D1, Turso/libSQL, or Postgres (Supabase) over Hyperdrive?

## The question

Cloudflare Workers is settled as the deploy target (Nitro `cloudflare_module` preset). This
document does not revisit that. It answers only: **which database does Drizzle ORM talk to, and
what does each option cost?**

Three candidates:

- **Cloudflare D1** — Cloudflare-native SQLite, accessed through a Worker binding.
- **Turso / libSQL** — a SQLite fork reached over HTTP, via `@libsql/client` and
  `drizzle-orm/libsql`. This is the option the ticket owner prefers, so it is treated here as the
  leading candidate that has to be disproven.
- **PostgreSQL (Supabase) over Cloudflare Hyperdrive** — what the repo's documents currently
  mandate.

The tension is concrete. This repo's own documents mandate PostgreSQL and build the entire
domain-boundary story on Postgres schemas:

- `docs/product/PRD.md` §2 Stack Wajib: "**PostgreSQL 15+** — Multi-schema, 1 schema per domain.
  JSONB hanya untuk metadata fleksibel." Test runner: "Vitest — Unit, integration
  (**test-container Postgres**)".
- `docs/architecture/patterns.md`, Aturan Boundary point 4: "Satu Postgres schema per domain,
  dideklarasikan dengan `pgSchema('<domain>')` di `server/db/schema/<domain>.ts`", and point 2:
  "**Tidak ada akses langsung ke tabel domain lain** … tidak ada join lintas schema di repository."
- `docs/data/data-dictionary.md` relies on Postgres `enum` for `sessions.status`,
  `assessment_versions.status`, `scores.score_type`; `jsonb` for `profile_snapshots.payload`;
  `numeric` for `scores.score_value`; and requires `audit_logs` be **append-only**.

Both SQLite options — D1 and Turso — lose `pgSchema`, `jsonb`, `enum`, and exact-precision
`numeric`. So the choice is not cosmetic.

Environment as of writing: `nuxt@4.5.2` → `nitropack@2.13.4` (Nitro **v2**), `vitest@4.1.11`,
`compatibilityDate: '2025-07-15'`, no `server/` directory yet, no Drizzle installed yet. That last
point matters: **nothing has been built on the Postgres assumption yet**, so this is the cheapest
moment to decide.

---

## 1. Driver viability under the Nitro Cloudflare preset

### 1a. All three are viable. None is blocked.

Nitro v2's Cloudflare page documents the preset and, importantly, how to reach bindings at
runtime: "In runtime, you can access bindings from the request event, by accessing its
`context.cloudflare.env` field, this is for example how you can access a D1 bindings"
([Nitro v2 docs, `docs/2.deploy/20.providers/cloudflare.md`](https://github.com/nitrojs/nitro/blob/v2/docs/2.deploy/20.providers/cloudflare.md)):

```ts
defineEventHandler(async (event) => {
  const { cloudflare } = event.context
  const stmt = await cloudflare.env.MY_D1.prepare('SELECT id FROM table')
  const { results } = await stmt.all()
})
```

Note the shape difference from the Nitro **v3** docs, which show
`event.req.runtime.cloudflare.env` instead
([nitro.build/deploy/providers/cloudflare](https://nitro.build/deploy/providers/cloudflare)).
This repo is on Nitro v2, so `event.context.cloudflare.env` is the correct form today, and this
is a known migration point when Nuxt moves to Nitro v3.

Preset configuration for Nuxt, per the same Nitro v2 page:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: { deployConfig: true, nodeCompat: true },
  },
})
```

`deployConfig: true` makes Nitro generate `wrangler.json`; bindings can be declared either in your
own `wrangler.json`/`wrangler.toml` (Nitro merges it) or inline under
`cloudflare: { wrangler: {} }`. Nitro also has a **dev preset** (Nitro ≥ 2.12, `wrangler` installed
as a devDependency) so that `nuxt dev` runs under Cloudflare emulation and bindings are available
locally. Turso needs none of this binding machinery — it is reached over `fetch` with a URL and a
token — but the preset and dev-preset configuration is identical either way.

### 1b. D1 — `drizzle-orm/d1`

Works, and is a first-class Drizzle driver
([Drizzle: Cloudflare D1](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1)):

```ts
import { drizzle } from 'drizzle-orm/d1'
// inside a Nitro event handler, on Nitro v2:
const db = drizzle(event.context.cloudflare.env.DB, { schema })
```

Binding (`wrangler.json`), per the same page:

```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "fia_leadership",
      "database_id": "<id>",
      "migrations_dir": "server/db/migrations"
    }
  ]
}
```

Migrations run through `drizzle-kit` with `dialect: 'sqlite'`, `driver: 'd1-http'` against
Cloudflare's HTTP API
([Drizzle: Get started with D1](https://orm.drizzle.team/docs/get-started/d1-new)). No
`nodejs_compat` needed — D1 is a native binding, not a TCP driver.

### 1c. Turso / libSQL — `drizzle-orm/libsql`

Works on Workers, and Turso says so directly. Its TypeScript reference lists the "runtime
environments … known to be compatible" as "Node.js version 12 or later, Deno, **CloudFlare
Workers**, Netlify & Vercel Edge Functions"
([Turso TypeScript reference](https://docs.turso.tech/sdk/ts/reference)).

The entrypoint matters. `@libsql/client` defaults to the Node build (native SQLite bindings);
Workers must use the Web build. Turso's Drizzle guide gives both shapes side by side, labelled
"Node.js / Serverless" and "Edge Runtimes"
([Drizzle + Turso](https://docs.turso.tech/sdk/ts/orm/drizzle.md)):

```ts
// Workers / edge
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client/web'

const turso = createClient({
  url: config.tursoDatabaseUrl,     // libsql://<db>-<org>.turso.io
  authToken: config.tursoAuthToken,
})
export const db = drizzle(turso, { schema })
```

Drizzle also ships pre-wired subpaths — `drizzle-orm/libsql/web`, `/node`, `/http`, `/ws`,
`/sqlite3`, `/wasm` — where `libsql/web` imports `createClient` from `@libsql/client/web` for you
([`drizzle-orm/src/libsql/web/index.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/libsql/web/index.ts)).

Because the client is just a `fetch` wrapper, it can be constructed per request or hoisted; there
is no connection to keep alive. Credentials come from `runtimeConfig` (Turso's own Nuxt guide uses
exactly this pattern, [Nuxt + Turso](https://docs.turso.tech/sdk/ts/guides/nuxt.md)) and are
Workers secrets in production — no binding needed.

`drizzle-kit` uses `dialect: 'turso'` with `url` + `authToken`
([Drizzle + Turso](https://docs.turso.tech/sdk/ts/orm/drizzle.md)), so
`drizzle-kit generate` / `drizzle-kit migrate` run from CI against the deployed database over
HTTPS with nothing but an auth token — notably simpler than D1's `d1-http` driver and simpler than
opening a Postgres port to CI.

One caveat that is not a caveat: the client's default `concurrency` is 20 in-flight requests
([reference](https://docs.turso.tech/sdk/ts/reference)), which is per client instance and
irrelevant at this scale.

### 1d. Postgres over Hyperdrive

Hyperdrive supports the mainstream Postgres drivers. The
[Connect to Postgres](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)
page lists a "Supported drivers" table: **node-postgres `pg@8.13.0` (recommended)**,
**Postgres.js `postgres@3.4.4`**, **Drizzle `0.26.2^`**, Kysely, rust-postgres. It notes
"Hyperdrive uses Workers [TCP socket support] to support TCP connections to databases."

Documented caveats that matter:

- **`nodejs_compat` is required.** "Node.js compatibility is required for database drivers" with
  `compatibility_date` of 2024-09-23 or later
  ([Hyperdrive: Get started](https://developers.cloudflare.com/hyperdrive/get-started/)). In Nitro
  that is `cloudflare: { nodeCompat: true }`.
- **If you pick Postgres.js, keep `prepare: true`.** "This may happen if you are using the
  Postgres.js driver with `prepare: false`. To resolve this, enable prepared statements with
  `prepare: true`"
  ([Hyperdrive troubleshooting](https://developers.cloudflare.com/hyperdrive/observability/troubleshooting/)) —
  otherwise query caching silently stops working.
- **SQL-level prepared-statement management is unsupported**: "SQL-level management of prepared
  statements, such as using `PREPARE`, `DISCARD`, `DEALLOCATE`, or `EXECUTE`", plus advisory locks,
  `LISTEN`/`NOTIFY`, and "any modification to per-session state not explicitly documented as
  supported elsewhere"
  ([Supported databases and features](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/)).
  Drizzle uses none of these for ordinary queries or migrations. Transactions are **not** on the
  unsupported list.

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'

const client = new Client({ connectionString: event.context.cloudflare.env.HYPERDRIVE.connectionString })
await client.connect()
const db = drizzle(client, { schema })
```

Recommendation within this option: **`node-postgres` (`pg`)**, because Cloudflare marks it
"(recommended)" and it avoids the `prepare: false` caching footgun. The client must be built
per event, not as a module singleton; Hyperdrive is what makes that cheap, since it "maintains
underlying connection pools" ([Hyperdrive overview](https://developers.cloudflare.com/hyperdrive/)).

---

## 2. The same driver against a local file — the ticket owner's decisive claim

**Verdict: substantially confirmed, with one correction that matters.**

Confirmed: `@libsql/client` accepts a `file:` URL. Turso's reference, under "Local Development":
"You can work locally using an SQLite file and passing the path to `createClient`", with
`url: "file:path/to/db-file.db"`
([Turso TypeScript reference](https://docs.turso.tech/sdk/ts/reference)). `:memory:` is likewise
supported. The `@libsql/client` README's own quickstart uses `url: "file:local.db"`
([libsql-client-ts README](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/README.md)).

Corrected: **the Workers-targeted entrypoint cannot open a file.** Turso documents this as a
warning — "The `@libsql/client/web` does not support local file URLs"
([reference](https://docs.turso.tech/sdk/ts/reference)) — and the source is unambiguous. In
[`packages/libsql-client/src/web.ts`](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/web.ts):

```ts
export function _createClient(config: ExpandedConfig): Client {
  if (config.scheme === "ws" || config.scheme === "wss") {
    return _createWsClient(config);
  } else if (config.scheme === "http" || config.scheme === "https") {
    return _createHttpClient(config);
  } else {
    throw new LibsqlError(
      'The client that uses Web standard APIs supports only "libsql:", "wss:", "ws:", "https:" and "http:" URLs, ' +
        `got ${JSON.stringify(config.scheme + ":")}. …`,
      "URL_SCHEME_NOT_SUPPORTED",
    );
  }
}
```

whereas [`node.ts`](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/node.ts)
falls through to `_createSqlite3Client(config)` for any non-ws/http scheme — that is the branch
that opens a file.

So the accurate version of the claim is: **the same Drizzle code, the same schema files, the same
migrations, and the same repository/service layer run against both targets; only the
`createClient` import differs by environment.** `drizzle(client, { schema })` is
environment-agnostic — Drizzle's libSQL driver takes any `@libsql/client` `Client` — so the swap is
one line, typically behind a factory:

```ts
// server/db/client.ts
export function createDb(env: Env) {
  const client = import.meta.dev || process.env.VITEST
    ? nodeCreateClient({ url: 'file:./.data/dev.db' })   // from '@libsql/client'
    : webCreateClient({ url: env.TURSO_URL, authToken: env.TURSO_TOKEN }) // from '@libsql/client/web'
  return drizzle(client, { schema })
}
```

This is genuinely valuable and it does resolve the integration-testing question: Vitest runs in
Node, so tests can use the Node entrypoint against a real file or `:memory:` database, with no
Docker, no Miniflare, and no separate Workers test pool. Migrations apply to both: `drizzle-kit`
with `dialect: 'turso'` and a `file:` URL, or with `dialect: 'sqlite'` for the local target and
`dialect: 'turso'` for the deployed one. *Unverified:* whether `dialect: 'turso'` accepts a plain
`file:` URL without an `authToken`; if it does not, the fallback is two small drizzle-kit configs
over one shared schema directory, which is a non-issue.

Two honest limits on how decisive this is:

- **Local SQLite is not local Turso Cloud.** Turso Cloud documents behavioural differences —
  `PRAGMA user_version` and `application_id` are read-only, `busy_timeout` and `journal_mode` are
  unsupported, `VACUUM` is disabled
  ([Turso Cloud limitations](https://docs.turso.tech/cloud/limitations.md),
  [Usage & billing](https://docs.turso.tech/help/usage-and-billing.md)). Fine-grained token
  permissions (see §5) also do not exist locally. So a local-file test suite validates SQL and
  application logic, not the platform's authorization layer — meaning the append-only guarantee
  that Turso can enforce in production cannot be asserted by a local-file test.
- **The Postgres path already has a working answer to the same problem.** Testcontainers Postgres
  is what the PRD names, it exercises the real engine including roles and triggers, and it works.
  Turso's advantage here is "no Docker", not "testable versus untestable". That is a real
  convenience, but it is a smaller edge than it first appears.

---

## 3. Transactions

This is where the three options diverge most sharply, and it is the single most consequential
finding in this document.

### 3.1 D1 — no interactive transactions

Cloudflare's own wording, on `batch()`:

> "**D1 operates in auto-commit.** Our implementation guarantees that each statement in the list
> will execute and commit, sequentially, non-concurrently. Batched statements are SQL
> transactions. If a statement in the sequence fails, then an error is returned for that specific
> statement, and it aborts or rolls back the entire sequence."
> — [D1 Worker API: D1Database](https://developers.cloudflare.com/d1/worker-api/d1-database/)

So `batch()` is the only transaction primitive, and it is a *pre-declared* list of statements. You
cannot read a row, branch in JavaScript, then write inside the same transaction.

Worse, Drizzle's `db.transaction()` on D1 **compiles to something D1 rejects**. The driver issues
`begin` and `commit` as separate statements
([`drizzle-orm/src/d1/session.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/d1/session.ts)):

```ts
override async transaction<T>(transaction, config?) {
  const tx = new D1Transaction('async', this.dialect, this, this.schema);
  await this.run(sql.raw(`begin${config?.behavior ? ' ' + config.behavior : ''}`));
  try {
    const result = await transaction(tx);
    await this.run(sql`commit`);
    return result;
  } catch (err) {
    await this.run(sql`rollback`);
    throw err;
  }
}
```

Nested transactions likewise emit `savepoint` / `release savepoint`. The Workers runtime refuses
both — the SQLite regulator in workerd fails any `BEGIN TRANSACTION` or `SAVEPOINT`:

> "To execute a transaction, please use the `state.storage.transaction()` or
> `state.storage.transactionSync()` APIs instead of the SQL BEGIN TRANSACTION or SAVEPOINT
> statements."
> — [`workerd/src/workerd/api/sql.c++`, `SqlStorageRegulator::allowTransactions()`](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/sql.c%2B%2B)

and users hit it through D1 as a `D1_ERROR` with exactly that text
([drizzle-orm #4212](https://github.com/drizzle-team/drizzle-orm/issues/4212), also
[#758](https://github.com/drizzle-team/drizzle-orm/issues/758),
[#2463](https://github.com/drizzle-team/drizzle-orm/issues/2463)). The suggested
`state.storage.transaction()` API belongs to Durable Objects and is **not** reachable through a D1
binding. *Unverified:* whether every D1 code path surfaces that identical message — but the
substance (auto-commit only, `batch()` as the sole atomic unit) is Cloudflare-documented.

Practical rule on D1: **`db.transaction()` is banned; use `db.batch()`**, which Drizzle supports
for the D1 and libSQL drivers ([Drizzle batch API](https://orm.drizzle.team/docs/sqlite/batch-api)).

### 3.2 Turso / libSQL — real interactive transactions, over HTTP

libSQL supports both. Turso documents batch transactions — "A batch consists of multiple SQL
statements executed sequentially within an implicit transaction. The backend handles the
transaction: success commits all changes, while any failure results in a full rollback with no
modifications" — **and** interactive transactions: "These transactions give you control over when
to commit or roll back changes, isolating them from other client activity", with
`client.transaction("write")` returning an object exposing `execute()`, `commit()`, `rollback()`,
`close()` ([Turso TypeScript reference](https://docs.turso.tech/sdk/ts/reference)). Turso's own
documented example is literally a read-balance / branch / write-or-rollback sequence — the exact
pattern D1 cannot express. Transaction modes map to `BEGIN IMMEDIATE` (`write`),
`BEGIN TRANSACTION READONLY` (`read`), and `BEGIN DEFERRED` (`deferred`).

Drizzle wires straight into that API rather than emitting raw `begin`
([`drizzle-orm/src/libsql/session.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/libsql/session.ts)):

```ts
override async transaction<T>(transaction, _config?): Promise<T> {
  // TODO: support transaction behavior
  const libsqlTx = await this.client.transaction();
  …
  try {
    const result = await transaction(tx);
    await libsqlTx.commit();
    return result;
  } catch (err) {
    await libsqlTx.rollback();
    throw err;
  }
}
```

So `db.transaction(async (tx) => { … })` works on Turso from a Worker. Note the `TODO` — Drizzle
does not yet pass the transaction mode through, so you get the client default rather than an
explicit `write`/`read` mode; `db.batch()` is also available when a mode matters. Nested
transactions use savepoints, which libSQL supports.

Two things to keep in mind: an interactive transaction holds a server-side stream open for its
duration, so it must not wrap an external call (AI gateway, e-mail, S3) — the same discipline
Postgres requires. And `@libsql/client` is documented as **not** supporting concurrent writes
("Concurrent writes: Not supported", [reference](https://docs.turso.tech/sdk/ts/reference)),
because libSQL inherits SQLite's single-writer model; write transactions serialise. At this
application's scale — a faculty-sized cohort submitting assessments — that is acceptable, but it
is a real ceiling and it is the specific limitation the new Turso engine exists to remove.

### 3.3 Postgres — ordinary transactions

Nothing to establish. `db.transaction()` works, with full isolation-level control. Hyperdrive's
only documented note is that "long-running queries or transactions are a common cause" of
connection-pool exhaustion
([Hyperdrive limits](https://developers.cloudflare.com/hyperdrive/platform/limits/)) — keep them
short.

### 3.4 Why this decides so much here

`submit → score → profile snapshot` is named in `docs/engineering/testing.md` as an integration
path, and NFR-11 requires every score be traceable to `assessment_version_id` +
`scoring_version_id` + `response_set` + `timestamp`. A scoring pipeline that reads a response set,
computes derived scores in TypeScript, then writes `scores` + `leadership_profiles` +
`profile_snapshots` + `audit_logs` is precisely the read-then-branch-then-write shape. The same
applies to the `sessions.status` state machine (`in_progress → submitted → scored`), which needs a
guarded compare-and-set.

**D1 cannot express this transactionally. Turso and Postgres both can.** On this axis alone, D1
should be eliminated.

---

## 4. Turso's platform state — the part that needs care

The ticket asks for this specifically, and it is warranted: Turso has changed direction more than
once, and the current documentation shows a platform mid-transition. Everything below is from
Turso's own docs and blog.

**There are now two engines, and Turso Cloud hosts both.** "Turso Cloud is a fully managed
database platform … It hosts two database engines, both fully compatible with SQLite:
**Turso** — a ground-up rewrite of SQLite … **libSQL** — a fork of SQLite, battle-tested in
production on Turso Cloud for years" ([Turso Cloud](https://docs.turso.tech/turso-cloud.md)).

**The new engine is early preview on the platform.** From the same page: "Turso databases on Turso
Cloud are in early preview — a reflection of how recently the offering landed on the platform, not
of the engine itself. Create one with `turso db create --tursodb`."

**libSQL is explicitly the legacy path, still supported.** "libSQL represents where we started.
Today, our focus is Turso Database, a full rewrite of SQLite built from scratch… If you're
starting a new project, we recommend Turso Database. For mission-critical workloads that need a
battle-tested foundation today, libSQL is the right choice."
([libSQL](https://docs.turso.tech/libsql.md)) Its own comparison table rates both engines
"Production-ready", and puts libSQL under "Best for: Mission-critical workloads today" against
Turso Database's "New projects, agents, smart devices, high-density use cases".

**The rewrite is the project formerly called Limbo, and the new server is closed-source.** The
January 21, 2025 platform announcement states that the server is "an entirely new implementation,
not a relicensing of libSQL's server components", that the server will be closed-source while
"everything that runs on the client will remain strictly open source", and lists renaming Limbo to
Turso and moving the platform to AWS
([Upcoming changes to the Turso platform and roadmap](https://turso.tech/blog/upcoming-changes-to-the-turso-platform-and-roadmap)).
The rewrite's own repository confirms production use but not a 1.0: "Turso powers production
applications today at multiple organizations… That said, we have not yet reached 1.0. The project
is under active development, and some features are explicitly marked experimental"
([tursodatabase/turso README](https://github.com/tursodatabase/turso)).

**Three platform features are deprecated for new users**, all visible in the docs index:
"Multi-DB Schemas (Deprecated)", "Attach Database (Deprecated)", "Data Edge (Deprecated)"
([docs index](https://docs.turso.tech/llms.txt)). The multi-DB schemas page carries the notice
"This feature is now deprecated for all new users. Existing paid users can continue to use
Multi-DB Schemas"
([Multi-DB Schemas](https://docs.turso.tech/features/multi-db-schemas.md)); the January 2025 post
frames Edge Replicas, Multi-DB Schemas and `ATTACH` as removed for new users with an intent to
"reinvent them properly in our new implementation". **The consequence for this project is direct:
the shared-schema multi-database feature that would have been the natural per-domain isolation
mechanism is not available to a new account, and cross-database `ATTACH` is not either.**

**The driver story is the sharpest edge of the transition.** Turso's own reference table lists four
TypeScript packages ([reference](https://docs.turso.tech/sdk/ts/reference)). The package Turso
recommends for Workers is `@tursodatabase/serverless` — "The recommended package for any
application that connects to a remote Turso Cloud database … and edge runtimes (Cloudflare
Workers, Deno Deploy). Uses only `fetch` — zero native dependencies". Its **ORM support column is
`—`**. The package with Drizzle support is `@libsql/client`, whose engine column reads "libSQL
(SQLite fork)" and whose concurrent-writes column reads "Not supported". Drizzle support for the
new engine exists only as "Drizzle (beta)" for `@tursodatabase/database`, the *local/embedded*
package — Turso's Drizzle guide says "There is also beta support for `@tursodatabase/database` for
local/embedded use cases" ([Drizzle + Turso](https://docs.turso.tech/sdk/ts/orm/drizzle.md)).

Stated plainly: **choosing Turso with Drizzle today means choosing libSQL — the engine the vendor
says is not its focus — because the driver the vendor recommends for Workers has no Drizzle
support.** That is not a blocker; libSQL is documented as production-ready and Turso Cloud has run
on it for years. It is a bet that either Drizzle gains support for the new stack or libSQL stays
maintained for the lifetime of this system.

**Turso's documentation contains no Cloudflare Workers guide.** The docs index lists framework
guides for Next.js, Remix, Astro, Nuxt, Qwik, SvelteKit, Quasar, Elysia and Hono, and a Vercel
integration page — but no Cloudflare page at all
([docs index](https://docs.turso.tech/llms.txt)). Workers compatibility is asserted in the
reference's compatibility list, and Drizzle documents the "Edge Runtimes" import, so the claim is
sourced — but there is no first-party worked example for this exact deployment target.
*Unverified:* whether `@libsql/client/web` has any Workers-specific rough edges in practice; a
spike is the only way to know.

**Pricing and quotas.** Current plans are Free ($0, 100 databases, 5 GB, 500 M rows read / 10 M
rows written per month), Developer ($4.99), Scaler ($24.92), Pro ($416.58), Enterprise
([turso.tech/pricing](https://turso.tech/pricing)) — the $4.99 hobby price being the one announced
in the January 2025 post. Two billing mechanics deserve attention. Billing is by **row scans**, not
rows returned: "In SQLite, the term 'row read' actually refers to a 'row scan' during statement
execution", aggregates scan every row considered, and un-indexed queries incur "a row scan for each
table row" ([Usage & billing](https://docs.turso.tech/help/usage-and-billing.md)). And on the
quota plans the failure mode is hard: "any query that exceeds these limits will result in a
failure, indicated by the `BLOCKED` error code." A missing index on a dashboard aggregate can
therefore turn into an outage rather than a slow page. Also noted there: "the `VACUUM` command …
is currently disabled in Turso."

**Overall read of the platform risk:** not disqualifying, but real, and pointing in one direction —
the pieces this project would depend on (libSQL engine, `@libsql/client`, Drizzle's libSQL driver)
are the *stable, de-emphasised* parts of a platform whose vendor is actively moving elsewhere, and
whose most useful multi-tenancy primitives were withdrawn from new users a year ago.

---

## 5. What replaces `pgSchema()`, and how each option handles the data rules

### 5.1 Per-domain isolation

**D1 — two options, one weak and one absolute.**

*Table-name prefixes* (`identity_users`, `assessment_sessions`): **no enforcement.** One
`drizzle(env.DB)` handle can read and join every table. A repository in `server/domain/profile/`
can write `.from(identityUsers)` and nothing at the database layer objects.

*One D1 database (binding) per domain*: **enforcement stronger than Postgres schemas.** A
cross-domain join is not merely discouraged, it is not expressible in SQL. Limits allow it easily
(50,000 databases per account on Workers Paid, "Approximately 5,000" bindings per Worker script,
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)). The cost is severe: no
cross-domain foreign keys, no cross-domain atomicity, nine migration histories, and *unverified*
whether SQLite `ATTACH` can bridge two D1 databases (the D1 docs do not mention `ATTACH` — assume
no).

**Turso — table prefixes, or fine-grained tokens, or separate databases.** This is where Turso has
a genuine advantage over D1, and it is not the multi-database story (which is deprecated for new
users) — it is **fine-grained permissions**. Turso Cloud tokens can be scoped by table *and*
action: "Fine-grained permissions let you control access at the table and action level", in the
format `<table-name|all>:<action1>,<action2>`, with actions `data_read`, `data_add`, `data_update`,
`data_delete`, `schema_add`, `schema_update`, `schema_delete`
([Fine-Grained Permissions](https://docs.turso.tech/sdk/authorization/fine-grained-permissions.md)):

```bash
turso db tokens create fia -p identity_users:data_read,data_add,data_update
```

> **Superseded.** The advantage described in this paragraph was not confirmed and is no longer
> claimed. `turso-fine-grained-tokens.md` §4a could not establish that the engine `@libsql/client`
> reaches enforces per-table permissions at all, and found a fail-open path in the source. The map
> then ruled that fine-grained tokens are **not counted as a security boundary**
> ([#31](https://github.com/afif-hh/fia-leadership/issues/31)), and that the design uses **one
> token**, not nine ([#34](https://github.com/afif-hh/fia-leadership/issues/34)). Per-domain
> isolation on the Turso path is TypeScript plus an ESLint import boundary — the same strength
> `pgSchema()` alone offers on Postgres, not more. `audit_logs` is protected by a `RAISE(ABORT)`
> trigger and an `append()`-only repository interface instead. Read the rest of this section as the
> case that was made, not as the design.

Since a token is bound to a client, a per-domain token yields a per-domain client and therefore a
per-domain Drizzle handle whose reach is **enforced by the server, in one database, with foreign
keys and transactions intact across domains you deliberately allow**. That is a better shape than
either D1 option: real enforcement without giving up referential integrity. Costs: nine tokens to
provision, store and rotate; nine client instances per request path (cheap — they are `fetch`
wrappers); **no authorization layer locally in either local mode** — a local file needs no
`authToken`, and `turso dev` has exactly one flag (`--db-file`) and no auth of any kind, so this is
not merely "unenforced against a local file" but untestable locally by any route
that local tests cannot assert. *Unverified:* whether fine-grained permissions apply to the new
`--tursodb` engine as well as libSQL, and whether they are available on the Free plan.

**Postgres — `pgSchema()`, which is a namespace, not a permission.** A single connection with one
role can `SELECT … FROM identity.users JOIN assessment.sessions …` freely; the schema prefix only
makes the violation legible. Real enforcement requires per-domain roles plus `GRANT`/`REVOKE`, and
each role needs its own connection — which under Hyperdrive means **one Hyperdrive configuration
per domain**, against a limit of "25 per account" on paid plans
([Hyperdrive limits](https://developers.cloudflare.com/hyperdrive/platform/limits/)). Nine domains
fits, but it is nine configs to provision and rotate.

Honest scoring:

| Mechanism | Enforced by | Strength |
|---|---|---|
| D1 or Turso table prefixes | nothing | convention |
| `pgSchema()` with one shared role (what the docs describe today) | nothing | convention, but a legible one |
| Typed per-domain handles + ESLint import boundary | TypeScript + ESLint | catches accidents |
| Turso fine-grained per-domain tokens | ~~Turso Cloud server~~ **unverified; evidence negative** | ~~real~~ **not counted as a control (#31)** — keeps cross-domain FKs either way |
| Postgres schema + per-domain role + `GRANT`/`REVOKE` (+ 1 Hyperdrive config per domain) | the database | real, and keeps cross-domain FKs |
| One D1 database per domain | the database | real, absolute, and loses cross-domain FKs |

**The `pgSchema()` mandate in `patterns.md` is therefore less load-bearing than it looks.** What is
load-bearing is the *intent*: a stable per-domain namespace that a future service extraction can
lift out cleanly. `pgSchema('identity')`, a `fia_identity` D1 database, and prefixed tables plus a
scoped Turso token all serve that intent to different degrees.

### 5.2 `audit_logs` append-only

- **Postgres: enforceable at the database.** A dedicated app role with
  `GRANT INSERT, SELECT ON audit_logs` and no `UPDATE`/`DELETE`, optionally backed by a
  `BEFORE UPDATE OR DELETE` trigger raising an exception. `drizzle-kit` generates neither triggers
  nor grants, but supports hand-written migrations:
  `drizzle-kit generate --custom --name=audit-append-only`
  ([drizzle-kit generate](https://orm.drizzle.team/docs/drizzle-kit-generate)).
- **Turso: one way, and it is the weaker one.** *Corrected — this bullet originally claimed two
  routes and a "genuine server-side append-only guarantee".* The token route is withdrawn: a token
  scoped `audit_logs:data_add,data_read` withholds `data_update` / `data_delete` on paper
  ([Fine-Grained Permissions](https://docs.turso.tech/sdk/authorization/fine-grained-permissions.md)),
  but `turso-fine-grained-tokens.md` §4a could not establish that the engine `@libsql/client` reaches
  enforces per-table permissions at all, and found a fail-open path in the source. The map then ruled
  the mechanism out as a security boundary entirely
  ([#31](https://github.com/afif-hh/fia-leadership/issues/31)). What remains is the trigger: libSQL is
  a full SQLite fork, so `BEFORE UPDATE` / `BEFORE DELETE` with `RAISE(ABORT, …)` is available, and
  Turso Cloud's limitations page lists only pragma differences without restricting triggers
  ([limitations](https://docs.turso.tech/cloud/limitations.md)) — though whether a trigger is actually
  *enforced* there, as opposed to accepted by `CREATE TRIGGER`, is itself unverified.

  **This axis is now a loss for Turso, not a tie.** A trigger is a mechanism Postgres also has, and
  Postgres has `REVOKE UPDATE, DELETE` underneath it. Turso has nothing underneath. So the comparison
  is one `DROP`-able trigger against a trigger plus a privilege system, and the compensating control
  on the Turso side has to be application-level: an `append()`-only repository interface plus a
  source-scan test, which defends against bugs and accidents rather than against a compromised
  credential.
- **D1: no privilege system at all.** SQLite has no `GRANT`/`REVOKE`, and a D1 binding is
  all-or-nothing over the whole database. The only lever would be a SQLite trigger, and
  **unverified**: the D1 supported-features page
  ([SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/)) documents
  pragmas, views, foreign keys, generated columns, JSON functions and FTS5, but says nothing about
  `CREATE TRIGGER` either way. workerd's regulator has `isAllowedTrigger()` returning `true`
  unconditionally, which suggests triggers are permitted, but that is inference from the Durable
  Objects SQLite path, not a D1 guarantee. Absent a working trigger, `audit_logs` append-only
  degrades to an application-code convention.

### 5.3 Enums

Postgres enums have no SQLite equivalent, on either D1 or Turso. Drizzle's SQLite dialect offers
`text({ enum: [...] })`, and its docs are explicit that this "will be inferred as
`"value1" | "value2" | null`" but "**won't** check runtime values"
([Drizzle SQLite column types](https://orm.drizzle.team/docs/sqlite/column-types)) — TypeScript
only, no database constraint. Both SQLite options recover this with a hand-written
`CHECK (status IN (...))` in a custom migration, and both then require someone to remember it on
every enum, forever. `sessions.status` is documented as "State machine, transisi terkontrol"; a
state machine whose value domain is unenforced at rest is a weaker guarantee.

### 5.4 `profile_snapshots.payload` (jsonb)

Neither SQLite option has `jsonb`. D1 is explicit: "JSON data is stored as a `TEXT` column in D1"
([Query JSON](https://developers.cloudflare.com/d1/sql-api/query-json/)), with the SQLite JSON
function set (`json_extract`, `json_set`, `json_each`, `->`, `->>`). libSQL is the same story and
documents a full JSON function set
([Turso JSON functions](https://docs.turso.tech/sql-reference/functions/json)). Drizzle maps it as
`text({ mode: 'json' }).$type<Payload>()`.

This is the mildest gap: the repo's own rule is "JSONB **hanya** untuk metadata fleksibel", so
payloads are stored and read back whole rather than queried relationally. Two caveats: no `jsonb`
GIN indexing if that ever changes, and on D1 a hard 2 MB max row/string/BLOB size
([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)) that caps a single report
snapshot. *Unverified:* whether Turso Cloud publishes an equivalent per-row size cap; the
limitations page does not state one.

### 5.5 Numeric precision — the under-appreciated risk on both SQLite options

`scores.score_value` is `numeric` and `responses.answer_value` is `numeric/text`. SQLite has no
exact-precision decimal type; it has INTEGER / REAL / TEXT / BLOB / NUMERIC *affinities*
([SQLite datatypes](https://www.sqlite.org/datatype3.html)), so a decimal lands as a
double-precision float or as text. For a system whose first non-negotiable principle is "Scoring is
code, not prompt" and whose testing strategy rests on **golden tests** plus property-based
invariants ("Score selalu 0–100"), storing scores as binary floats invites golden-test drift from
rounding. Workable — integers at a fixed scale, or text — but another explicit discipline that
Postgres `numeric` gives for free. Turso's newer engine documents STRICT tables and custom types
([Data types](https://docs.turso.tech/sql-reference/data-types)), but that is the `--tursodb`
engine, not the libSQL one Drizzle can reach today.

### 5.6 Other hard limits

D1, from [D1 limits](https://developers.cloudflare.com/d1/platform/limits/): 10 GB max database
size (500 MB Free); 1,000 queries per Worker invocation (50 Free); **100 max bound parameters per
query**; 100 columns per table; 100 KB max SQL statement length; 30 s max query duration; each
database "inherently single-threaded". The bound-parameter cap is the one that bites — bulk-
inserting a 40-item response set in one statement exceeds it, forcing chunking.

Turso: limits are plan quotas (storage, rows read, rows written) rather than per-query caps, with
the `BLOCKED` hard-failure behaviour noted in §4. *Unverified:* per-statement parameter or
statement-length limits; Turso's docs do not state them.

On the plus side for D1: read replication via the Sessions API (`env.DB.withSession(bookmark)`)
with sequential-consistency guarantees at no extra cost
([Read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)), and
automatic retries for read-only queries
([changelog](https://developers.cloudflare.com/changelog/post/2025-09-11-d1-automatic-read-retries/)).

---

## 6. Operations: latency, replicas, branching, backups, migrations from CI

### Latency

- **D1** is Cloudflare-native: the binding is an in-network call, and reads can be served from
  global replicas via the Sessions API. This is the fastest option from a Worker and the only one
  with edge-local reads.
- **Turso** from a Worker is an HTTPS round trip from the Cloudflare edge to a single Turso region.
  Critically, the feature that used to mitigate this is gone: "Data Edge (Deprecated) — Allow your
  users to reach local replicas of your database, wherever they are"
  ([docs index](https://docs.turso.tech/llms.txt)), with edge replicas discontinued for new users
  in the January 2025 announcement. And **embedded replicas are not usable from Workers**: they
  require "a local file to be your main database" via the `url` parameter
  ([Embedded Replicas](https://docs.turso.tech/features/embedded-replicas/introduction.md)), and
  Workers have no filesystem — the same reason `@libsql/client/web` refuses `file:` URLs (§2). So
  the Turso option is single-region, unreplicated, HTTP-per-query, from the Worker's point of view.
- **Postgres over Hyperdrive** is also an edge-to-single-region round trip, but Hyperdrive removes
  per-request connection setup by pooling connections globally
  ([Hyperdrive overview](https://developers.cloudflare.com/hyperdrive/)).

Neither Cloudflare nor Turso publishes comparable latency figures for these paths, so any number
here would be invented: **unverified, and must be measured**. For this project the geography is
favourable to both remote options — the users are at Universitas Brawijaya, so pinning the origin to
Singapore puts it near essentially all traffic. Turso's CLI can report this directly:
`turso db locations --show-latencies` "Display latencies from your current location to each of
Turso's locations" ([db locations](https://docs.turso.tech/cli/db/locations.md)). *Unverified:*
which Turso regions exist today post-AWS migration; the docs defer to the CLI rather than listing
them.

### Query caching (Postgres only, and it is a hazard here)

Hyperdrive "caches eligible read-only query responses and does not cache writes", with `max_age`
defaulting to 60 s and `stale_while_revalidate` 15 s, and it "doesn't invalidate cached results
after database writes"
([Query caching](https://developers.cloudflare.com/hyperdrive/configuration/query-caching/)). The
docs themselves advise "separate cache-disabled configurations for authentication, sessions, and
permission checks requiring fresh reads". Given this repo's RBAC, consent gating and session state
machine, **caching should be disabled**, or split into a cached config for public-website content
and an uncached one for the portal. Related traps: queries containing `STABLE`/`VOLATILE`
functions (`NOW()`, `CURRENT_DATE`, `RANDOM()`) are never cached, and Hyperdrive's text pattern
matching means even `-- NOW()` **in a comment** marks a query uncacheable. D1 and Turso have no
equivalent layer, and therefore no equivalent hazard.

### Branching for per-PR databases

- **Turso: first-class.** `turso db create my-branch --from-db my-existing-database`, or the same
  through the Platform API, including a documented GitHub Actions workflow that creates a database
  per branch ([Branching](https://docs.turso.tech/features/branching.md)). Caveats from the same
  page: branches are "completely separate", schema merges are manual, they need their own token,
  they must be deleted manually, and they "count towards your plan's database quota".
- **Postgres/Supabase:** Supabase has its own branching product; *unverified* here, since it was
  not researched for this document. A `CREATE DATABASE … TEMPLATE` or a per-PR container is the
  fallback.
- **D1:** no branching primitive; `wrangler d1 create` plus applying migrations is the equivalent.

### Backups

Turso Cloud offers point-in-time recovery
([Point-in-Time Recovery](https://docs.turso.tech/features/point-in-time-recovery.md)) and BYOK
encryption ([BYOK](https://docs.turso.tech/cloud/encryption.md)). D1 has Time Travel. Supabase has
managed backups. All three are adequate; this axis does not decide anything.

### Migrations from CI

- **Turso:** simplest of the three. `drizzle-kit generate` / `drizzle-kit migrate` with
  `dialect: 'turso'` and `url` + `authToken` — HTTPS out from CI, no network ingress to configure,
  no Cloudflare API token ([Drizzle + Turso](https://docs.turso.tech/sdk/ts/orm/drizzle.md)).
- **Postgres:** `drizzle-kit` over TCP directly to Postgres, bypassing Workers and Hyperdrive
  entirely, so `pgSchema()`, enums, triggers and `GRANT`/`REVOKE` all remain available and
  `skills/database-migration/SKILL.md` works unchanged. Requires CI to reach the database.
- **D1:** `driver: 'd1-http'` through Cloudflare's API, or `wrangler d1 migrations apply`. Also
  fine, and multiplied by nine if databases are split per domain.

### Local dev

- **Turso:** either a plain local file via the Node entrypoint (§2), or `turso dev` /
  `turso dev --db-file local.db` for a local libSQL server, noting "Changes will be lost when you
  stop the server" without `--db-file`
  ([Local Development](https://docs.turso.tech/local-development.md)). No Docker.
- **D1:** `wrangler dev` gives "a standalone, local-only environment that mirrors the production
  environment D1 runs in", with `wrangler d1 migrations apply <db> --local`
  ([Local development](https://developers.cloudflare.com/d1/best-practices/local-development/)).
  No Docker.
- **Postgres:** a local Postgres (Docker or native), pointed at through Hyperdrive's
  `localConnectionString` or `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING_NAME>`
  ([get started](https://developers.cloudflare.com/hyperdrive/get-started/),
  [Wrangler env vars](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/)),
  which since December 2025 also works against remote/TLS databases without `--remote`
  ([changelog](https://developers.cloudflare.com/changelog/post/2025-12-04-hyperdrive-remote-database-local-dev/)).
  One documented gap: "When using `wrangler dev` with `localConnectionString` … **Hyperdrive
  caching does not take effect locally**" — cache-staleness bugs are invisible in dev, another
  argument for disabling caching.

---

## 7. Integration testing

**Postgres — the PRD's "test-container Postgres" survives intact.** Because the Hyperdrive binding
is just a connection string locally, integration tests run plain Vitest in Node against a
testcontainers Postgres with `drizzle-kit migrate` applied. Schemas, enums, triggers and grants are
all exercised for real, so an authorization test can genuinely assert that the app role cannot
`DELETE FROM audit_logs`. No Workers runtime needed for repository/service tests. **This is the
only option where `docs/engineering/testing.md` needs no rewrite.**

**Turso — no Docker, one Vitest config, but a thinner guarantee.** Tests run in Node against
`file:./.data/test.db` or `:memory:` through `@libsql/client`, with the same schema and the same
Drizzle code as production (§2). This is the most ergonomic of the three: one Vitest project,
`@vue/test-utils` component tests and DB integration tests side by side, no containers, fast. The
gap is that a local SQLite file is not Turso Cloud — fine-grained token permissions do not exist
locally, `journal_mode`/`busy_timeout` behave differently, `VACUUM` works locally and is disabled
in the cloud ([limitations](https://docs.turso.tech/cloud/limitations.md)) — so anything enforced by
the platform rather than by SQL is untestable in CI without provisioning a real branch database.
Turso's branching (§6) is the answer to that, at the cost of a CI job that creates and destroys a
database per run.

**D1 — a different, workable, but rebuilt test story.** Testcontainers is gone; there is no D1
container. The supported approach is `@cloudflare/vitest-plugin`, which runs tests "inside the
Workers runtime", "fully-locally using Miniflare", with "isolated per-test-file storage"
([Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)), plus
purpose-built D1 helpers `readD1Migrations(migrationsPath)` and `applyD1Migrations(db, migrations)`
([configuration](https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/),
[test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)). This
repo is on `vitest@4.1.11` and Cloudflare documents the Vitest 3→4 migration, so versions align.
Cost: **two Vitest configurations**, since the Workers pool cannot host jsdom for component tests;
storage isolation is per test file, with cross-file sharing needing `--max-workers=1 --no-isolate`
([isolation and concurrency](https://developers.cloudflare.com/workers/testing/vitest-integration/isolation-and-concurrency/)).
And decisively: an append-only test for `audit_logs` has nothing to assert against if D1 cannot
enforce it.

---

## Comparison

| Dimension | Cloudflare D1 | Turso / libSQL | Postgres (Supabase) + Hyperdrive |
|---|---|---|---|
| Engine | SQLite (Cloudflare) | libSQL, a SQLite fork | PostgreSQL 15+ |
| Drizzle driver | `drizzle-orm/d1`, native binding, no `nodejs_compat` | `drizzle-orm/libsql` + `@libsql/client/web`, `fetch` only | `drizzle-orm/node-postgres` + `pg@>=8.13`, needs `nodejs_compat` |
| **Interactive transactions** | **No.** Auto-commit; `batch()` only; `db.transaction()` errors | **Yes.** `client.transaction()` over HTTP; Drizzle wires into it | **Yes,** ordinary Postgres |
| Same code local + prod | no (Miniflare vs binding) | yes, apart from a one-line `createClient` swap | yes (connection string) |
| Domain namespace | prefixes (convention) or one DB per domain (absolute, costly) | prefixes + **fine-grained per-table tokens** (server-enforced, keeps FKs) | `pgSchema()`; real enforcement needs per-domain roles + one Hyperdrive config each |
| Cross-domain FK | prefixes: yes · per-DB: impossible | yes | yes |
| `audit_logs` append-only at DB level | no `GRANT`; trigger support **unverified** | yes — scoped token and/or SQLite trigger (production only) | yes — `REVOKE UPDATE/DELETE` + trigger |
| Enums | `text({enum})` = TS-only; needs `CHECK` | same | native |
| JSONB | `TEXT` + JSON functions; 2 MB row cap | `TEXT` + JSON functions; row cap unverified | native `jsonb` + GIN |
| Exact decimals | none (float/text affinity) | none on libSQL | `numeric` |
| Per-query limits | 100 bound params, 100 KB stmt, 1,000 queries/invocation | plan quotas; per-query caps unverified | Postgres limits; 60 s max query |
| Quota failure mode | throttle/limits per plan | **hard `BLOCKED` error** at monthly row quota | overage billing |
| Read latency from Worker | best — in-network, optional global replicas | edge→one Turso region per query; edge replicas deprecated, embedded replicas unusable on Workers | edge→one region, pooled connections |
| Migrations from CI | `d1-http` / wrangler | `dialect: 'turso'`, HTTPS + token — simplest | `drizzle-kit` over TCP — full Postgres DDL |
| Branching per PR | none | first-class (`--from-db`), counts against quota | Supabase branching (unverified) / container |
| Local dev | `wrangler dev`, no Docker | local file or `turso dev`, no Docker | local Postgres (Docker) |
| Integration tests | `@cloudflare/vitest-plugin`; two Vitest configs; **PRD plan dies** | one Vitest config, local file; platform-level rules untestable locally | testcontainers Postgres, exactly as the PRD says |
| Vendor/platform risk | low — first-party, stable | **elevated** — libSQL de-emphasised, new engine early preview, Workers-recommended driver has no Drizzle support, three features deprecated for new users | low — Postgres is Postgres; Supabase + Hyperdrive are two vendors |
| Docs impact | rewrite `patterns.md` r.4, most of `data-dictionary.md`, `testing.md`, PRD §2 | same rewrites as D1, minus the transaction and append-only concessions | none |

---

## Recommendation

**Use PostgreSQL on Supabase, reached through Cloudflare Hyperdrive, with `node-postgres` and
`drizzle-orm/node-postgres`.**

**Turso/libSQL is a defensible second choice and is clearly better than D1. D1 should be
eliminated outright.**

The ranking, and why:

1. **D1 is disqualified by transactions.** "D1 operates in auto-commit"; `batch()` is the only
   atomic unit, and Drizzle's `db.transaction()` fails at runtime because the backend rejects
   `BEGIN TRANSACTION`/`SAVEPOINT`. This application's core is a versioned, auditable,
   deterministic scoring pipeline that reads a response set, computes in TypeScript, and writes
   scores + profile + snapshot + audit atomically, plus a guarded `sessions.status` state machine.
   Those are read-then-branch-then-write transactions. Add that D1 cannot enforce `audit_logs`
   append-only at any level (no `GRANT`, trigger support undocumented), and it fails two of this
   repo's stated non-negotiables rather than merely inconveniencing them.
2. **Turso fixes both of D1's fatal problems, and the owner's core argument holds up.** Interactive
   transactions are real and Drizzle uses them properly. `file:` URLs are real, so dev and Vitest
   run against a local SQLite file with the same schema and the same Drizzle code — the correction
   being that the `createClient` import differs between Node and Workers, which is one line behind
   a factory. Fine-grained per-table tokens are a genuinely *better* boundary mechanism than
   `pgSchema()` and give a real server-side append-only guarantee on `audit_logs`. Branching gives
   per-PR databases nearly for free. This is a serious option and the preference for it is
   well-founded.
3. **Postgres still wins, for two reasons that Turso cannot answer.**

   **First, the data dictionary is written in Postgres primitives and they are not decorative.**
   `scores.score_value` needs exact decimals under golden tests; SQLite has no decimal type, so
   scores become floats or strings and every rounding decision becomes a permanent convention.
   `sessions.status`, `assessment_versions.status` and `scores.score_type` are enums enforced at
   rest; on libSQL they become TypeScript-only strings plus a `CHECK` constraint somebody has to
   remember on every future enum. `profile_snapshots.payload` is `jsonb`; on libSQL it is `TEXT`.
   Each is individually survivable; together they convert a set of database guarantees into a set
   of review checklists, in exactly the subsystem this project says must never be wrong.

   **Second, Turso's platform is mid-transition in a way that lands squarely on the pieces this
   project would depend on.** Turso says libSQL "represents where we started" and recommends the
   new engine for new projects; Turso databases on Turso Cloud are "in early preview"; the package
   Turso recommends for Cloudflare Workers (`@tursodatabase/serverless`) has no Drizzle support,
   while the package Drizzle supports (`@libsql/client`) targets the de-emphasised engine and does
   not support concurrent writes; Multi-DB Schemas, `ATTACH` and Data Edge are all deprecated for
   new users; and Turso's documentation has no Cloudflare Workers page at all. None of this is
   broken today. All of it is churn on the foundation of a system with a multi-year institutional
   lifespan.

   And the argument that was supposed to be decisive — local-file integration testing — is worth
   less here than it looks, because the Postgres path already has a good answer to the same
   question. Testcontainers Postgres is what the PRD names, it exercises the real engine including
   roles and triggers, and it can assert the append-only rule that a local SQLite file cannot.
   Turso's edge on this axis is "no Docker", not "testable versus untestable".

4. **The Postgres path also costs zero documentation churn.** `pgSchema()`,
   `drizzle-kit generate`/`migrate`, and testcontainers Postgres work unchanged. Either SQLite
   option requires rewriting `patterns.md` rule 4, most of `data-dictionary.md`, `testing.md`, and
   PRD §2 — and none of the code depending on them exists yet, so this is the cheapest possible
   moment to *not* incur that.

### What this gives up — stated plainly

- **Two vendors and more moving parts than either alternative.** Supabase becomes a hard dependency
  with its own availability, region and credential rotation, and Hyperdrive adds `nodejs_compat`,
  TCP sockets, per-request client construction, connection-pool exhaustion, and a default-on query
  cache. That cache must be **explicitly disabled** for the portal, or a 60-second-stale permission
  check will eventually be a security finding. Turso needs a URL and a token; D1 needs a binding.
  This is the most operationally complex of the three.
- **The nicest developer loop.** Turso's single-driver, local-file, no-Docker story is genuinely
  better than running Postgres locally, and its `drizzle-kit migrate` from CI over HTTPS is simpler
  than opening a database port to CI. Choosing Postgres means paying that convenience tax daily.
- **Edge-native read latency.** D1 can serve reads from global replicas at no extra cost; Postgres
  and Turso both cross from the edge to one region. Mitigation: pin the origin to Singapore, since
  the users are in Malang. Actual latency is **unverified** and must be measured.
- **Per-PR database branching** is a feature Turso ships and Postgres-here does not, at least not
  investigated (unverified).
- **The honest concession on the boundary rule:** `pgSchema()` alone is a namespace, not a boundary.
  Choosing Postgres does not by itself enforce `patterns.md` rule 2 — and Turso's fine-grained
  tokens would enforce it more cheaply. The Postgres follow-up is per-domain roles with
  `GRANT`/`REVOKE` (one Hyperdrive configuration each, within the 25-per-account limit), or an
  ESLint import boundary as a cheaper first approximation.

### What would flip this decision to Turso

State it explicitly so the owner can weigh it rather than argue it.

*Corrected: a fourth item once stood here — that server-enforced per-domain token boundaries were an
advantage Postgres could not match. It is struck. `turso-fine-grained-tokens.md` §4a could not
establish that the engine enforces them, and the map ruled them out as a security boundary
([#31](https://github.com/afif-hh/fia-leadership/issues/31)). Per-domain isolation on the Turso path
is TypeScript plus an ESLint import boundary — the same strength `pgSchema()` alone offers, not more.*

- If exact decimal scoring, database-enforced enums, and `jsonb` are judged to be over-specified in
  `data-dictionary.md` — i.e. the Academic Lead accepts integer-scaled scores plus `CHECK`
  constraints as equivalent — then the strongest Postgres argument disappears.
- If avoiding Docker and running one Vitest configuration is worth more than testing the real
  engine's authorization layer in CI. *Note, added on correction: there is no local authorization
  layer to test on the Turso path, so this trade is not "test it locally versus test it in CI" — it
  is "do not test it at all".*
- If Drizzle ships stable support for `@tursodatabase/serverless`, which would move the Turso
  option onto the engine the vendor actually backs and remove the platform-transition objection
  almost entirely. **This is the single condition most worth watching.**

If two of those three hold, Turso becomes the right answer. None of them holds today.

### Follow-ups before this becomes an ADR

- Measure real p50/p95 query latency from a Workers deployment to Supabase Singapore, and — for
  comparison — to a Turso database in the nearest region (`turso db locations --show-latencies`).
  Both currently unverified.
- Decide caching policy: recommended is a single Hyperdrive configuration with caching disabled.
- Write the `audit_logs` append-only migration (`drizzle-kit generate --custom`) plus the
  authorization test asserting `UPDATE`/`DELETE` fails, and the dedicated app role it needs.
- Confirm Supabase's own branching story for per-PR databases (unverified in this document).
- Amend PRD §2 to record Supabase + Hyperdrive as the concrete Postgres deployment, and Workers
  (not Docker) as the deploy target. This document is research, not an approved decision — per
  `CLAUDE.md` rule 1 and PRD §2, a stack change needs an ADR approved by the Tech Lead.
