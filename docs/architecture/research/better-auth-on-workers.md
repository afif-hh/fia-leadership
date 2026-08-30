---
id: research-better-auth-on-workers
title: 'Research: better-auth under Nuxt 4 on Cloudflare Workers, and the identity schema it implies'
audience: both
load_when: 'membangun server/utils/auth.ts, menulis server/db/schema/identity.ts, merancang server/domain/identity/policy.ts, atau memutuskan cara role & consent disimpan'
status: research; not an approved decision (ADR owed — see #21)
issue: '#19'
depends_on: docs/architecture/research/db-on-workers.md, docs/architecture/research/turso-fine-grained-tokens.md
---

# better-auth under Nuxt 4 on Cloudflare Workers, and the `identity` schema it implies

## The question

[#19](https://github.com/afif-hh/fia-leadership/issues/19) asks two things that turn out to be one
thing: _does `better-auth` run in the Workers runtime_, and _what shape does the `identity` domain
take once better-auth owns four of its tables_.

The database and the auth library are already fixed for the purpose of this document — Turso/libSQL
(SQLite dialect, `drizzle-orm/libsql`) and `better-auth`. Neither is re-argued here. What follows
from those two choices is not fixed, and that is what this document settles: which runtime flags the
Worker needs, exactly which columns the schema generator emits for SQLite, whether better-auth's
tables can be pulled inside the `identity` naming convention, where the seven roles from
`docs/security/rbac.md` attach, where `identity.consents` sits, what
`server/domain/identity/policy.ts` can rely on reading, and how a Lab Admin actually signs in.

**Two constraints from the sibling research documents bind everything below.**

1. Per-domain isolation is **one libSQL database, one token, one Drizzle client per domain**, and
   fine-grained token enforcement is _not counted as a security boundary_
   (`turso-fine-grained-tokens.md`, Recommendation; [#31](https://github.com/afif-hh/fia-leadership/issues/31),
   [#34](https://github.com/afif-hh/fia-leadership/issues/34)). Isolation is enforced by TypeScript
   and an ESLint import boundary, not by the engine.
2. The Worker must use `@libsql/client/web`; the Node entrypoint is for local development and Vitest,
   because `@libsql/client/web` refuses `file:` URLs (`db-on-workers.md` §2).

Together these decide how the auth handler gets its database client: it does not get its own
credential, and it does not open a file. It receives the `identity` Drizzle handle from
`createDb(env, 'identity')`.

**Versions and dates.** Every claim below is against `better-auth@1.7.1`, published
**2026-08-18**, and `@better-auth/drizzle-adapter@1.7.1`, published the same day
([npm registry](https://registry.npmjs.org/better-auth)). The library moves fast — 926 published
versions as of writing — so a fact from an older release is a liability, and several findings here
contradict what older tutorials say. All URLs fetched 2026-08-22. Where a package's shipped `dist`
and the docs disagree, the shipped code is quoted and the disagreement is named.

---

## 1. Workers runtime viability

**Verdict: it runs, but `nodejs_compat` is mandatory, not optional, and password hashing puts a
hard floor under the plan you need.**

### 1a. Which dependencies touch Node APIs

`better-auth@1.7.1` declares these runtime dependencies
([npm registry](https://registry.npmjs.org/better-auth)):

```
zod, defu, jose, kysely, nanostores, better-call, @noble/hashes, @noble/ciphers,
@better-auth/core, @better-auth/utils, @better-fetch/fetch, @better-auth/telemetry,
@better-auth/mongo-adapter, @better-auth/kysely-adapter, @better-auth/memory-adapter,
@better-auth/prisma-adapter, @better-auth/drizzle-adapter
```

Nothing there is a Node-only package. `jose` is Web Crypto based, `@noble/*` are pure JS. But
scanning the _shipped_ `dist` of the published tarballs for `node:` imports turns up exactly four
runtime modules that reference a Node built-in, and two of them matter:

| Module                                                        | Built-in                | Reachable in a Worker?         |
| ------------------------------------------------------------- | ----------------------- | ------------------------------ |
| `@better-auth/core/async_hooks`                               | `node:async_hooks`      | **Yes — on every request**     |
| `better-auth/crypto/password` → `@better-auth/utils/password` | `node:crypto`           | **Yes — on sign-in / sign-up** |
| `better-auth/test-utils/*`                                    | `node:http`, `node:net` | No (test-only entrypoint)      |
| `@better-auth/drizzle-adapter` schema-generator chunk         | `node:fs`, `node:path`  | No (CLI-only chunk)            |

The first is the one that makes the flag non-negotiable. `@better-auth/core` dynamically imports
`node:async_hooks` and, when it fails, prints a warning that points _directly_ at Cloudflare's
compatibility-flag documentation
([`packages/core/src/async_hooks/index.ts`](https://github.com/better-auth/better-auth/blob/main/packages/core/src/async_hooks/index.ts)):

```ts
const AsyncLocalStoragePromise: Promise<typeof AsyncLocalStorage | null> =
	import(/* @vite-ignore */ /* webpackIgnore: true */ "node:async_hooks")
		.then((mod) => mod.AsyncLocalStorage)
		.catch((err) => {
			if ("AsyncLocalStorage" in globalThis) { return (globalThis as any).AsyncLocalStorage; }
			if (typeof window !== "undefined") { return null; }
			console.warn("[better-auth] Warning: AsyncLocalStorage is not available in this environment. Some features may not work as expected.");
			…
			console.warn("[better-auth] If you are using Cloudflare Workers, please see: https://developers.cloudflare.com/workers/configuration/compatibility-flags/#nodejs-compatibility-flag");
			throw err;
		});
```

The `package.json` of `@better-auth/core` gives `./async_hooks` a `workerd` export condition that
resolves to the `node:async_hooks` implementation rather than the `pure` one used for `edge` and
`browser`. So on Workers, better-auth takes the `AsyncLocalStorage` path deliberately. This is used
by `runWithAdapter(...)` around every request in
[`packages/better-auth/src/auth/base.ts`](https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/auth/base.ts),
so it is not an optional code path.

### 1b. Password hashing: scrypt, via `node:crypto`, on Workers too

This is the finding most likely to be got wrong from memory. better-auth delegates hashing to
`@better-auth/utils/password`, and the comment in
[`packages/better-auth/src/crypto/password.ts`](https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/crypto/password.ts)
says the choice is made by export condition:

```
 * `@better-auth/utils/password` uses the "node" export condition in package.json
 * to automatically pick the right implementation:
 *   - Node.js / Bun / Deno → `node:crypto scrypt` (libuv thread pool, non-blocking)
 *   - Unsupported runtimes → `@noble/hashes scrypt` (pure JS fallback)
```

That comment is **incomplete for Workers**, and the `package.json` is the authority. The `./password`
subpath in [`better-auth/utils`](https://github.com/better-auth/utils/blob/main/package.json)
carries an explicit `workerd` condition alongside `node`:

```json
"./password": {
  "workerd": { "import": "./dist/password.node.mjs", "require": "./dist/password.node.cjs" },
  "node":    { "import": "./dist/password.node.mjs", "require": "./dist/password.node.cjs" },
  "import":  "./dist/password.mjs",
  "require": "./dist/password.cjs"
}
```

So on Workers, better-auth uses the **`node:crypto` scrypt** implementation, not the `@noble/hashes`
fallback — provided the bundler applies the `workerd` condition. Nitro's Cloudflare presets do
exactly that: `exportConditions: ["workerd"]` appears on both the `cloudflare_pages` and
`cloudflare_module` presets in
[`src/presets/cloudflare/preset.ts`](https://github.com/nitrojs/nitro/blob/v2/src/presets/cloudflare/preset.ts).

The parameters, from
[`src/password.node.ts`](https://github.com/better-auth/utils/blob/main/src/password.node.ts):

```ts
import { scrypt, randomBytes } from 'node:crypto'
const config = { N: 16384, r: 16, p: 1, dkLen: 64 }
```

Two things follow, and both are load-bearing:

- **`r: 16` is double the scrypt default.** Working memory is `128 · N · r` = **32 MiB**, and
  `maxmem` is passed as `128 · N · r · 2` = **64 MiB**, against a Workers limit of "Memory per
  isolate | 128 MB" ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
  One hash at a time fits. Concurrent hashes in one isolate are closer to the edge than is
  comfortable.
- **Does workerd implement `scrypt`?** Yes, and the implementation detail matters. The Node crypto
  page lists `argon2`/`argon2Sync` as unsupported but not scrypt
  ([node:crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)), and
  workerd's source confirms it directly —
  [`src/node/internal/crypto_scrypt.ts`](https://github.com/cloudflare/workerd/blob/main/src/node/internal/crypto_scrypt.ts)
  exports both `scrypt` and `scryptSync`, and
  [`src/node/crypto.ts`](https://github.com/cloudflare/workerd/blob/main/src/node/crypto.ts) marks
  `crypto.scrypt` and `crypto.scryptSync` as implemented.

  But the callback form is **not** offloaded to a thread pool. workerd's `scrypt` resolves the
  native call synchronously inside the promise executor:

  ```ts
  new Promise<ArrayBuffer>((res, rej) => {
    try {
      res(cryptoImpl.getScrypt(password, salt, N, r, p, maxmem, keylen))
    } catch (err) {
      rej(err as Error)
    }
  })
  ```

  So the "non-blocking, libuv thread pool" assumption in better-auth's own comment does not hold on
  Workers. The full scrypt cost is charged to the isolate's CPU time, synchronously, on the request
  that signs in.

- **CPU budget.** Workers CPU limits are "Free: 10 ms" per request and "Paid: 5 min (default: 30
  seconds)" ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
  scrypt at `N=16384, r=16` is roughly an order of magnitude more work than the 10 ms budget on any
  plausible hardware. **UNVERIFIED:** the actual measured CPU milliseconds for one
  `hashPassword`/`verifyPassword` on Workers — it must be measured, not estimated. What _is_
  established is the direction: **password sign-in cannot work on the Workers Free plan**, and the
  Paid plan's 30 s default leaves ample headroom. Only endpoints that hash are affected; ordinary
  session reads do not hash.

If measurement later shows the cost unacceptable, `emailAndPassword.password.hash` / `.verify` are
documented override points ([`emailAndPassword`](https://www.better-auth.com/docs/reference/options#emailandpassword)),
so a cheaper KDF is a config change and not a fork. Note that changing it is a credential-format
change and needs a migration plan for existing hashes.

### 1c. Minimum wrangler / nitro configuration this implies

Nitro does **not** turn Node compatibility on for you. From
[`src/presets/cloudflare/utils.ts`](https://github.com/nitrojs/nitro/blob/v2/src/presets/cloudflare/utils.ts),
`enableNodeCompat` infers the setting from _your_ wrangler config:

```ts
const userCompatibilityFlags = new Set(config?.compatibility_flags || []);
if (
  userCompatibilityFlags.has("nodejs_compat") ||
  userCompatibilityFlags.has("nodejs_compat_v2") ||
  nitro.options.cloudflare.deployConfig
) {
  nitro.options.cloudflare.nodeCompat = true;
}
…
if (!nitro.options.cloudflare.nodeCompat) {
  if (nitro.options.cloudflare.nodeCompat === undefined) {
    nitro.logger.warn("[cloudflare] Node.js compatibility is not enabled.");
  }
  return;
}
```

and when it _is_ enabled, Nitro adds two flags, not one:

```ts
compatFlags.add('nodejs_compat')
compatFlags.add('no_nodejs_compat_v2')
```

With compatibility enabled, `node:crypto` and `node:async_hooks` are left as **external native
imports** rather than polyfilled — `crypto` and `async_hooks` are both in `builtnNodeModules` in
[`src/presets/_unenv/node-compat/cloudflare.ts`](https://github.com/nitrojs/nitro/blob/v2/src/presets/_unenv/node-compat/cloudflare.ts),
so they resolve to workerd's own implementations. Without it, the build silently emits a warning and
better-auth fails at runtime on the `AsyncLocalStorage` path.

One date detail worth recording because it will confuse someone: Cloudflare now says "For
compatibility dates of `2026-08-04` or later, Workers enables both `nodejs_compat` and
`nodejs_compat_v2` by default"
([Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)). That does
**not** make the flag redundant here, for two reasons: this repo's `nuxt.config.ts` currently sets
`compatibilityDate: '2025-07-15'`, which is well before the cutoff; and Nitro decides whether to
apply its node-compat build path by reading the flag out of your wrangler config, so omitting it
changes the _build_, not just the runtime.

Minimum configuration:

```jsonc
// wrangler.jsonc  (read by Nitro at build time, and by Wrangler at deploy time)
{
  "name": "fia-leadership",
  "main": "./.output/server/index.mjs",
  "compatibility_date": "2026-08-21",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "./.output/public", "binding": "ASSETS" },
}
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  compatibilityDate: '2026-08-21',
  nitro: { preset: 'cloudflare_module' },
})
```

Plus **Workers Paid**, for §1b. Secrets needed: `BETTER_AUTH_SECRET`, plus the two the database
factory already needs (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) — three of a 128-per-Worker budget
on Paid ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)). See
[#35](https://github.com/afif-hh/fia-leadership/issues/35) for how they are managed.

`better-auth` reads the secret from `BETTER_AUTH_SECRET` or `AUTH_SECRET` and "If none of these
environment variables are set, it will default to `"better-auth-secret-12345678901234567890"`. In
production, if it's not set, it will throw an error."
([`secret`](https://www.better-auth.com/docs/reference/options#secret)). On Workers,
`process.env` is not the natural source, so pass it explicitly (§8).

### 1d. Two smaller runtime facts, stated so they are not discovered in production

- **Rate limiting defaults to in-memory.** `rateLimit.storage` defaults to `"memory"` and rate
  limiting is enabled by default in production
  ([`rateLimit`](https://www.better-auth.com/docs/reference/options#ratelimit)). Worker isolates are
  ephemeral and numerous, so in-memory counters are close to no rate limiting at all. The options are
  `"database"` (adds a `rateLimit` table and a write per request) or `"secondary-storage"` (Workers
  KV or Durable Objects). Decide deliberately; do not inherit the default.
- **Telemetry defaults off.** `telemetry.enabled` default is `false`
  ([`telemetry`](https://www.better-auth.com/docs/reference/options#telemetry)). Set it explicitly to
  `false` anyway, so the setting is auditable rather than inherited.
- **`advanced.backgroundTasks.handler`** exists precisely for serverless, and the docs give
  `waitUntil` from `cloudflare:workers` as the example
  ([`backgroundTasks`](https://www.better-auth.com/docs/reference/options#backgroundtasks)). Useful
  later; not required for the foundation.

---

## 2. The Drizzle adapter over libSQL

**Verdict: supported as a first-class dialect, with `provider: "sqlite"`. The generator is genuinely
dialect-aware — nothing it emits for SQLite assumes Postgres. Two defaults need changing.**

### 2a. The adapter and its `provider` value

The Drizzle adapter is now a **separate package**, `@better-auth/drizzle-adapter`, not a subpath of
`better-auth` — a change worth noticing if you are copying an older snippet
([Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle)):

```ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { db } from './database.ts'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite' }),
})
```

The type is closed: `provider: "pg" | "mysql" | "sqlite"`
(`@better-auth/drizzle-adapter@1.7.1`, `dist/index.d.mts`). `drizzle-orm/libsql` produces a SQLite
`LibSQLDatabase`, so `"sqlite"` is the value. The package's `drizzle-orm` peer range is
`^0.45.2 || >=1.0.0-rc.1 <2.0.0`, and `drizzle-orm`'s current `latest` is `0.45.2`
([npm](https://registry.npmjs.org/drizzle-orm)) — so the stable line is in range without opting into
the v1 release candidate.

Two adapter defaults are wrong for this project:

- **`transaction` defaults to `false`.** From the shipped `dist/index.mjs`:
  `transaction: config.transaction ?? false ? (cb) => db.transaction(...) : false`. libSQL _does_
  support real interactive transactions and Drizzle wires into them (`db-on-workers.md` §3.2), so
  set `transaction: true`. Leaving it false means multi-write auth operations are not atomic, which
  is the exact failure mode this repo rejected D1 for.
- **`advanced.database.joins` defaults to `false`**, and the docs claim "upwards of 2x to 3x
  performance improvements" for `/get-session` when enabled
  ([Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle)). Enabling it requires
  Drizzle `relations` to be defined and passed through the adapter's `schema` object. Worth taking,
  but it is an extra correctness surface; treat as a follow-up, not part of the foundation.

`supportsUUIDs`, `supportsJSON` and `supportsArrays` are all hard-coded to
`config.provider === "pg" ? true : false` in `dist/index.mjs`. So on SQLite the adapter knows it must
generate IDs itself and serialise JSON itself. That is correct behaviour, not a limitation.

### 2b. What the generator actually emits for SQLite

The generator lives in the `auth` CLI (`auth@1.7.1`, published 2026-08-18 — note the package was
renamed: `npx auth@latest generate`; the old `@better-auth/cli` package's `latest` is stuck at
`1.4.21`). Reading `dist/index.mjs` in the published tarball gives the type map verbatim:

| better-auth field type           | SQLite output                                                           |
| -------------------------------- | ----------------------------------------------------------------------- |
| `string`                         | `text('name')`                                                          |
| `boolean`                        | `integer('name', { mode: 'boolean' })`                                  |
| `number`                         | `integer('name')`                                                       |
| `date`                           | `integer('name', { mode: 'timestamp_ms' })`                             |
| `json`                           | `text('name', { mode: "json" })`                                        |
| `string[]` / `number[]`          | `text('name', { mode: "json" })`                                        |
| `["a","b"]` (enum literal array) | `text('name', { enum: ['a', 'b'] })`                                    |
| id (default)                     | `text('id').primaryKey()`                                               |
| id (`generateId: "serial"`)      | `integer("id", { mode: "number" }).primaryKey({ autoIncrement: true })` |
| foreign key to an id             | `text('name')`                                                          |

Imports come from `drizzle-orm/sqlite-core`, and a `date` field with a `new Date()` default gets:

```ts
.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
```

**Nothing it emits for SQLite assumes Postgres.** The Postgres-only branches are explicitly guarded:
`pgSchema` / `schemaName`, `uuid("id").default(sql\`pg_catalog.gen_random_uuid()\`)`,
`.array()`, `jsonb`, `boolean`, `timestamp`, `bigint`— every one is behind`databaseType === "pg"`. The adapter's runtime query building is dialect-aware too; its
case-insensitive comparison helper is:

```ts
function insensitiveIlike(column, pattern, provider) {
  return provider === 'pg' ? ilike(column, pattern) : sql`LOWER(${column}) LIKE LOWER(${pattern})`
}
```

Three consequences for this repo's data rules:

1. **`text({ enum: [...] })` is a TypeScript-only constraint.** It produces no `CHECK`, on either
   dialect. This is the same gap [#28](https://github.com/afif-hh/fia-leadership/issues/28) is
   already open on. Any enum that better-auth or a plugin introduces inherits that ticket's policy;
   it does not get an exemption.
2. **Dates are epoch milliseconds in an `integer` column.** The adapter converts on read —
   `customTransformOutput` returns `new Date(data)` for any `date` field (`dist/index.mjs`) — so
   application code still sees `Date`. Raw SQL against these columns does not, which matters for
   audit queries and research export.
3. **Booleans are `0`/`1` integers.** Same caveat.

### 2c. IDs

The default is not a UUID and not a cuid. It is a 32-character random base62 string, from
[`packages/core/src/utils/id.ts`](https://github.com/better-auth/better-auth/blob/main/packages/core/src/utils/id.ts):

```ts
const generateId = (size) => createRandomStringGenerator('a-z', 'A-Z', '0-9')(size || 32)
```

`advanced.database.generateId` accepts a custom function, `false`, `"serial"` or `"uuid"`
([`advanced.database`](https://www.better-auth.com/docs/reference/options#advanced-database)). With
`"uuid"` on a SQLite adapter — where `supportsUUIDs` is false — better-auth generates the value in
JavaScript and stores it in the `text` column
([`packages/core/src/db/adapter/get-id-field.ts`](https://github.com/better-auth/better-auth/blob/main/packages/core/src/db/adapter/get-id-field.ts)):

```ts
if (generateId === 'uuid') return crypto.randomUUID()
```

`crypto.randomUUID()` is Web Crypto, available on Workers. Recommending `generateId: "uuid"` aligns
better-auth's ids with the `uuid` convention `docs/data/data-dictionary.md` already uses for
`assessment_versions.id`, at no cost — and it survives a later move to Postgres, where the same
setting produces a native `uuid` column.

### 2d. Hand-editing, and whether the CLI overwrites

The generated file **can** be hand-edited and extended — it is ordinary Drizzle schema code, and the
adapter's `schema` option exists precisely so your tables need not match better-auth's default names
([Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle)).

The CLI **does** overwrite. From the published `auth@1.7.1` bundle, the generator returns
`overwrite: fileExist`, the default target is `./auth-schema.ts`, and the write is unconditional
once confirmed:

```
Do you want to generate the schema to <fileName>?
…
await fs.writeFile(writePath, schema.code);
```

`--yes` skips the prompt. So the rule is: **never point `--output` at the hand-maintained schema
file.** Generate into a scratch path, diff, and port changes by hand. This should be a step in the
better-auth upgrade procedure, because plugin and core field changes arrive silently in minor
releases.

### 2e. Does better-auth need schema-write rights? No.

This is the concern #19 raises about a data-only token, and the answer is clean: **better-auth never
issues DDL when the adapter is Drizzle.** The CLI refuses, in as many words (published `auth@1.7.1`
bundle):

```
The migrate command only works with the built-in Kysely adapter.
For Drizzle, run `npx auth generate` to create the schema, then use Drizzle's migrate or push to apply it.
```

and the docs agree: "The migrate command applies the Better Auth schema directly to your database.
This is available if you're using the built-in Kysely adapter. For other adapters, you'll need to
apply the schema using your ORM's migration tool." ([CLI](https://www.better-auth.com/docs/concepts/cli))

So DDL stays where `CLAUDE.md` rule 5 puts it: `drizzle-kit generate` + `drizzle-kit migrate`, run
from CI, not from the Worker. The Worker's credential needs data rights only. (Under the one-token
decision in [#34](https://github.com/afif-hh/fia-leadership/issues/34) it carries everything anyway
— but the _design_ does not depend on schema rights, which is what matters if nine scoped tokens
ever return.)

One caveat for completeness: better-auth exposes `ctx.runMigrations` and a programmatic
`getMigrations` from `better-auth/db/migration`, and the docs suggest it for "environments where the
CLI isn't available (e.g. Cloudflare Workers, serverless functions)"
([Database](https://www.better-auth.com/docs/concepts/database)). That path is Kysely-only —
`init.ts` throws `"Database is not provided or it's an adapter. Migrations are only supported with a
database instance."` for an adapter. Do not use it; it is not reachable from this configuration.

---

## 3. The tables, and whether they sit inside the `identity` domain

### 3a. The four default tables, column by column

Taken from
[`packages/core/src/db/get-tables.ts`](https://github.com/better-auth/better-auth/blob/main/packages/core/src/db/get-tables.ts)
rather than from the docs, because the docs lag on one field (`account.issuer`).

**`user`** — the person.

| Field           | Type                                               | Notes                                  |
| --------------- | -------------------------------------------------- | -------------------------------------- |
| `id`            | id                                                 | pk                                     |
| `name`          | string, required, sortable                         | display name                           |
| `email`         | string, required, **unique**, sortable             | lower-cased on input by the Zod schema |
| `emailVerified` | boolean, required, default `false`, `input: false` | server-owned                           |
| `image`         | string, optional                                   | avatar URL                             |
| `createdAt`     | date, required, default now                        |                                        |
| `updatedAt`     | date, required, default now, `onUpdate`            |                                        |

**`session`** — one row per active browser session; the `token` is the cookie value.

| Field                     | Type                                                              | Notes                      |
| ------------------------- | ----------------------------------------------------------------- | -------------------------- |
| `id`                      | id                                                                | pk                         |
| `expiresAt`               | date, required                                                    |                            |
| `token`                   | string, required, **unique**                                      | the session cookie value   |
| `createdAt` / `updatedAt` | date, required                                                    | `updatedAt` has `onUpdate` |
| `ipAddress`               | string, optional                                                  | **PII at rest** — see §3d  |
| `userAgent`               | string, optional                                                  | **PII at rest** — see §3d  |
| `userId`                  | string, required, **indexed**, FK → `user.id` `onDelete: cascade` |                            |

**`account`** — one row per credential or linked provider identity for a user.

| Field                                            | Type                                              | Notes                                                                     |
| ------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------- |
| `id`                                             | id                                                | pk                                                                        |
| `issuer`                                         | string, required                                  | `local:credential` for email+password; `local:oauth:<provider>` for OAuth |
| `accountId`                                      | string, required                                  | the id at the provider; equals `user.id` for credentials                  |
| `providerId`                                     | string, required                                  | `"credential"` for email+password                                         |
| `userId`                                         | string, required, indexed, FK → `user.id` cascade |                                                                           |
| `accessToken` / `refreshToken` / `idToken`       | string, optional, **`returned: false`**           | never in API responses                                                    |
| `accessTokenExpiresAt` / `refreshTokenExpiresAt` | date, optional, `returned: false`                 |                                                                           |
| `scope`                                          | string, optional                                  | comma-separated accumulated grant                                         |
| `password`                                       | string, optional, **`returned: false`**           | the scrypt hash, `salt:key` hex                                           |
| `createdAt` / `updatedAt`                        | date, required                                    |                                                                           |

Plus a **unique index on `(issuer, accountId)`**, declared in `get-tables.ts` rather than as a column
attribute. `issuer` is recent; older docs and older generated schemas do not have it, which is
exactly the kind of drift §2d's regenerate-and-diff step is for.

**`verification`** — short-lived tokens (email verification, password reset, magic link, OAuth state
when `account.storeStateStrategy: "database"`).

| Field                     | Type                          | Notes                 |
| ------------------------- | ----------------------------- | --------------------- |
| `id`                      | id                            | pk                    |
| `identifier`              | string, required, **indexed** | what the token is for |
| `value`                   | string, required              | the token             |
| `expiresAt`               | date, required                |                       |
| `createdAt` / `updatedAt` | date, required                |                       |

A fifth table, `rateLimit` (`key` unique, `count`, `lastRequest` bigint), appears **only** if
`rateLimit.storage === "database"` — see §1d.

### 3b. Pulling them inside the `identity` naming convention

SQLite has no schemas, so `pgSchema('identity')` has no equivalent; `db-on-workers.md` §5.1 already
settled that the namespace becomes a **table-name prefix by convention**. better-auth supports that
two ways, and the difference matters.

The adapter's `schemaName` option is **Postgres-only** — its own JSDoc says "Only applies to
PostgreSQL", and the generator guards it with `databaseType === "pg" && schemaName`. On SQLite it is
inert. So the prefix must come from `modelName`, the `schema` map, or both
([Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle)):

```ts
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    transaction: true,
    schema: {
      user: identityUser,
      session: identitySession,
      account: identityAccount,
      verification: identityVerification,
    },
  }),
  user: { modelName: 'identity_user' },
  session: { modelName: 'identity_session' },
  account: { modelName: 'identity_account' },
  verification: { modelName: 'identity_verification' },
})
```

The `schema` map keys are better-auth's _model_ names and the values are your Drizzle tables — that
is the documented shape ("you need to manually pass the schema and map it to the user table",
`schema: { ...schema, user: schema.users }`). The `modelName` entries exist so that `auth generate`
emits the prefixed SQL names, keeping the generated reference file honest. Column names are
snake-cased by the generator unless `camelCase: true`, so `emailVerified` becomes `email_verified`
in SQL while application code keeps `user.emailVerified` — the docs are explicit: "Type inference in
your code will still use the original field names"
([Database](https://www.better-auth.com/docs/concepts/database#custom-table-names)).

So the answer to #19's question is **inside**: all four tables live in
`server/db/schema/identity.ts`, are named `identity_*`, and are reached only through
`server/domain/identity/*`. No other domain's repository may touch them —
`docs/architecture/patterns.md` rule 2 applies to them exactly as to hand-written tables.

### 3c. Which client the auth handler gets

It gets the `identity` handle, from the same factory every other domain uses:

```ts
const db = createDb(env, 'identity')            // server/db/client.ts, per #34
export const auth = betterAuth({ database: drizzleAdapter(db, { provider: 'sqlite', … }) })
```

There is no second credential and no schema-write credential, per §2e. The residual risk is the one
`turso-fine-grained-tokens.md` already names and accepts: the handle is the same credential as every
other domain's, so the boundary is TypeScript and ESLint, not the engine. better-auth does not widen
that risk — it only ever addresses the four tables it is configured with.

### 3d. One PII note that is easy to miss

`session.ipAddress` and `session.userAgent` are stored **at rest**, by default. `CLAUDE.md`'s PII
rule governs logs, traces, metrics and analytics, so this is not a violation of it — but it is
personal data in a table, and `docs/security/privacy-security.md` owns retention for it. If it is
not wanted, `advanced.ipAddress.disableIpTracking: true` turns off IP capture
([`advanced`](https://www.better-auth.com/docs/reference/options#advanced)). Decide, and record the
decision; do not let the default make it.

---

## 4. The seven roles

`docs/security/rbac.md` names seven: **Student · Lecturer/Coach · Lab Admin · Academic Lead ·
Researcher · Faculty Executive · External Partner**, with a matrix where five cells are `R*` —
"dibatasi oleh assignment, approval, cohort, atau tenancy".

**Is multi-role required?** `rbac.md` does not say so in words. But it does not forbid it, and the
matrix strongly implies it: a person who is both a coach and the Academic Lead is an ordinary
faculty situation, and `R*` means a grant is _scoped_ by assignment or cohort, which a single scalar
role cannot express. Treat multi-role as **required**, and scoped grants as required soon after.
This should be confirmed with the Academic Lead rather than assumed — flagged as an open item.

### Route (a) — a column on better-auth's `user` table via `additionalFields`

```ts
user: {
  additionalFields: {
    roles: { type: "string", required: false, defaultValue: "student", input: false },
  },
}
```

- **Cost:** near zero. One column, generated by `auth generate`, no new table, no join.
- **Reaches the session:** **yes, and it is cached.** This is the important verified detail. Fields
  in `user.additionalFields` are part of the user schema, so `parseUserOutput` includes them, and the
  cookie-cache writer serialises exactly that object
  ([`packages/better-auth/src/cookies/index.ts`](https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/cookies/index.ts)):

  ```ts
  async function setCookieCache(ctx, session, dontRememberMe) {
    if (!ctx.context.options.session?.cookieCache?.enabled) return;
    const filteredSession = filterOutputFields(session.session, ctx.context.options.session?.additionalFields);
    const filteredUser = parseUserOutput(ctx.context.options, session.user);
    …
  }
  ```

  So a role in `additionalFields` costs **zero database reads** on a cache hit. That is the whole
  argument for this route.

- **Enums:** `type: ["a","b",…]` is supported and generates `text(name, { enum: [...] })` — a
  TypeScript-only constraint, no `CHECK` (§2b). Under [#28](https://github.com/afif-hh/fia-leadership/issues/28)
  it needs a hand-written `CHECK` in a custom migration either way.
- **Multi-role:** only by encoding — CSV or JSON in one text column. No referential integrity, no
  index on a single role, no place to record who granted it or when.
- **`input: false` is essential**, and the docs say so: "Set this to `false` for server-owned fields
  such as `role`" ([Database](https://www.better-auth.com/docs/concepts/database#extending-core-schema)).
  Without it, a sign-up request body could set its own role. This is a real privilege-escalation
  shape, so it belongs in the review checklist for any `additionalFields` addition.

### Route (b) — a repo-owned `identity.user_roles` table

- **Cost:** one table, one repository, one service method, and a join or second query wherever roles
  are needed.
- **Reaches the session:** **not by itself.** The only supported way to put non-schema data into the
  session response is the `customSession` plugin — and the docs are explicit about the price:
  "Session caching, including secondary storage or cookie cache, does not include custom fields. Each
  time the session is fetched, your custom session function will be called."
  ([Session management](https://www.better-auth.com/docs/concepts/session-management#caveats-on-customizing-session-response)).
  On Workers against a single-region Turso database, that is **one extra network round trip on every
  authorized request**, forever. `db-on-workers.md` leaves the edge→region latency unverified but
  real; paying it per request on the hottest path in the application is the wrong default.
- **Enums:** a text column plus a `CHECK` constraint, written by hand in a
  `drizzle-kit generate --custom` migration — the same mechanism
  [#28](https://github.com/afif-hh/fia-leadership/issues/28) is deciding, and the same mechanism
  `turso-fine-grained-tokens.md` uses for the append-only trigger. It is a known, working pattern in
  this codebase's plan.
- **Multi-role:** natural. So is scoping (`cohort_id`, `assignment_id`), and so is the grant audit
  trail (`granted_by`, `granted_at`, `revoked_at`) that `rbac.md`'s audit section will eventually
  want.

### Route (c) — better-auth's own `admin()` / `organization()` plugin

The `admin()` plugin adds four columns to `user` and one to `session`
([Admin plugin](https://www.better-auth.com/docs/plugins/admin#schema)), and the shipped
`dist/plugins/admin/schema.mjs` shows their exact declarations:

```ts
user: { fields: {
  role:       { type: "string",  required: false, input: false },
  banned:     { type: "boolean", defaultValue: false, required: false, input: false },
  banReason:  { type: "string",  required: false, input: false },
  banExpires: { type: "date",    required: false, input: false },
} },
session: { fields: { impersonatedBy: { type: "string", required: false, input: false } } }
```

- Multi-role is supported, but the storage is a string: "A user can have multiple roles. Multiple
  roles are stored as string separated by comma (`,`)."
  ([Admin plugin](https://www.better-auth.com/docs/plugins/admin#roles)). `role` is declared
  `type: "string"`, not an enum array, so it generates a bare `text('role')` — **no enum list and no
  `CHECK`, even in TypeScript.** Route (a) with an explicit `type: [...]` is strictly better typed
  than the plugin's own column.
- It ships a second authorization engine: `createAccessControl`, `ac`, `roles`, `adminRoles`, and
  `/admin/*` endpoints whose access is decided inside better-auth. `rbac.md` requires the policy to
  live in `server/domain/identity/policy.ts` and requires every endpoint to map to a row of the
  access matrix. Adopting the plugin means two policy authorities, one of which does not know about
  cohorts, assignments or approvals — and `CLAUDE.md` rule 6 puts authorization in the service/policy
  layer. That is the decisive objection, and it is architectural rather than technical.
- Its warning is worth quoting because it is a trap for a seven-role system: "When **not** using
  custom access control, only `admin` and `user` exist as valid roles. Any role that isn't in the
  `adminRoles` list will **not** be able to perform admin operations."
- It does bring two genuinely useful things: `banned` / `banReason` / `banExpires` map almost exactly
  onto **FR-023** ("Admin dapat menonaktifkan akun tanpa menghapus historical records"), and
  `npx auth create-admin` is the shortest documented path to a first admin user (§7).
- The `organization()` plugin is a worse fit still. It adds `organization`, `member`, `invitation`
  (and `team`, `teamMember`, `organizationRole` when enabled) tables, with roles stored per
  membership — again as a comma-separated string
  ([Organization plugin](https://www.better-auth.com/docs/plugins/organization#roles)). It is
  multi-tenant machinery. FIA Leadership Lab is one faculty; `rbac.md`'s `R*` scoping is by cohort
  and assignment, not by tenant. Taking it means modelling cohorts as organizations, which
  misrepresents the domain and hands active-organization state to the client.

### Comparison

|                             | (a) `additionalFields` column | (b) `identity.user_roles`                                      | (c) `admin()` / `organization()`       |
| --------------------------- | ----------------------------- | -------------------------------------------------------------- | -------------------------------------- |
| New tables                  | 0                             | 1                                                              | 0 / 3–6                                |
| Reaches session             | **yes, cached, 0 DB reads**   | only via `customSession` → **1 DB read/request, never cached** | yes, cached (it is a user column)      |
| Typed enum                  | yes (`type: [...]`)           | yes, in TS                                                     | **no** (`type: "string"`)              |
| Engine-enforced enum        | no (needs `CHECK`, #28)       | no (needs `CHECK`, #28)                                        | no                                     |
| Multi-role                  | CSV/JSON in one column        | native rows                                                    | CSV in one column                      |
| Scoping (cohort/assignment) | no                            | **yes**                                                        | no                                     |
| Grant audit trail           | no                            | **yes**                                                        | no                                     |
| Second policy engine        | no                            | no                                                             | **yes**                                |
| Domain fit                  | fits                          | fits                                                           | organization: misrepresents the domain |

### Recommendation: (b) as the authority, with (a) as an explicit projection

Neither pure route is right. (b) alone buys a database read on every authorization check; (a) alone
cannot express multi-role, scoping, or who granted what.

So: **`identity_user_roles` is the single source of truth**, and
`user.additionalFields.roles` is a **derived, denormalised projection** of it — a canonical,
sorted, comma-separated list of the role codes a user currently holds, `input: false`, written
_only_ by `IdentityService.setRoles()` in the same transaction that writes `identity_user_roles`
(which is why §2a's `transaction: true` is not optional). The policy layer reads the projection off
the session for the coarse role check, and reads `identity_user_roles` only when a decision needs
scope — which is the `R*` cells, a minority of checks.

The denormalisation must be defended, not hidden:

- Every write to `identity_user_roles` goes through one service method, which rewrites the
  projection in the same transaction. No repository writes either side alone.
- A Vitest integration test asserts projection == table for a seeded fixture set, and a source-scan
  test asserts nothing outside `server/domain/identity/` writes `identity_user_roles` or
  `identity_user.roles` — the same class of compensating control
  `turso-fine-grained-tokens.md` requires for `audit_logs`, and required for the same reason: the
  engine will not catch it.
- Changing a user's roles revokes that user's sessions, so the projection cannot go stale beyond the
  cookie-cache window (§6).

---

## 5. `identity.consents`

**Verdict: a plain repo-owned table, next to better-auth's tables and not inside them. There is no
reason it should be anything else, and one strong reason it should not.**

better-auth has **no consent concept**. There is no consent table, no consent field, no consent
endpoint in `getAuthTables`, in the core schema docs, or in any first-party plugin. So the choice is
between modelling consent as a better-auth extension or as a repo-owned table, and the extension
loses:

- Consent is **per policy document, per version, over time** — `docs/data/data-dictionary.md`
  records `consents.policy_version` as "Wajib ada sebelum assessment bila berlaku". That is a
  one-to-many history, not a user attribute. An `additionalFields` boolean would destroy the history
  the field exists to keep.
- `rbac.md` places the gate "**sebelum** assessment dimulai bila kebijakan mensyaratkan (FR-003)" —
  at the point of assessment, not at sign-in. The check belongs to the assessment journey, reading
  the `identity` service, not to the authentication handler.
- Non-activation "**tidak** menghapus historical record" (FR-023), so consent rows must survive
  account deactivation. better-auth's `user` FKs are `onDelete: cascade`; a consent row hanging off
  a cascading FK is a row that can be deleted by a user-deletion path. A repo-owned table with a
  **restrict** (or nulling) FK is the safer shape, and the repo owns that decision only if the repo
  owns the table.

### Where better-auth's hooks help, and where they do not

`databaseHooks` exist for `user`, `session`, `account` and `verification`, with `before` and `after`
phases on create/update/delete
([`databaseHooks`](https://www.better-auth.com/docs/reference/options#databasehooks)), and the docs
show precisely the TOS-gate shape:

```ts
databaseHooks: {
  user: { create: { before: async (user, ctx) => {
    if (user.isAgreedToTerms === false) {
      throw new APIError("BAD_REQUEST", { message: "User must agree to the TOS before signing up." });
    }
    return { data: user };
  } } },
}
```

That is a real, usable mechanism, and `user.create.after` can insert the first consent row for a
self-registering user. But it is the wrong place for the _gate_ this project needs, because the
policy version in force at assessment time may be newer than the one accepted at sign-up. The gate
must be evaluated where `rbac.md` puts it.

**Contract:** `IdentityService.hasValidConsent(userId, policyId, requiredVersion)` is called by the
assessment service before a session is created, and the failure is an assessment-domain error, not
an authentication error. `user.create.after` may seed an initial acceptance row where the sign-up
flow actually collected one — an optimisation, not the guarantee.

**PII note.** If the consent row records evidence of acceptance (IP, user agent), that is personal
data at rest under `docs/security/privacy-security.md`, and it must not be echoed into logs. The
minimum honest row is `(user_id, policy_id, policy_version, accepted_at)`.

---

## 6. What the session carries, and what it costs to read

### 6a. The server-side shape

In a Nitro event handler, the documented call is
([Nuxt integration](https://www.better-auth.com/docs/integrations/nuxt#protect-server-routes)):

```ts
const session = await auth.api.getSession({ headers: event.headers })
if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
```

The return value is `{ session, user } | null`, where:

- `session` is the `session` row filtered to the schema plus `session.additionalFields` — so `id`,
  `token`, `userId`, `expiresAt`, `createdAt`, `updatedAt`, `ipAddress`, `userAgent`.
- `user` is the `user` row filtered by `parseUserOutput`, which includes **core fields, every
  `user.additionalFields`, and every plugin-contributed user field** whose `returned` is not `false`
  ([`packages/better-auth/src/db/schema.ts`](https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/db/schema.ts)).

That last point is the whole reason route (a) in §4 works: the projection column arrives on
`session.user.roles` with no extra configuration and no extra query.

### 6b. Database read per request, or not

By default, **yes** — every `getSession` reads the database. `session_token` is an opaque identifier
and the row must be fetched.

`session.cookieCache` removes that read. The mechanism, read from
[`packages/better-auth/src/api/routes/session.ts`](https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/api/routes/session.ts),
is: better-auth writes a second cookie, `session_data`, containing the serialised `{session, user}`;
on a subsequent request it validates that cookie, checks `session.session.token === sessionCookieToken`,
checks a version marker, checks expiry, and if all pass returns the cached objects **without
touching the database**. Three encodings are offered — `compact` (default; base64url + HMAC-SHA256),
`jwt` (HS256), `jwe` (encrypted, A256CBC-HS512)
([Session management](https://www.better-auth.com/docs/concepts/session-management#cookie-cache-strategies)).

`compact` and `jwt` are **signed but readable**. The role projection would therefore be visible to
anyone holding the cookie — which is the user themselves, so it leaks nothing they do not know. It is
also tamper-proof, which is the property that matters.

### 6c. The stale-role tradeoff, stated plainly

The docs do not hide it: "When `cookieCache` is enabled, revoked sessions may remain active on other
devices until the cookie cache expires (`maxAge`) … The server cannot directly delete cookies from
other devices."

Applied to roles: for up to `maxAge` seconds after a demotion, a cached session still carries the old
role, and revoking the session server-side does not shorten that window — the cached cookie is
self-contained. Three controls exist, and this design uses all three:

1. **A short `maxAge`.** 60 seconds, not the 300 the examples use.
2. **`cookieCache.version`.** A string or function evaluated on every cached read; a mismatch expires
   the cache immediately (verified in `session.ts`: `shouldExpireCookieCache = (session.version || "1") !== expectedVersion`).
   A deployment-wide role-epoch string here is a global cache-invalidation lever — useful for an
   incident, not for a routine demotion, since a function that consults the database reintroduces the
   read it was meant to avoid.
3. **`disableCookieCache: true`** on the specific calls that must not be stale. Supported on the
   server: `auth.api.getSession({ query: { disableCookieCache: true }, headers })`.

### 6d. The contract `server/domain/identity/policy.ts` can rely on

```ts
// server/domain/identity/session.ts
type AuthPrincipal = {
  userId: string
  email: string
  roles: RoleCode[]        // parsed from session.user.roles (the §4 projection)
  sessionId: string
  status: 'active' | 'disabled'
}

requireSession(event): Promise<AuthPrincipal>       // cookie-cached; ≤60 s stale roles
requireFreshSession(event): Promise<AuthPrincipal>  // disableCookieCache: true; 1 DB read
```

`requireFreshSession` is **mandatory** for every action `rbac.md` lists under Audit Classification —
submit assessment, change scoring config, access another student's profile, export a research
dataset, disable an account — and for any `Approve` cell in the access matrix. `requireSession` is
the default everywhere else. Scoped (`R*`) decisions additionally read `identity_user_roles` and the
relevant assignment/cohort tables through the identity service; the session alone can never answer
them, and the policy layer must not pretend it can.

Two contract details that will otherwise be discovered the hard way:

- **`getSession` sets `cache-control: no-store` and `pragma: no-cache`** on the response
  (`session.ts`). Do not attempt to layer Cloudflare caching over it.
- **`customSession` output is never cached** (§4). If a field is needed on every request, it belongs
  in `additionalFields`, not in `customSession`.

---

## 7. Sign-in for the Lab Admin

PRD **FR-002** says "Sistem mendukung login lokal atau integrasi SSO/OIDC pada fase integrasi" —
local login now, SSO later, and the PRD itself phases them. That settles the direction; what follows
is what each option actually costs today.

| Method                                     | Requires                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Exists in this repo today?                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **Email + password**                       | `emailAndPassword.enabled: true`. Nothing else, provided `requireEmailVerification` stays `false` and password reset is deferred. Workers Paid, for §1b.                                                                                                                                                                                                                                                                                                                       | Yes, once the plan is Paid                                  |
| **Magic link**                             | `magicLink({ sendMagicLink })` — you must supply the sender ([Magic link](https://www.better-auth.com/docs/plugins/magic-link)). An email service (Resend / SES / MailChannels) plus a verified sending domain.                                                                                                                                                                                                                                                                | **No.** No email dependency exists; `package.json` has none |
| **OAuth provider** (e.g. Google)           | A client id and secret from an external IdP, a registered redirect URI, and an institutional decision about which Google tenant is authoritative.                                                                                                                                                                                                                                                                                                                              | **No.** No IdP credentials, no decision                     |
| **SSO / OIDC / SAML** (`@better-auth/sso`) | A separate MIT-licensed package, `@better-auth/sso@1.7.1`, depending on `samlify`, `@xmldom/xmldom`, `fast-xml-parser`, `tldts`, `jose`. Plus a real IdP (Universitas Brawijaya's), its metadata, and someone at the university to register the SP. Self-service SSO is explicitly enterprise: "Need self-service SSO where your customers can configure their own SSO connections? [Contact us for enterprise]" ([SSO plugin](https://www.better-auth.com/docs/plugins/sso)). | **No.** No IdP relationship                                 |

**Recommendation: email + password, with self-registration disabled.**

```ts
emailAndPassword: {
  enabled: true,
  disableSignUp: true,             // no self-registration; accounts are provisioned
  requireEmailVerification: false, // no email service exists yet
  minPasswordLength: 12,
}
```

`requireEmailVerification` and `sendResetPassword` both require a sender
([`emailAndPassword`](https://www.better-auth.com/docs/reference/options#emailandpassword)), and this
repo has none. Setting `requireEmailVerification: true` without one locks every account out
permanently, which is the single most likely way to break this foundation.

**Getting the first Lab Admin in.** Two paths, and the tradeoff is the `admin()` plugin:

- `npx auth@latest create-admin --email … --name "…" --role admin` is the documented route
  ([CLI](https://www.better-auth.com/docs/concepts/cli#create-admin)) and uses the real
  `auth.api.createUser` path so hashing and database hooks run. But it "requires the Admin plugin and
  a persistent database", and §4 rejected the plugin.
- **A seed script**, which is what this design uses. `server/db/seed/create-lab-admin.ts`, run in
  Node against the same Turso database through the Node `@libsql/client` entrypoint, writing three
  rows in one transaction: `identity_user`; `identity_account` with
  `providerId: "credential"`, `issuer: "local:credential"`, `accountId: <user.id>`, and
  `password: await hashPassword(pw)` from `better-auth/crypto` (verified against
  `api/routes/sign-up.mjs` and `api/routes/sign-in.mjs` in the published tarball, which is where those
  exact literals come from); and one `identity_user_roles` row with `lab_admin`. Using better-auth's
  own `hashPassword` guarantees the `salt:key` hex format that `verifyPassword` expects. Per
  `docs/data/data-dictionary.md`, the seed takes the password from an environment variable and never
  commits one.

There is one CLI trap worth recording. The CLI stubs framework virtual modules, including
`cloudflare:workers` ([CLI](https://www.better-auth.com/docs/concepts/cli#common-issues)). So
`auth generate` — which needs only the config's shape — works even if the auth config reads bindings
from `cloudflare:workers`. Anything needing a live database from the CLI does not. This is another
reason the seed is a plain Node script with its own client rather than a CLI invocation.

**What is deferred, said plainly:** email verification, password reset, magic link, OAuth, and
SSO/OIDC. All five are deferred behind the same single missing dependency — a transactional email
service (the first three) or an IdP relationship (the last two). None of them is blocked by
better-auth, Workers, or the schema; the schema does not change when they arrive, because
`account` already carries every OAuth column and `verification` already exists. That is worth
stating because it means deferring costs no migration later.

---

## 8. Nuxt 4 integration specifics

### 8a. The handler

```ts
// server/api/auth/[...all].ts
import { auth } from '~~/server/utils/auth'

export default defineEventHandler((event) => auth.handler(toWebRequest(event)))
```

That is the documented shape ([Nuxt integration](https://www.better-auth.com/docs/integrations/nuxt)).
Note the deviation it forces: `docs/architecture/patterns.md` puts the HTTP layer at
`server/api/v1/**`, and better-auth's routes are mounted at `/api/auth/**`, outside the versioned
contract. The mount path is configurable via `basePath`, but the docs recommend keeping it, and
`docs/architecture/api-design.md` should record `/api/auth/**` as a documented exception rather than
have someone reconcile it later.

### 8b. The instance, and the Cloudflare env trap

The trap is real: on Workers, bindings are conventionally per-request, and `process.env` is not the
source of truth. But `betterAuth()` needs its database handle at construction time, because
`drizzleAdapter(db, …)` takes `db` as an argument.

The resolution is Cloudflare's `cloudflare:workers` module. The docs are precise about what it can
and cannot do at module scope
([Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/)): "Workers do not allow
I/O from outside a request context. This means that even though `env` is accessible from the
top-level scope, you will not be able to access every binding's methods." Environment variables and
secrets **are** readable at module scope; KV reads and subrequests are not.

Both things this needs are plain strings — `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` — and
constructing an `@libsql/client/web` client performs no I/O; the HTTP request happens per query,
inside a request context. So a module-scope singleton is viable:

```ts
// server/utils/auth.ts
import { env } from 'cloudflare:workers'
import { betterAuth } from 'better-auth/minimal'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { createDb } from '~~/server/db/client'
import * as identity from '~~/server/db/schema/identity'

const db = createDb(env, 'identity')

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    transaction: true,
    schema: {
      user: identity.identityUser,
      session: identity.identitySession,
      account: identity.identityAccount,
      verification: identity.identityVerification,
    },
  }),
  user: { modelName: 'identity_user', additionalFields: {/* roles, status — §4 */} },
  session: { modelName: 'identity_session', cookieCache: { enabled: true, maxAge: 60 } },
  account: { modelName: 'identity_account' },
  verification: { modelName: 'identity_verification' },
  emailAndPassword: { enabled: true, disableSignUp: true, requireEmailVerification: false },
  advanced: { database: { generateId: 'uuid' } },
  telemetry: { enabled: false },
})
```

`better-auth/minimal` rather than `better-auth`: the full entry statically imports the Kysely
adapter and the 28 KB migration compiler through
[`packages/better-auth/src/context/init.ts`](https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/context/init.ts),
none of which is reachable with a Drizzle adapter. The minimal entry exists exactly for this case —
its JSDoc example is `betterAuth({ database: drizzleAdapter(db, { provider: "pg" }) })`
([`packages/better-auth/src/auth/minimal.ts`](https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/auth/minimal.ts)).
Worth having against the Worker bundle-size limit.

**Is module-scope construction actually safe?** Reading
[`packages/better-auth/src/auth/base.ts`](https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/auth/base.ts),
`betterAuth()` calls `initFn(options)` **eagerly** and stores the resulting promise as
`$context`; the request handler awaits it. Tracing that path: `getBaseAdapter` calls
`options.database(options)` when `database` is a function, which is synchronous object construction;
`createAuthContext` contains no network call in the shipped `dist`. So no I/O is issued at module
scope, and the design is sound.

**UNVERIFIED:** this has not been run on a real Worker. Two residual risks are named rather than
waved away — a plugin's `init` hook could introduce I/O into that eager path, and Workers forbids
using an I/O object created in one request context from another. **Mitigation, and it costs almost
nothing: wrap the instance in a memoised lazy getter** so construction happens on the first request
instead of at module evaluation:

```ts
let _auth: ReturnType<typeof betterAuth> | undefined
export const getAuth = () => (_auth ??= betterAuth({/* as above */}))
```

The isolate is reused across requests, so this is one construction per isolate, not per request, and
it is immune to both risks. Prefer it until a deployed Worker proves the module-scope form.

### 8c. Client and SSR

```ts
// app/utils/auth-client.ts
import { createAuthClient } from 'better-auth/vue'
export const authClient = createAuthClient()
export const { signIn, signOut, useSession } = authClient
```

`better-auth/vue` (not `/react`) is what makes `useSession` return Vue refs. In a page's `setup`,
pass Nuxt's `useFetch` so the session loads on the server and hydrates rather than refetching:
`const { data: session } = await authClient.useSession(useFetch)`. In client-only widgets, call
`authClient.useSession()` with no argument.

The SSR caveat is documented and easy to trip over: "Aside from `useSession(useFetch)`, `authClient`
actions don't forward cookies during SSR by default, so they return as unauthenticated." Either call
them client-side, or build a request-scoped client that forwards `useRequestHeaders(['cookie'])`
([Nuxt integration](https://www.better-auth.com/docs/integrations/nuxt#use-the-client-during-ssr)).

`app/middleware/auth.ts` guarding portal routes is **defense in depth only** —
`docs/architecture/patterns.md` rule 3 and `CLAUDE.md` rule 6 both say the UI is not a security
boundary. Every protected server route calls `requireSession`/`requireFreshSession` regardless.

**On the community module:** `@nuxtjs/better-auth` exists and is actively published (`0.1.4`,
2026-08-21 — [npm](https://registry.npmjs.org/@nuxtjs/better-auth)). At `0.1.x` it is too young to
put underneath an institutional foundation, and the hand-wiring above is about fifteen lines. Revisit
at 1.x.

---

## Recommendation

### The `identity` schema

One file, `server/db/schema/identity.ts`, hand-maintained, SQL names prefixed `identity_`. Ownership
is marked because it decides who may change a column.

**better-auth-owned** — shape dictated by `getAuthTables`; regenerate with `auth generate` into a
scratch path and diff on every better-auth upgrade (§2d). Column types are SQLite per §2b: `date` →
`integer({ mode: 'timestamp_ms' })`, `boolean` → `integer({ mode: 'boolean' })`, ids →
`text` holding a UUID (`generateId: 'uuid'`).

| Table                   | Columns                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity_user`         | `id` pk · `name` · `email` unique · `email_verified` · `image` · `created_at` · `updated_at` · **`roles`** _(projection, §4, `input: false`)_ · **`status`** _(`active`/`disabled`, FR-023, `input: false`)_                                                                                            |
| `identity_session`      | `id` pk · `expires_at` · `token` unique · `created_at` · `updated_at` · `ip_address` · `user_agent` · `user_id` → `identity_user.id` cascade, indexed                                                                                                                                                   |
| `identity_account`      | `id` pk · `issuer` · `account_id` · `provider_id` · `user_id` → `identity_user.id` cascade, indexed · `access_token` · `refresh_token` · `id_token` · `access_token_expires_at` · `refresh_token_expires_at` · `scope` · `password` · `created_at` · `updated_at` · unique index `(issuer, account_id)` |
| `identity_verification` | `id` pk · `identifier` indexed · `value` · `expires_at` · `created_at` · `updated_at`                                                                                                                                                                                                                   |

**Repo-owned** — better-auth never reads or writes these.

| Table                 | Columns                                                                                                                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity_user_roles` | `id` pk · `user_id` → `identity_user.id` · `role` (`CHECK` over the seven codes, per #28) · `scope_type` nullable (`cohort` / `assignment` / null) · `scope_id` nullable · `granted_by` → `identity_user.id` · `granted_at` · `revoked_at` nullable · unique `(user_id, role, scope_type, scope_id)` where not revoked |
| `identity_consents`   | `id` pk · `user_id` → `identity_user.id` **restrict** (FR-023: rows outlive deactivation) · `policy_id` · `policy_version` · `accepted_at` · `method` · unique `(user_id, policy_id, policy_version)`                                                                                                                  |

`platform.audit_logs` stays in the `platform` domain with its `RAISE(ABORT)` triggers and
`append()`-only repository, exactly as `turso-fine-grained-tokens.md` specifies. Identity emits audit
events through the platform service interface, never by writing the table.

Role codes, from `rbac.md`: `student`, `lecturer_coach`, `lab_admin`, `academic_lead`, `researcher`,
`faculty_executive`, `external_partner`.

### Role attachment

`identity_user_roles` is the authority. `identity_user.roles` is a derived, sorted, comma-separated
projection with `input: false`, rewritten by `IdentityService.setRoles()` in the same transaction
(hence `transaction: true` on the adapter). Rationale: the projection rides the cookie cache and
costs zero reads on the hot path (§4, verified in `setCookieCache`), while the table carries
multi-role, `R*` scoping, and the grant trail that a single column cannot. No `admin()` plugin, no
`organization()` plugin — a second authorization engine conflicts with `rbac.md`'s requirement that
policy live in `server/domain/identity/policy.ts`.

Compensating controls, required rather than advisory: one service method owning both writes; an
integration test asserting projection == table; a source-scan test asserting no writes to either from
outside `server/domain/identity/`; and session revocation on every role change.

### Sign-in method

Email + password, `disableSignUp: true`, `requireEmailVerification: false`, `minPasswordLength: 12`.
First Lab Admin via a Node seed script writing `identity_user` + `identity_account`
(`provider_id: "credential"`, `issuer: "local:credential"`, `account_id: <user.id>`,
`password: await hashPassword(pw)` from `better-auth/crypto`) + `identity_user_roles`. Deferred:
email verification, password reset, magic link, OAuth, SSO/OIDC — all behind one missing email
service or one missing IdP relationship, and none of them changing the schema.

### Session-reading contract

```
requireSession(event)       → AuthPrincipal   (cookie cache, maxAge 60 s, 0 DB reads)
requireFreshSession(event)  → AuthPrincipal   (disableCookieCache: true, 1 DB read)
```

`AuthPrincipal = { userId, email, roles: RoleCode[], sessionId, status }`, parsed from
`session.user`. `requireFreshSession` is mandatory for every action in `rbac.md`'s Audit
Classification list and every `Approve` cell. `R*` decisions read `identity_user_roles` plus the
relevant assignment/cohort data through the identity service — the session cannot answer them and the
policy layer must not pretend otherwise. Worst-case staleness is bounded at 60 s; `cookieCache.version`
is the incident-time global invalidation lever.

### Minimal file and config layout

```
wrangler.jsonc                              # compatibility_flags: ["nodejs_compat"]  (§1c)
nuxt.config.ts                              # nitro.preset 'cloudflare_module', compatibilityDate
server/utils/auth.ts                        # memoised lazy betterAuth() from 'better-auth/minimal'
server/api/auth/[...all].ts                 # auth.handler(toWebRequest(event))
server/db/client.ts                         # createDb(env, domain) — existing, per #34
server/db/schema/identity.ts                # all identity_* tables, hand-maintained
server/db/migrations/                       # drizzle-kit generate output, incl. custom CHECKs
server/db/seed/create-lab-admin.ts          # first Lab Admin, password from env
server/domain/identity/policy.ts            # the RBAC policy rules  (#20)
server/domain/identity/session.ts           # requireSession / requireFreshSession
server/domain/identity/roles.repo.ts        # identity_user_roles + projection, one writer
server/domain/identity/consents.repo.ts     # identity_consents
app/utils/auth-client.ts                    # createAuthClient from 'better-auth/vue'
app/middleware/auth.ts                      # defense in depth only
```

Secrets: `BETTER_AUTH_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. Plan: **Workers Paid**
(§1b).

### What changes if the database were Postgres instead of Turso

There is a live ticket reconsidering the database, and `db-on-workers.md` in fact recommends
Postgres. So it is worth saying which parts of this design are database-independent. Most of it is.

**Unchanged:** everything in §1 (the Workers runtime facts, `nodejs_compat`, scrypt, the CPU floor
and the Paid-plan requirement) — none of it involves the database. Every column _meaning_ in §3a. The
role decision in §4, the consent design in §5, the session contract in §6, the sign-in choice in §7,
and the whole of §8 including the `cloudflare:workers` env pattern and the lazy singleton. The
adapter API is identical.

**Changes:**

- `provider: "pg"`, and `drizzle-orm/node-postgres` over Hyperdrive replaces `drizzle-orm/libsql`.
  Hyperdrive brings its own `nodejs_compat` requirement, which this design already satisfies, and its
  default-on query cache, which `db-on-workers.md` says must be explicitly disabled for the portal.
- **The `identity_` prefix disappears.** The adapter's `schemaName: "identity"` becomes live and the
  generator emits `pgSchema("identity")` with `authSchema.table("user", …)`
  ([Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle#custom-schema-namespace)) —
  a real namespace, matching `patterns.md` rule 4 with no `modelName` overrides at all. This is the
  single largest simplification Postgres buys here.
- **Column types become native.** `boolean` → `boolean`, `date` → `timestamp`, arrays → `.array()`,
  json → `jsonb`, and `generateId: "uuid"` emits
  `uuid("id").default(sql\`pg_catalog.gen_random_uuid()\`)`rather than a JS-generated UUID in a`text`column.`supportsUUIDs`, `supportsJSON`and`supportsArrays`all flip to`true` in the
  adapter.
- **The role enum can be engine-enforced.** A native Postgres enum or a `CHECK` on
  `identity.user_roles.role` — and #28's whole problem class shrinks.
- `insensitiveIlike` uses real `ILIKE` instead of `LOWER(...) LIKE LOWER(...)`, so a case-insensitive
  index becomes possible.
- The migration story reverts to what the PRD already assumes, including testcontainers Postgres for
  integration tests, so the append-only and `CHECK` assertions become testable against the real
  engine.

Net: switching to Postgres would _simplify_ this design — fewer `modelName` overrides, a real schema
namespace, engine-enforced enums — and would invalidate none of its decisions. Nothing here should be
built in a way that depends on SQLite.

---

## Open items, stated as unverified

- **UNVERIFIED (must measure before launch):** actual CPU milliseconds for one
  `hashPassword`/`verifyPassword` on Workers at `N=16384, r=16, p=1`. The Free-plan 10 ms limit is
  certainly exceeded; the margin against the Paid 30 s default is assumed large but unmeasured
  (§1b).
- **UNVERIFIED:** whether concurrent sign-ins in one isolate can approach the 128 MB isolate memory
  limit at 32 MiB of scrypt working memory each (§1b).
- **UNVERIFIED (mitigated, not settled):** that a module-scope `betterAuth()` constructs cleanly on a
  real Worker. No I/O was found in the eager `init` path in the shipped `dist`, but this has not been
  deployed. The memoised lazy getter in §8b removes the risk; use it (§8b).
- **UNVERIFIED:** whether `@better-auth/sso` runs on Workers at all. It imports `node:crypto`'s
  `X509Certificate` (which workerd does implement) and `samlify` at module top level, and `samlify`'s
  runtime requirements on workerd were not investigated. Irrelevant to this foundation, blocking for
  FR-002's SSO phase (§7).
- **UNVERIFIED:** that `drizzle-kit` with `dialect: 'turso'` handles the custom `CHECK` and
  `RAISE(ABORT)` migrations this design needs alongside the generated ones. Inherited from
  `db-on-workers.md` §2 and `turso-fine-grained-tokens.md`, not re-tested here.
- **UNVERIFIED:** whether libSQL's SQLite version supports `RETURNING`, which the Drizzle adapter
  uses on every insert for non-MySQL providers (`(await builder.returning())[0]`). SQLite has
  supported it since 3.35 and libSQL is a recent fork, so this is very likely fine — but it is on the
  write path for every user, session and account row, so it should be confirmed by the first
  integration test rather than assumed.
- **UNVERIFIED:** the exact interaction between Nitro's `no_nodejs_compat_v2` flag and Cloudflare's
  new default-on `nodejs_compat_v2` for compatibility dates ≥ 2026-08-04. Nitro adds the opt-out
  deliberately, and the recommended config pins an explicit `nodejs_compat`, so no conflict is
  expected — but the combination was not exercised (§1c).
- **NEEDS A DECISION, not research:** whether multi-role is required. §4 argues yes from the `R*`
  cells but `rbac.md` does not say so. The Academic Lead should confirm, because a "no" would make
  route (a) alone sufficient and remove a table.
- **NEEDS A DECISION:** `rateLimit.storage`. The `"memory"` default is close to no rate limiting on
  Workers (§1d). Choose `"database"` or a KV-backed secondary storage.
- **NEEDS A DECISION:** whether `session.ipAddress` / `userAgent` are retained at all
  (§3d), and what `identity_consents` records as evidence of acceptance (§5).
- **DOCUMENTATION DEBT:** `docs/architecture/api-design.md` must record `/api/auth/**` as a
  documented exception to the `server/api/v1/**` convention (§8a). `docs/security/rbac.md` should
  gain the `requireSession` / `requireFreshSession` distinction as a normative rule, not just a
  research note.

This document is research, not an approved decision. Per `CLAUDE.md` rule 1 and PRD §2, the stack
deviations it assumes — Cloudflare Workers instead of Docker, Turso instead of PostgreSQL,
better-auth as the auth library — each need an ADR approved by the Tech Lead;
[#21](https://github.com/afif-hh/fia-leadership/issues/21) tracks that debt. Nothing here changes
scoring, so no Academic Lead approval is required except for the multi-role question above.
