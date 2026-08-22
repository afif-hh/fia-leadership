```
ADR-003: Turso / libSQL instead of PostgreSQL 15+
Status: Accepted
Date: 2026-08-22
Type: architecture
Context: PRD §2 specifies "PostgreSQL 15+, multi-schema, 1 schema per domain".
  On Workers the real options were Cloudflare D1, Turso/libSQL, or Postgres over
  Hyperdrive. Research recommended Postgres; it was declined twice, knowingly.
Decision: Turso (libSQL) via `drizzle-orm/libsql`. D1 was rejected on the merits —
  no interactive transactions, and no way to enforce append-only `audit_logs` at
  the storage layer. One database, one token, one `createDb(env, domain)` factory
  where `domain` is a seam rather than a credential selector.
Consequences: Bought — interactive transactions, a no-Docker single-driver dev
  loop, per-PR branching. Given up:
  · `pgSchema()` is gone. Per-domain isolation is TypeScript plus a
    `no-restricted-imports` ESLint rule, enforced before runtime only, and must
    never be described as a storage-layer guarantee.
  · No exact `numeric`. Scores are IEEE-754 doubles permanently (#26).
  · No engine-enforced enums and no `jsonb` — see ADR-005.
  · Append-only rests on one `RAISE(ABORT)` trigger with no second line, and
    whether Turso Cloud enforces it is still unverified (#31).
  · PRD §2's Test runner row says "integration (test-container Postgres)". There
    is no container to run: integration tests copy a migrated SQLite template per
    test (#23). `docs/engineering/testing.md` needs the row.
Rollback: Reversal was free before the schema shipped and is not now. Drizzle
  abstracts the query layer, but the triggers, CHECK constraints and `text`-mode
  JSON are SQLite-shaped and would each need rewriting.
```

Decided in [#16](https://github.com/afif-hh/fia-leadership/issues/16), re-examined and reaffirmed with costs itemised in [#33](https://github.com/afif-hh/fia-leadership/issues/33).
