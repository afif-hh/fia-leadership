```
ADR-005: Where a control lives when SQLite cannot hold it
Status: Accepted
Date: 2026-08-22
Type: architecture
Context: ADR-003 removed the engine's enum type, `jsonb`, and `ADD CONSTRAINT`.
  Every domain after `identity` and `platform` meets the same gap, so the rule
  belongs here rather than being re-decided per domain. Two SQLite facts drive
  it, both verified: `ALTER TABLE … ADD CONSTRAINT` does not exist, so changing a
  CHECK means a full table rebuild; and a `RAISE(ABORT)` trigger blocks DELETE
  but not DROP TABLE, and dies with the table it guards.
Decision: The engine and the application each keep the half they hold well.
  · Small, stable sets get a membership CHECK — `identity_user_roles.role`,
    `identity_user.status`, `consents.method`.
  · Sets expected to grow on a trigger-protected table get a CHECK on their
    *format*, never a value list. `audit_logs.event_type` is
    `<domain>.<action>`, lowercase, 3–64 chars. Adding an audited action then
    needs no migration, so `audit_logs` is never rebuilt.
  · JSON-shaped columns are `text`, validated at the boundary by a
    `z.discriminatedUnion` whose every member is a `z.strictObject`. Strictness
    is required, not stylistic: a plain object *strips* unknown keys, so a PII
    leak would be silently dropped rather than loudly rejected, and on an
    append-only table there is no UPDATE to undo one.
  · Service-layer validation always, regardless of what the engine holds.
Consequences: Validation is `zod/mini` (4.8 KB gzipped against 64.7 KB, measured)
  — no method chaining anywhere, so every validator uses `z.optional(...)`.
  Vocabulary correctness for `event_type` now rests entirely on the application.
  `docs/data/data-dictionary.md` must record, per field, which side holds it.
Rollback: Per-field and cheap while a table is small; a CHECK change on
  `audit_logs` is the expensive case and is exactly what the format rule avoids.
```

Decided in [#28](https://github.com/afif-hh/fia-leadership/issues/28).
