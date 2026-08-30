---
id: research-turso-fine-grained-tokens
title: 'Research: Turso fine-grained tokens — per-domain isolation, append-only audit_logs, and the local-dev gap'
audience: both
load_when: 'merancang server/db/client.ts di atas Turso, menegakkan boundary per domain lewat token, atau menjamin audit_logs append-only'
status: research; Recommendation superseded by the decisions in #31 and #34 — see the banner
issue: '#16'
depends_on: docs/architecture/research/db-on-workers.md
---

# Turso fine-grained tokens: per-domain isolation, append-only `audit_logs`, and what survives local development

> **Superseded in part — read this first.**
>
> The findings below stand. The **recommendation** does not: it proposed one scoped token per domain,
> nine in total. Two decisions taken after this research was written replace that.
>
> 1. Fine-grained tokens are **not counted as a security boundary**
>    ([#31](https://github.com/afif-hh/fia-leadership/issues/31)). §4a could not establish that the
>    engine `@libsql/client` reaches enforces them, and the source shows a fail-open path. Rather than
>    wait on the experiment, the map ruled that nothing may depend on them.
> 2. The design uses **one token**, not nine
>    ([#34](https://github.com/afif-hh/fia-leadership/issues/34)). With the security benefit
>    uncounted, nine tokens buy defence-in-depth at the price of nine Worker secrets, an atomic
>    nine-secret rotation, and a rotation event on every migration that adds a table. The factory
>    shape is kept, so nine remains a one-line change if the flip condition ever fires.
>
> A `RAISE(ABORT)` trigger is the append-only guarantee for `audit_logs`, with an `append()`-only
> repository interface and a source-scan test as the required compensating control — required, not
> optional, because a credential with DDL rights can `DROP` the trigger and there is no second line.
>
> Sections 1 through 6 are evidence and are left exactly as researched. Only the Recommendation is
> rewritten. Where the two disagree, the Recommendation is current.

## The question

`docs/architecture/research/db-on-workers.md` §5.1 and §5.2 rest a large part of the Turso case on
one mechanism: **fine-grained token permissions**. The claim there was that a per-domain token gives
"real enforcement without giving up referential integrity", and that a token scoped
`audit_logs:data_add,data_read` is "a genuine server-side append-only guarantee". That document
itself flagged two things as _unverified_: whether fine-grained permissions apply to the engine
Drizzle can reach, and whether they are available on the Free plan.

This document resolves those two questions and the surrounding design, against primary sources only.

Its conclusion is not the one the ticket assumed. Read §4 first if you read nothing else.

**Terminology, because it decides every fact below.** Turso Cloud hosts two engines:

> "It hosts two database engines, both fully compatible with SQLite: **Turso** — a ground-up rewrite
> of SQLite … **libSQL** — a fork of SQLite, battle-tested in production on Turso Cloud for years."
> — [Turso Cloud](https://docs.turso.tech/turso-cloud.md)

The two are reached by different URL schemes and different client packages:

> "SDKs connect using the `turso://` protocol for [Turso](/tursodb/quickstart) databases and the
> `libsql://` protocol for [libSQL](/libsql) databases"
> — [Authentication](https://docs.turso.tech/sdk/authentication.md)

Throughout this document, **"Turso Database"** / **"the rewrite"** means the first; **"libSQL"**
means the second. Drizzle can only reach the second over the network (§4a). All URLs were fetched
2026-08-21.

---

## 1. The token model

### 1a. The syntax in the ticket is correct, with one wrinkle

Verified against the docs rather than inherited. The format is
`<table-name|all>:<action1>,<action2>`:

> "Permissions follow the format `<table-name|all>:<action1>,<action2>`" … "Use `all` as the table
> name to apply permissions to every table."
> — [Fine-Grained Permissions](https://docs.turso.tech/sdk/authorization/fine-grained-permissions.md)

The full action set is seven, not four — the ticket's four data actions plus three schema actions
([same page](https://docs.turso.tech/sdk/authorization/fine-grained-permissions.md)):

| Action          | Description (verbatim) |
| --------------- | ---------------------- |
| `data_read`     | Read data from tables  |
| `data_add`      | Insert new rows        |
| `data_update`   | Update existing rows   |
| `data_delete`   | Delete rows            |
| `schema_add`    | Create new tables      |
| `schema_update` | Modify table schemas   |
| `schema_delete` | Drop tables            |

One documented carve-out:

> "`data_read` is allowed on SQLite system tables (e.g., `sqlite_master`, `sqlite_schema`) by
> default, allowing users to query database metadata."
> — [same page](https://docs.turso.tech/sdk/authorization/fine-grained-permissions.md)

So schema _shape_ is readable by every token regardless of grants. Irrelevant for this project (the
schema is public in the repo), but worth knowing before treating a scoped token as a confidentiality
boundary.

**The wrinkle: the CLI's own help text disagrees with the docs and validates nothing.** The flag is
declared in
[`internal/flags/fine_grained_permissions.go`](https://github.com/tursodatabase/turso-cli/blob/main/internal/flags/fine_grained_permissions.go):

```go
cmd.Flags().StringArrayVarP(&fineGrainedPermissions, "permissions", "p", nil,
    "fine-grained permissions in format <table-name|all>:<action1>,...\n(e.g: -p all:data_read -p comments:data_insert)")
```

Note `data_insert` in the CLI example versus `data_add` in the docs and in the launch blog post. The
same file shows the parser does a bare `strings.Split` on the action list and **never validates the
action names** — it only checks that the `table:actions` colon is present. A typo'd or obsolete
action name is therefore accepted by the CLI and forwarded to the API as-is. Whether the server
rejects an unknown action or silently drops it is **UNVERIFIED**. Practical consequence: mint tokens
through a checked-in script, and always verify a freshly minted token behaves as intended before
deploying it.

### 1b. One token can carry an allowlist of several tables with different actions

Explicitly supported, and this is the shape the design needs
([Fine-Grained Permissions](https://docs.turso.tech/sdk/authorization/fine-grained-permissions.md)):

```bash
turso db tokens create mydb \
  -p all:data_read \
  -p comments:data_add,data_update \
  -p posts:data_add,data_update,data_delete
```

The wire format confirms it is a list of rules, each with its own table set and action set — from
[`internal/flags/fine_grained_permissions.go`](https://github.com/tursodatabase/turso-cli/blob/main/internal/flags/fine_grained_permissions.go)
and
[`internal/turso/databases.go`](https://github.com/tursodatabase/turso-cli/blob/main/internal/turso/databases.go):

```go
type FineGrainedPermissions struct {
    TableNames        []string `json:"t"`
    AllowedOperations []string `json:"a"`
}

type DatabaseTokenRequest struct {
    Permissions            *PermissionsClaim              `json:"permissions,omitempty"`
    FineGrainedPermissions []flags.FineGrainedPermissions `json:"fine_grained_permissions,omitempty"`
}
```

`all` is encoded as an _empty_ `TableNames` array (the Go code appends nothing when the table name is
literally `all`), so "all tables" is a distinct wire state, not a table named `all`.

**Answer to the design question: one client per domain, not nine clients per table-set-per-table.**
A single token expresses the whole per-domain allowlist, so `server/db/client.ts` needs one
`@libsql/client` instance per domain token, i.e. nine — see §2 and the Recommendation.

### 1c. Maximum granularity is table + action. Not row, not column

The scoping ladder is documented explicitly, and it stops at the table
([Authorization](https://docs.turso.tech/sdk/authorization.md)):

| Level              | Scope                           | How to create                       |
| ------------------ | ------------------------------- | ----------------------------------- |
| **Group**          | Access all databases in a group | `turso group tokens create <group>` |
| **Database**       | Access a single database        | `turso db tokens create <database>` |
| **Read-only**      | Queries only, no writes         | Add `--read-only` flag              |
| **Table + Action** | Specific tables and operations  | Add `-p <table>:<actions>` flag     |
| **Time-limited**   | Auto-expires after a duration   | Add `--expiration 7d` flag          |

There is no row-level or column-level scope anywhere in the docs, and the wire structure above has
no room for a predicate. **Row-level security equivalent to Postgres RLS does not exist.** For this
project that matters in one place: multi-tenancy by cohort or by faculty cannot be enforced by a
token — it stays application logic. The Turso Database SQL reference has no `CREATE POLICY`
statement in its statement index either
([docs index](https://docs.turso.tech/llms.txt)).

Note also what the ladder implies about **namespace** granularity: on Turso Cloud the unit above
"database" is a _group_, and a group token reaches every database in it. There is no per-namespace
sub-division inside a database. The old shared-schema multi-database feature is deprecated for new
users — "This feature is now deprecated for all new users. Existing paid users can continue to use
Multi-DB Schemas"
([Multi-DB Schemas](https://docs.turso.tech/features/multi-db-schemas.md)) — so the only real choices
are _one database with nine scoped tokens_ or _nine databases_. §6 costs the latter.

---

## 2. Provisioning, storage, rotation

### 2a. Minting: CLI yes, documented Platform API no

**CLI** — the flag lives on `turso db tokens create` and `turso group tokens create`
([Platform Tokens](https://docs.turso.tech/sdk/authorization/tokens.md)):

| Flag                  | Description (verbatim)                             |
| --------------------- | -------------------------------------------------- |
| `-r`, `--read-only`   | Create a read-only token (queries only, no writes) |
| `-p`, `--permissions` | Set fine-grained permissions per table and action  |
| `-e`, `--expiration`  | Set token expiration (`never`, `7d`, `30d`, etc.)  |

Worth flagging as a documentation defect: the CLI reference page for the very same command,
[`db tokens create`](https://docs.turso.tech/cli/db/tokens/create.md), lists **only** `--expiration`
and `--read-only`. `-p` is absent from it. The flag does exist — the Go source above proves it — but
two Turso pages describing one command disagree, which is a sign of how young this feature is.

**Platform API — the documented endpoint cannot do it.** `POST
/v1/organizations/{org}/databases/{db}/auth/tokens` takes exactly two query parameters,
`expiration` and `authorization` (enum: `full-access` | `read-only`), and its request body schema
`CreateTokenInput` has exactly one property: `permissions.read_attach.databases`
([Generate Database Auth Token](https://docs.turso.tech/api-reference/databases/create-token.md); the
group equivalent at [Create Group Auth Token](https://docs.turso.tech/api-reference/groups/create-token.md)
is identical). **There is no documented API parameter for fine-grained permissions.**

The CLI nonetheless sends them, as an _undocumented_ JSON body field on the same endpoint —
[`internal/turso/databases.go`](https://github.com/tursodatabase/turso-cli/blob/main/internal/turso/databases.go)
posts `DatabaseTokenRequest{FineGrainedPermissions: …}` to
`/{database}/auth/tokens?expiration=…&authorization=…`, and
[`internal/turso/databases_v3.go`](https://github.com/tursodatabase/turso-cli/blob/main/internal/turso/databases_v3.go)
does the same against `/v3/organizations/{orgID}/databases/{dbID}/auth/tokens`. So automating token
minting from CI is possible, but it means either shelling out to the `turso` CLI or depending on an
undocumented request field. **Recommendation: shell out to the CLI.** An undocumented field can
change without a changelog entry.

**JWKS** is the third route, and it does support fine-grained permissions
([External Auth Providers](https://docs.turso.tech/sdk/authorization/jwks.md)):

```bash
turso org jwks template \
  --database <database-name> \
  --permissions all:data_read \
  --permissions comments:data_add
```

It is not relevant to this project's server-side design — it exists so a _browser_ can hold a
per-user token — and it carries its own limits: "During the Turso Beta, we only support Clerk &
Auth0 as OIDC providers", plus a warning that matters generally: "If you don't setup a JWT template
with specific permissions, the generated tokens will have access to **all databases in all groups**
by default" ([same page](https://docs.turso.tech/sdk/authorization/jwks.md)). **Turso tokens fail
open, not closed.** Keep that in mind for §4a.

### 2b. Expiry and rotation — the operationally expensive part

Expiry is opt-in and **defaults to never**. The Platform API schema gives
`expiration: {type: string, default: never}`
([create-token](https://docs.turso.tech/api-reference/databases/create-token.md)); the CLI accepts
`never` or a duration such as `7d` or `7d3h2m1s`
([db tokens create](https://docs.turso.tech/cli/db/tokens/create.md)).

Rotation is the problem. There is exactly one revocation primitive and it is not per-token:

> "You can invalidate all existing tokens for a database or group, which **rotates the signing
> keys**" — `turso db tokens invalidate <database-name>` / `turso group tokens invalidate <group-name>`
> — [Platform Tokens](https://docs.turso.tech/sdk/authorization/tokens.md)

and, stated even more bluntly on the group endpoint:

> "Tokens cannot be retrieved once created, and cannot be revoked individually."
> — [Create Group Auth Token](https://docs.turso.tech/api-reference/groups/create-token.md)

**Consequence for a nine-token design: there is no such thing as rotating one domain's token.**
Compromise or scheduled rotation of any single token means invalidating the database's signing keys,
which invalidates all nine, which means re-minting nine tokens and pushing nine Worker secrets in
one coordinated deploy. Any window between key rotation and the last secret landing is a hard
outage for the domains not yet updated. This is a genuine operational cost that
`db-on-workers.md` §5.1 under-counted when it wrote "nine tokens to provision, store and rotate".

A second, subtler cost: because a token names its tables explicitly, **adding a table to a domain
means re-minting that domain's token** — and by the previous paragraph, re-minting one means
re-minting all nine. So every migration that adds a table becomes a credential-rotation event. The
`all:` wildcard avoids this but throws away the isolation the token was for.

### 2c. Reaching the Worker, and the secret count

Cloudflare's mechanism is ordinary Worker secrets. `npx wrangler secret put <KEY>` — noting that it
"creates a new version of the Worker and deploys it immediately" — or bulk upload with
`npx wrangler deploy --secrets-file .env.production`, with access via the `env` parameter,
`import { env } from "cloudflare:workers"`, or `process.env` under Node compat
([Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)). Local development
uses a `.dev.vars` or `.env` file (not both), which "should not be committed to git"
([same page](https://developers.cloudflare.com/workers/configuration/secrets/)).

Count implied by the design: **one `TURSO_DATABASE_URL` plus nine `TURSO_TOKEN_<DOMAIN>` = ten
variables.** Well within the platform limit of "Variables per Worker (secrets + text)" of 64 on
Free and 128 on Paid, 5 KB each
([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)) — JWTs are
comfortably under 5 KB. So the ceiling is not the constraint; the rotation coupling in §2b is.

For local dev the honest answer is that these nine secrets have **nothing to bind to** — see §5.

---

## 3. Does append-only actually work?

### 3a. On paper, yes; the action taxonomy covers every write path by name

Granting `audit_logs:data_read,data_add` and withholding the rest maps onto SQL as follows, using
only the documented action descriptions
([Fine-Grained Permissions](https://docs.turso.tech/sdk/authorization/fine-grained-permissions.md)):

| SQL                        | Action needed   | Withheld? |
| -------------------------- | --------------- | --------- |
| `INSERT INTO audit_logs …` | `data_add`      | granted   |
| `SELECT … FROM audit_logs` | `data_read`     | granted   |
| `UPDATE audit_logs …`      | `data_update`   | withheld  |
| `DELETE FROM audit_logs …` | `data_delete`   | withheld  |
| `DROP TABLE audit_logs`    | `schema_delete` | withheld  |
| `ALTER TABLE audit_logs …` | `schema_update` | withheld  |

That is a better-shaped taxonomy than a Postgres `GRANT` list, because it separates DDL from DML
without a second privilege system.

### 3b. What is NOT established — and these are not nitpicks

Turso publishes **no specification of the enforcement mechanism**. There is no page describing
whether permissions are checked by parsing the statement, by a SQLite-authorizer-style callback
during execution, or somewhere else. Everything below is therefore **UNVERIFIED** and must be
settled empirically before any of it is written into a design document as a guarantee:

- **`INSERT … ON CONFLICT DO UPDATE`** — semantically an update. Whether it requires `data_update`,
  or slips through as an insert, is **UNVERIFIED**. Turso documents the upsert syntax itself
  ([UPSERT](https://docs.turso.tech/sql-reference/statements/upsert.md) is in the statement index,
  [docs index](https://docs.turso.tech/llms.txt)) but says nothing about its permission
  requirements. This one is decisive for append-only: an upsert that only needs `data_add` is a
  silent hole straight through the guarantee.
- **`REPLACE INTO` / `INSERT OR REPLACE`** — implemented in SQLite as delete-then-insert. Whether it
  requires `data_delete` is **UNVERIFIED**, and it is the second obvious hole.
- **Writes performed by a trigger** — whether the trigger body runs under the caller's permissions
  or with full engine authority is **UNVERIFIED**. This cuts both ways: if triggers bypass
  permissions, a trigger anywhere in the schema becomes a laundering route into `audit_logs`; if
  they do not, an `AFTER INSERT` trigger that writes an audit row will fail for any token lacking
  `audit_logs:data_add`.
- **`DELETE FROM audit_logs` with no `WHERE`** and `TRUNCATE`-equivalents — presumably `data_delete`,
  but **UNVERIFIED**.
- **`VACUUM`, `PRAGMA`, `ATTACH`** — no documented action name maps to them. `VACUUM` is moot on
  Turso Cloud ("the `VACUUM` command … is currently disabled in Turso",
  [Usage & billing](https://docs.turso.tech/help/usage-and-billing.md)), and `journal_mode` /
  `busy_timeout` are unsupported while `user_version` / `application_id` are read-only
  ([Limitations](https://docs.turso.tech/cloud/limitations.md)). But whether a token can be _denied_
  a pragma is **UNVERIFIED**.

### 3c. What the client throws — partially verifiable, and the answer differs by path

This is the part the service layer needs, so it is worth separating what is proven from what is not.

**Path A — a SQLite trigger raising `RAISE(ABORT)` (the §5 fallback). Fully traced, both locally and
remotely.**

`@libsql/client` throws `LibsqlError`, defined in
[`packages/libsql-core/src/api.ts`](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-core/src/api.ts):

```ts
export class LibsqlError extends Error {
  code: string // machine-readable
  extendedCode?: string // e.g. SQLITE_CONSTRAINT_PRIMARYKEY
  rawCode?: number
  // message is rewritten as `${code}: ${message}`; name === "LibsqlError"
}
```

Against a **local file** (the Node entrypoint, i.e. every Vitest run),
[`packages/libsql-client/src/sqlite3.ts`](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/sqlite3.ts)
maps the driver error faithfully:

```ts
function mapSqliteError(e: unknown): unknown {
  if (e instanceof Database.SqliteError) {
    const extendedCode = e.code
    const code = mapToBaseCode(e.rawCode) // rawCode & 0xff
    return new LibsqlError(e.message, code, extendedCode, e.rawCode, e)
  }
  return e
}
```

`RAISE(ABORT, …)` produces SQLite's `SQLITE_CONSTRAINT_TRIGGER` (extended result code **1811**,
listed at [SQLite result codes](https://www.sqlite.org/rescode.html)), so locally the thrown error
carries `code === "SQLITE_CONSTRAINT"`, `extendedCode === "SQLITE_CONSTRAINT_TRIGGER"`,
`rawCode === 1811`, and the `RAISE` message.

Against a **remote libSQL database** the extended code is lost. libsql-server maps rusqlite's
`ConstraintViolation` to the _base_ string only —
`rusqlite::ErrorCode::ConstraintViolation => "SQLITE_CONSTRAINT"` in
[`libsql-server/src/hrana/stmt.rs`](https://github.com/tursodatabase/libsql/blob/main/libsql-server/src/hrana/stmt.rs) —
and the client's Hrana mapping notes exactly why:

```ts
// packages/libsql-client/src/hrana.ts
export function mapHranaError(e: unknown): unknown {
  if (e instanceof hrana.ClientError) {
    const code = mapHranaErrorCode(e)
    // TODO: Parse extendedCode once the SQL over HTTP protocol supports it
    return new LibsqlError(e.message, code, undefined, undefined, e)
  }
  return e
}
```

([`hrana.ts`](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/hrana.ts))

**Design rule that follows: the service layer must match on `code === 'SQLITE_CONSTRAINT'` plus the
message text, never on `extendedCode`.** `extendedCode` is populated locally and `undefined` in
production, which is the worst possible failure mode for a check written and passing on a laptop.

**Path B — a rejected write due to a fine-grained token. UNVERIFIED.** Turso publishes no error code
or message shape for a permission denial. For orientation only, the open-source libsql-server maps
its (namespace-level) authorization failures to HTTP 401 —
`AuthError(_) => self.format_err(StatusCode::UNAUTHORIZED)` and
`NotAuthorized(_) => self.format_err(StatusCode::UNAUTHORIZED)` in
[`libsql-server/src/error.rs`](https://github.com/tursodatabase/libsql/blob/main/libsql-server/src/error.rs) —
which the client would surface as `hrana.HttpServerError` → `code === "SERVER_ERROR"`
([`hrana.ts` `mapHranaErrorCode`](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/hrana.ts)).
That is a generic, unhelpful code, and it is **not** evidence about the fine-grained path. Do not
write a service-layer handler against it without testing.

---

## 4. THE TWO BLOCKING VERIFICATIONS

### 4a. Which engine enforces this, and with which client? — **NOT ESTABLISHED FOR THE ENGINE DRIZZLE CAN REACH**

This is the finding that changes the decision. Stated plainly:

> **Fine-grained permissions cannot be confirmed to work on the engine `@libsql/client` — and
> therefore Drizzle — actually talks to. The evidence points the other way, and there is a specific,
> documented mechanism by which such a token could fail _open_ rather than closed.**

The four pieces of evidence, in order of weight.

**(i) The feature was launched as part of the Turso Database / sync product, on 2025-10-08.** The
announcement post says, verbatim:

> "Offline-first applications with local sync support require more advanced authentication
> capabilities. That's why, **specifically for the sync launch**, we've extended Turso Cloud
> authentication with the following features: Fine-grained token permissions — limit access per
> table and per operation: Supported data operations: `data_read`, `data_add`, `data_update`,
> `data_delete`; Supported schema operations: `schema_add`, `schema_update`, `schema_delete`.
> Attach fine-grained permissions to your token using the Turso CLI:
> `turso db tokens create <db> -p all:data_read -p table:data_update`"
> — [Introducing Databases Anywhere with Turso Sync](https://turso.tech/blog/introducing-databases-anywhere-with-turso-sync),
> 8 October 2025

The `-p` flag landed in the CLI on the same day
([commit `e1dceb34`, 2025-10-08](https://github.com/tursodatabase/turso-cli/commits/main/internal/flags/fine_grained_permissions.go)).
The wording "extended **Turso Cloud** authentication" is genuinely ambiguous about engines — it does
not say "libSQL databases only" and it does not say "Turso databases only".

**(ii) The documentation for it was originally filed under the "Turso Database (beta)" tab, and only
moved to the general Turso Cloud docs four months later.** The page now at
`sdk/authorization/fine-grained-permissions` was created on 2026-02-10 by a commit literally titled
"move authz info to the turso cloud docs"
([`4cd1c845`](https://github.com/tursodatabase/turso-docs/commit/4cd1c845)), which _deleted_
`connect/authorization.mdx`. In the `docs.json` navigation at that commit's parent,
`connect/authorization` sat inside `{"tab": "Turso Database (beta)", … {"group": "Connect", "pages":
["connect/authorization", …]}}`
([`docs.json` at `d1153cd1`](https://github.com/tursodatabase/turso-docs/blob/d1153cd1b4f0cf7a1bbc9a6706b178f7e1ff7e8f/docs.json)).
So the feature's documentation originated in the rewrite's docs and was later generalised. That is
suggestive, not conclusive — a docs reorganisation is not a product statement.

**(iii) The open-source libSQL server has no table-level permission model at all.** This is the
hard evidence. libsql-server's entire authorization vocabulary is three permissions scoped to a
namespace — from
[`libsql-server/src/auth/permission.rs`](https://github.com/tursodatabase/libsql/blob/main/libsql-server/src/auth/permission.rs):

```rust
pub enum Permission {
    #[serde(rename = "ro")] Read,
    #[serde(rename = "rw")] Write,
    #[serde(rename = "roa")] AttachRead,
}
```

and from
[`libsql-server/src/auth/authorized.rs`](https://github.com/tursodatabase/libsql/blob/main/libsql-server/src/auth/authorized.rs):

```rust
pub enum Scope { Namespace(NamespaceName) }

pub struct Authorized {
    #[serde(rename = "ro")]  pub read_only: Option<Scopes>,
    #[serde(rename = "rw")]  pub read_write: Option<Scopes>,
    #[serde(rename = "roa")] pub read_only_attach: Option<Scopes>,
    #[serde(rename = "rwa")] pub read_write_attach: Option<Scopes>,
    #[serde(rename = "ddl")] pub ddl_override: Option<Scopes>,
}
```

and the accepted JWT claim set, from
[`libsql-server/src/auth/user_auth_strategies/jwt.rs`](https://github.com/tursodatabase/libsql/blob/main/libsql-server/src/auth/user_auth_strategies/jwt.rs):

```rust
pub struct Token {
    id: Option<NamespaceName>,   // namespace
    a: Option<Permission>,       // ro | rw | roa
    pub(crate) p: Option<Authorized>,
    exp: Option<DateTime<Utc>>,
}
```

There is no table, no per-action DML/DDL split, and nothing resembling `data_read` anywhere in the
repository — a GitHub code search for `data_read` in `tursodatabase/libsql` returns **zero** hits,
against one hit in `tursodatabase/turso-cli` (the flag file above).

**(iv) And the fail-open path is explicit in that same code.** `serde` ignores unknown JSON fields
by default, so a JWT carrying an unrecognised fine-grained claim would be deserialised into a
`Token` with `a: None, p: None` — and `Authorized::merge_legacy(None, None)` handles that case like
this ([`authorized.rs`](https://github.com/tursodatabase/libsql/blob/main/libsql-server/src/auth/authorized.rs)):

```rust
(None, None) => {
    // if there are no other claims, no claims is interpreted as full access.
    if self.is_empty() {
        Ok(Authenticated::FullAccess)
    } else {
        Ok(Authenticated::Authorized(Arc::new(self)))
    }
}
```

**A token whose only restriction is a claim the server does not understand is treated as full
access.** That is the open-source server, not necessarily Turso Cloud's hosted libSQL fleet — the
new server is closed-source, and Turso stated in January 2025 that it is "an entirely new
implementation, not a relicensing of libSQL's server components", to be kept closed while "everything
that runs on the client will remain strictly open source"
([Upcoming changes to the Turso platform and roadmap](https://turso.tech/blog/upcoming-changes-to-the-turso-platform-and-roadmap)).
So this specific code path on Turso Cloud is **UNVERIFIED**. But it is the exact failure mode that
matches Turso's other documented default — "If you don't setup a JWT template with specific
permissions, the generated tokens will have access to all databases in all groups by default"
([JWKS](https://docs.turso.tech/sdk/authorization/jwks.md)). Turso's authorization model fails open
by design in at least one documented place.

**Which client for which engine — this part is unambiguous.** Turso's own package table
([TypeScript reference](https://docs.turso.tech/sdk/ts/reference.md)):

|                       | `@tursodatabase/database` | `@tursodatabase/sync` | `@tursodatabase/serverless`                                   | `@libsql/client`                                      |
| --------------------- | ------------------------- | --------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| **Use case**          | Local / embedded          | Local + cloud sync    | Remote Turso database (servers, containers, serverless, edge) | Remote libSQL database, ORM support (Drizzle, Prisma) |
| **Engine**            | Turso (rewrite)           | Turso (rewrite)       | **Turso**                                                     | **libSQL (SQLite fork)**                              |
| **Concurrent writes** | Yes (MVCC)                | Yes (MVCC)            | Yes (MVCC)                                                    | Not supported                                         |
| **ORM support**       | Drizzle (beta)            | —                     | **—**                                                         | Drizzle, Prisma, and others                           |

So: the engine most likely to enforce fine-grained permissions correctly (Turso Database, reached by
`@tursodatabase/serverless`) has **no Drizzle support**, and the client Drizzle supports
(`@libsql/client`) targets the engine whose open-source server demonstrably has no table-level
permission model. Turso's Drizzle guide confirms there is no third option: "Drizzle uses
`@libsql/client` for Turso integration. There is also beta support for `@tursodatabase/database` for
local/embedded use cases"
([Drizzle + Turso](https://docs.turso.tech/sdk/ts/orm/drizzle.md)), and Drizzle's own page for the
rewrite covers only the local package — `import { drizzle } from 'drizzle-orm/tursodatabase/database'`,
installed as `drizzle-orm@rc`
([Drizzle: Connect Turso Database](https://orm.drizzle.team/docs/connect-turso-database)).

**Verdict on 4a.** The token is just an opaque `authToken` string, so `@libsql/client` can _carry_ a
fine-grained token trivially. The question is purely whether the server it talks to enforces it, and
that **cannot be established from primary sources**. The available evidence — feature launched with
the rewrite, docs born in the rewrite's tab, zero table-level permission machinery in the libSQL
server, and a documented fail-open default — points toward "no, or not reliably, on libSQL". It must
be settled by experiment (§Recommendation, step 1) before any design depends on it.

### 4b. Plan gating — **NOT GATED, as far as any primary source shows**

The pricing page's full feature matrix, fetched 2026-08-21, contains **no mention** of permissions,
tokens, authorization, fine-grained permissions, or JWKS anywhere. The security/compliance rows it
does list are DPA, IP Allow Lists, AWS VPC Allow Lists (Developer and above), Teams (Scaler, Pro),
and SSO / BYOK Encryption / HIPAA / SOC2 (Pro only)
([turso.tech/pricing](https://turso.tech/pricing)). Token creation is presented throughout the docs
as a core capability of the CLI and Platform API with no plan qualifier
([Platform Tokens](https://docs.turso.tech/sdk/authorization/tokens.md),
[Authorization](https://docs.turso.tech/sdk/authorization.md)).

Plan shape for context, from the same page: Free $0 / 100 databases / 5 GB / 500 M rows read /
10 M rows written; Developer $4.99 / unlimited databases / 9 GB; Scaler $24.92; Pro $416.58. Note
the row-quota failure mode is hard — "any query that exceeds these limits will result in a failure,
indicated by the `BLOCKED` error code"
([Usage & billing](https://docs.turso.tech/help/usage-and-billing.md)).

**So 4b is a clean pass: no evidence of a paywall.** The one caveat, stated as such: absence from a
marketing page is not a positive guarantee, so "fine-grained permissions work on the Free plan" is
**UNVERIFIED** in the strict sense and will be confirmed by the same experiment as 4a. The JWKS
_route_ to fine-grained permissions carries its own, different restriction — Clerk and Auth0 only,
"During the Turso Beta" ([JWKS](https://docs.turso.tech/sdk/authorization/jwks.md)) — but the CLI
route does not depend on it.

### 4b(bis). What this means for the database decision

Blunt summary for the reader who skipped to here:

- **4b is fine.** No paid tier required.
- **4a is not fine.** The single mechanism that made Turso's boundary story _better_ than
  `pgSchema()` in `db-on-workers.md` §5.1 — and the only server-side `audit_logs` append-only
  guarantee in §5.2 — cannot be confirmed to exist on the engine Drizzle can reach. If the
  experiment comes back negative, then on the Turso path, per-domain isolation degrades to
  convention (exactly like D1 table prefixes) and `audit_logs` append-only degrades to a SQLite
  trigger (§5, option ii) — which is a mechanism **Postgres also has**, on top of `REVOKE`.

That does not by itself reopen #16, because `db-on-workers.md` already recommends Postgres and
already treats Turso as the second choice. What it does is **remove one of the two arguments that
were listed as things that would flip the decision to Turso.** So: #16 does not need reopening;
it needs its Turso column _weakened_, and the §5.1/§5.2 claims in `db-on-workers.md` corrected from
"real, server-enforced" to "unverified, probably unavailable on the libSQL engine". If anything,
this research makes the existing Postgres recommendation stronger, not weaker.

---

## 5. The local-development gap

### 5a. There is no authorization layer locally, at all

Not "weaker" — absent. Two local modes, neither of which authenticates:

- **Local file** — "You don't need to provide an `authToken` in development"
  ([Local Development](https://docs.turso.tech/local-development.md)). A `file:` URL through
  `@libsql/client`'s Node entrypoint opens SQLite directly in-process; there is no server, so there
  is nothing to check a token against.
- **`turso dev`** — "This will start a local libSQL server and create a database for you", and the
  documented client connects with `createClient({ url: "http://127.0.0.1:8080" })` — **no
  `authToken` argument at all** ([same page](https://docs.turso.tech/local-development.md)). The
  [`turso dev` CLI reference](https://docs.turso.tech/cli/dev) documents exactly one flag,
  `--db-file`, and no auth, token or permissions flag.

And even if `turso dev` were made to require a JWT, §4a(iii) shows the libSQL server it starts has no
table-level permission vocabulary to enforce. Self-hosting a libsql-server with `--auth-jwt-key` and
a fine-grained token would exercise the fail-open path, not the guarantee.

**Therefore: a local unit or integration test can never assert that a fine-grained token blocks a
write.** This is not a tooling gap to be closed; it is structural.

### 5b. The four compensating options, and what each actually buys

**(i) Application-level guard in the repository/service layer.**
What it buys: a _code_ guarantee, not a _data_ guarantee. It stops the repository layer from issuing
`UPDATE`/`DELETE` against `audit_logs`; it does nothing about a hand-written migration, a
`drizzle-kit studio` session, a psql-equivalent shell (`turso db shell`), or a future developer who
adds a second write path. It is the weakest option and the cheapest.
Testable locally: **yes, fully** — but the test asserts "our repository refuses", which is a test of
the guard, not of append-only. Concretely: expose `audit_logs` only through an
`AuditLogRepository.append()` with no update/delete method, and add an ESLint or a
`vitest` source-scan test asserting no `.update(auditLogs)` / `.delete(auditLogs)` call exists
anywhere in `server/`.

**(ii) A SQLite `BEFORE UPDATE` / `BEFORE DELETE` trigger with `RAISE(ABORT)`. This is the
recommended option.**
Turso documents triggers and `RAISE` in full, including the exact semantics needed
([CREATE TRIGGER](https://docs.turso.tech/sql-reference/statements/create-trigger.md)):

> "A `BEFORE` trigger fires before the triggering statement modifies the row… If a BEFORE trigger
> raises an error, the triggering operation is aborted for that row."

> `RAISE(ABORT, message)` — "Aborts the current statement and rolls back any changes made by that
> statement, but preserves prior changes in the transaction. This is the default error handling
> behavior."
> `RAISE(ROLLBACK, message)` — "Aborts the current statement and rolls back the entire transaction."

with a worked validation example:

```sql
CREATE TRIGGER validate_reservation
    BEFORE INSERT ON reservations
BEGIN
    SELECT RAISE(ABORT, 'check_out must be after check_in')
    WHERE NEW.check_out <= NEW.check_in;
END;
```

Two caveats to record. First, that page is the **Turso Database (rewrite)** SQL reference — it sits
under the "Turso Database (beta)" tab in
[`docs.json`](https://github.com/tursodatabase/turso-docs/blob/main/docs.json). For the libSQL
engine, trigger support follows from libSQL being a SQLite fork and from SQLite's own
[CREATE TRIGGER](https://www.sqlite.org/lang_createtrigger.html) and
[result-code](https://www.sqlite.org/rescode.html) documentation; Turso Cloud's
[Limitations](https://docs.turso.tech/cloud/limitations.md) page lists only pragma differences and
says nothing restricting triggers. Trigger support on Turso Cloud's libSQL engine is therefore
**strongly implied but not explicitly documented — UNVERIFIED in the strict sense**, and worth
including in the same one-hour experiment.
Second, `INSTEAD OF` triggers are explicitly unsupported on the rewrite: "`INSTEAD OF` triggers are
not yet supported in Turso. `CREATE TRIGGER … INSTEAD OF …` returns an error"
([same page](https://docs.turso.tech/sql-reference/statements/create-trigger.md)). Not needed here.

Drizzle cannot declare triggers in schema — its column/constraint documentation covers tables,
columns, indexes, constraints, views and schemas, with no trigger construct — but it supports
hand-written migrations: "You can generate empty migration files to write your own custom SQL
migrations for DDL alternations currently not supported by Drizzle Kit", via
`drizzle-kit generate --custom --name=seed-users`
([drizzle-kit generate](https://orm.drizzle.team/docs/drizzle-kit-generate)). So the trigger goes in
`drizzle-kit generate --custom --name=audit-logs-append-only`, and — critically — the _same_
migration file is applied to the local file and to Turso, so there is no divergence between what
dev tests and what production enforces.

Testable locally: **yes, and this is the only option that tests the real guarantee.** From §3c, the
assertion is `LibsqlError` with `code === 'SQLITE_CONSTRAINT'` and the `RAISE` message; assert on
those two and **not** on `extendedCode`, which is `SQLITE_CONSTRAINT_TRIGGER` locally and
`undefined` over HTTP.

Honest limits of the trigger: it is inside the database, so it cannot be bypassed by any client —
but it _can_ be dropped by any client holding DDL rights, which on the libSQL engine is every
client. It also does not cover `DROP TABLE audit_logs`. So option (ii) enforces append-only against
accidents and against ordinary application bugs; it does not enforce it against a compromised
credential. That is a weaker claim than a `REVOKE`, and the security documentation should say so
rather than implying otherwise.

**(iii) A staging-only integration test against a real Turso database.**
This is the only way to test a token-based guarantee at all, and Turso makes the per-run database
cheap: `turso db create my-branch --from-db my-existing-database`, with a documented GitHub Actions
workflow, noting branches "count towards your plan's database quota", need their own token, and must
be deleted manually ([Branching](https://docs.turso.tech/features/branching.md)). Free plan allows
100 databases ([turso.tech/pricing](https://turso.tech/pricing)), so per-PR branches fit.
What it buys: a real assertion that the deployed configuration behaves as designed — provided §4a
comes back positive. If §4a comes back negative there is nothing for this test to assert.
Testable locally: **no, by construction.** It needs network, credentials, and a paid-or-quota'd
resource, so it belongs in a separately-tagged CI job that does not run on a developer's machine.
Cost: CI needs a Turso API token and a create/destroy lifecycle, i.e. a second credential class
beyond the nine runtime tokens.

**(iv) Accept and document the gap.**
What it buys: honesty and zero work. Given that `docs/data/data-dictionary.md` _requires_
`audit_logs` to be append-only and `CLAUDE.md` rule 6 makes audit classification mandatory for every
endpoint, "accepted gap" is only defensible in combination with (i) and (ii), never alone.
Testable locally: not applicable.

**Recommended combination: (ii) as the enforcement mechanism, (i) as the code-level guard, (iii)
only if §4a turns out positive, and (iv) written down explicitly for the residual risk (a client
with DDL rights can drop the trigger).**

---

## 6. Per-domain isolation as an alternative or complement

### 6a. Multiple databases per group are cheap in money and expensive in semantics

Free plan gives 100 databases, Developer and above unlimited
([turso.tech/pricing](https://turso.tech/pricing)), so nine domain databases plus per-PR branches fit
comfortably even on Free. Branching from an existing database is first-class
([Branching](https://docs.turso.tech/features/branching.md)). Connection count is a non-issue:
`@libsql/client/web` is a `fetch` wrapper with no connection to keep alive, and its documented
default is 20 in-flight requests per client instance
([TypeScript reference](https://docs.turso.tech/sdk/ts/reference.md)) — nine such clients per request
path cost nine objects, not nine sockets.

Also worth noting: because a group token "reaches all databases in a group"
([Authorization](https://docs.turso.tech/sdk/authorization.md)), a nine-database design must use
nine _database_ tokens, not a group token — otherwise the isolation is given away at the credential
layer. But unlike the nine-tokens-one-database design (§2b), nine separate databases each have their
own signing keys, so **rotation becomes independent per domain**. That is a real advantage of the
split-database shape.

### 6b. Cross-database transactions are impossible. Say it plainly

- On **Turso Cloud**, the cross-database mechanism is deprecated: "This feature is now deprecated for
  all new users. Existing paid users can continue to use `ATTACH`"
  ([Attach Database (Deprecated)](https://docs.turso.tech/features/attach-database.md)). A new
  account cannot use it. The same applies to the shared-schema feature
  ([Multi-DB Schemas (Deprecated)](https://docs.turso.tech/features/multi-db-schemas.md)).
- On the **Turso Database (rewrite)**, `ATTACH` exists but is a _local file_ feature and
  experimental: "ATTACH opens the database file at `filename`… This feature is experimental and must
  be enabled before use… The attached database's journal mode must match the main database's journal
  mode"
  ([ATTACH DATABASE](https://docs.turso.tech/sql-reference/statements/attach-database.md)). It is not
  a cross-hosted-database mechanism, and Workers have no filesystem in any case.

**So with one database per domain there are no cross-domain foreign keys and no cross-domain
atomicity.** For this project that is disqualifying on its own, for the reason
`db-on-workers.md` §3.4 already established: `submit → score → profile snapshot → audit` writes
`scores` (assessment), `leadership_profiles` + `profile_snapshots` (profile), and `audit_logs`
(platform) — three domains — and NFR-11 requires those to be traceable as one consistent unit. A
split-database design turns that single transaction into a distributed one, with compensating
actions, in the subsystem the project says must never be wrong.

Ranking of per-domain mechanisms on Turso, updated for §4a:

| Mechanism                                                 | Enforced by                                | Strength                                                                   | Cross-domain FK/transaction |
| --------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- | --------------------------- |
| Table-name prefixes                                       | nothing                                    | convention                                                                 | preserved                   |
| Typed per-domain Drizzle handles + ESLint import boundary | TypeScript + ESLint                        | catches accidents                                                          | preserved                   |
| Nine fine-grained tokens, one database                    | Turso Cloud server, **if §4a is positive** | real if it works; nothing if it does not; rotation coupled across all nine | preserved                   |
| Nine databases                                            | the platform, absolutely                   | real and absolute; independent rotation                                    | **destroyed**               |

---

## Recommendation

_Rewritten after the decisions in the banner above. The original recommendation was to build nine
per-domain tokens once §4a came back positive; §4a was never settled, and the map chose not to wait._

**Build nothing on fine-grained tokens. Use one token. Keep the factory shape so that nine tokens
remain a one-line change if the engine ever earns the trust.**

### Step 1 — a one-hour experiment, no longer a gate

_Amended: this was Step 1 because the design waited on it. It does not any more. The experiment is
still worth running — see the two reasons at the end of this section — but no ticket is blocked on
it, and `scripts/turso-permissions-probe.mjs` now automates it._

Against a Free-plan Turso Cloud **libSQL** database (`libsql://…`, created without `--tursodb`),
reached with `@libsql/client`:

1. `turso db tokens create <db> -p audit_logs:data_read,data_add` (per
   [Platform Tokens](https://docs.turso.tech/sdk/authorization/tokens.md)).
2. Attempt `INSERT` (expect success), then `UPDATE`, `DELETE`, `DROP TABLE`, `ALTER TABLE`,
   `INSERT … ON CONFLICT DO UPDATE`, `REPLACE INTO`, a write via an `AFTER INSERT` trigger, and a
   `SELECT` on an unrelated table.
3. Record, for each rejection, the `LibsqlError` `name`, `code`, `extendedCode`, `rawCode` and
   message.
4. Separately confirm `CREATE TRIGGER … BEFORE UPDATE … RAISE(ABORT, …)` is accepted and enforced on
   the same libSQL database.

If **any** write that should be denied succeeds, fine-grained tokens are not a security control on
this engine, and every claim in `db-on-workers.md` §5.1 and §5.2 that depends on them must be struck.
Record the result in this file.

Two reasons it is still worth running, even though nothing waits on it:

- It captures the `LibsqlError` shape for a **token denial**, which §3c could only trace for the
  trigger path. A service layer has to tell a permission denial apart from a constraint violation.
- Step 4 of it confirms the `RAISE(ABORT)` trigger is **enforced** on Turso Cloud, not merely
  accepted by `CREATE TRIGGER`. That is now the sole guarantee behind `audit_logs`, so it carries far
  more weight than the permission question it was written alongside.

### Step 2 — `server/db/client.ts`

One token. The factory still takes a `domain`, so the per-domain shape is in place from the first
commit and nine tokens stay a one-line change — but today every domain resolves to the same
credential, and no code may assume otherwise.

```ts
// server/db/client.ts
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

export type Domain =
  | 'identity'
  | 'assessment'
  | 'profile'
  | 'learning'
  | 'simulation'
  | 'development'
  | 'feedback360'
  | 'research'
  | 'platform'

/**
 * The `domain` argument does not select a credential today — every domain shares one token,
 * because the database does not enforce per-token table limits (§4a) and the map decided not to
 * count them as protection. It is here so that per-domain isolation, when it becomes real, is a
 * change to `tokenFor` alone and not to every call site.
 *
 * Per-domain isolation is currently enforced by TypeScript and an ESLint import boundary. Both act
 * before the code runs. Nothing acts while it runs. Do not describe this as a database guarantee.
 */
export function createDb(env: Env, domain: Domain) {
  const client = isLocal()
    ? nodeCreateClient({ url: env.TURSO_LOCAL_URL }) // '@libsql/client', opens file:
    : webCreateClient({
        // '@libsql/client/web', refuses file:
        url: env.TURSO_DATABASE_URL,
        authToken: tokenFor(env, domain),
      })
  return drizzle(client, { schema })
}

/** The single seam that nine tokens would go through. */
function tokenFor(env: Env, _domain: Domain) {
  return env.TURSO_AUTH_TOKEN
}
```

Notes on that shape, each grounded above:

- **One database, one token.** Never nine databases (§6b: cross-domain transactions are impossible,
  and `submit → score → snapshot → audit` needs one). Nine _tokens_ were the earlier proposal and
  were dropped: with the security benefit uncounted (§4a), they cost nine Worker secrets, an atomic
  nine-secret rotation, and a rotation event on every table-adding migration, for a benefit nothing
  is allowed to rely on.
- The Node/Web import split is mandatory, not stylistic: `@libsql/client/web` refuses `file:` URLs
  (`db-on-workers.md` §2).
- **Two Worker secrets**, one URL and one token, against a 64/128 limit
  ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)). The ten-secret
  count in §2c belongs to the nine-token design and no longer applies.
- The question of whether every domain token also carries `audit_logs:data_add` disappears with the
  single token — it carries everything. It returns only if nine tokens do.
- **Rotation is all-or-nothing regardless** (§2b: tokens "cannot be revoked individually";
  `invalidate` rotates the signing keys). With one token that property costs nothing, which is part
  of why one token is the better trade. Document the rotation step before the first token is minted,
  not after the first outage.
- Minting is a one-off `turso db tokens create <db>` with no `-p` rules, so the checked-in minting
  script and its post-mint verification step (§1a: the CLI validates no action names) are not needed
  yet. They return with nine tokens.

### Step 3 — the repository layer

- One repository per domain, taking its domain's handle; no repository sees another domain's handle.
  This satisfies `docs/architecture/patterns.md` rules 2 and 4 as _intent_, and — regardless of
  §4a — is enforced by TypeScript plus an ESLint import boundary, which is the same strength
  `pgSchema()` alone offers on Postgres.
- `audit_logs` is reachable only through an `append()`-only repository interface with no update or
  delete method, plus a source-scan test asserting no `.update(auditLogs)` or `.delete(auditLogs)`
  anywhere in `server/`. **This is required, not advisory.** The trigger is now the only guarantee
  at the storage layer and a credential with DDL rights can `DROP` it; Postgres would have had
  `REVOKE UPDATE, DELETE` underneath, and Turso has no equivalent. `docs/security/rbac.md` requires
  append-only unconditionally, so shipping without this control leaves that requirement resting on
  a single DDL statement.

### Step 4 — the append-only guarantee

**Make the SQLite trigger the primary mechanism, not the fallback.** Reasons: it works identically
on a local file, on `turso dev`, and on Turso Cloud; it is created by the same
`drizzle-kit generate --custom --name=audit-logs-append-only` migration in both environments; and a
local Vitest integration test can genuinely assert it. A fine-grained token, if §4a is positive,
becomes defence in depth on top — never the only line.

```sql
-- server/db/migrations/xxxx_audit_logs_append_only.sql  (drizzle-kit generate --custom)
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;
```

Assert in the test on `code === 'SQLITE_CONSTRAINT'` and the message, **not** on `extendedCode`
(§3c). And document the residual risk plainly: a client with DDL rights can `DROP TRIGGER`, so this
protects against bugs and accidents, not against a compromised credential.

### Step 5 — does #16 need reopening?

**No — but its Turso column must be corrected downward, and the correction should be made before
#16 is closed.** `db-on-workers.md` already recommends Postgres over Hyperdrive and already treats
Turso as second choice, so the conclusion is unchanged. What changes is the reasoning:

- **Correct `db-on-workers.md` §5.1**: "Turso fine-grained per-domain tokens — enforced by the Turso
  Cloud server — real, and keeps cross-domain FKs" must become _unverified on the libSQL engine that
  Drizzle reaches, with evidence pointing negative_ (§4a).
- **Correct §5.2**: the claim that a scoped token gives "a genuine server-side append-only
  guarantee" on Turso must be downgraded to the trigger route only — which, note, is a mechanism
  **Postgres also has, in addition to `REVOKE UPDATE, DELETE`**. Turso's advantage on this axis
  disappears entirely.
- **Correct §5.1's "no enforcement at all in local-file development"** to the stronger and more
  useful form: there is no authorization layer locally in _either_ local mode, and `turso dev` takes
  no auth flag at all (§5a).
- **Update the "what would flip this decision to Turso" list**: the fine-grained-token argument
  should be removed from it, and the remaining condition most worth watching is unchanged — stable
  Drizzle support for `@tursodatabase/serverless`, which today has ORM support "—"
  ([TypeScript reference](https://docs.turso.tech/sdk/ts/reference.md)).

Net effect: this research _strengthens_ the existing recommendation of PostgreSQL on Supabase over
Hyperdrive, because the one place Turso was scored as strictly better than Postgres turns out to be
unverifiable on the engine the project would actually use. Nothing here is a new argument _for_
Turso.

### Open items, stated as unverified

- **UNVERIFIED (blocking):** whether Turso Cloud's libSQL engine enforces fine-grained permissions
  at all (§4a). Settle by Step 1.
- **UNVERIFIED (blocking if the above is positive):** the error class, code and message shape
  returned for a fine-grained permission denial (§3c, Path B).
- **UNVERIFIED:** whether `INSERT … ON CONFLICT DO UPDATE`, `REPLACE INTO`, and trigger-initiated
  writes are checked against `data_update` / `data_delete` (§3b). Each is a potential hole straight
  through append-only.
- **UNVERIFIED:** whether the server rejects or silently ignores an unknown action name, given the
  CLI validates none and its own help text says `data_insert` where the docs say `data_add` (§1a).
- **UNVERIFIED (strictly, though strongly implied):** trigger and `RAISE(ABORT)` support on Turso
  Cloud's **libSQL** engine — the documented `CREATE TRIGGER` page belongs to the rewrite's SQL
  reference (§5b, option ii).
- **UNVERIFIED (strictly):** that fine-grained permissions are usable on the Free plan. The pricing
  page does not gate them, and does not mention them either (§4b).
- **UNVERIFIED:** whether Turso Cloud's hosted libSQL server shares the open-source
  `merge_legacy(None, None) → FullAccess` behaviour (§4a(iv)). This is the fail-open risk, and it is
  the reason Step 1 must test for _permitted_ writes, not merely for _denied_ ones.

This document is research, not an approved decision. Per `CLAUDE.md` rule 1 and PRD §2, a stack or
scoring-relevant change needs an ADR approved by the Tech Lead.
