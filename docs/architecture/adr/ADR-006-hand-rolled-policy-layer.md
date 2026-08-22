```
ADR-006: A hand-rolled policy matrix, not CASL or oso
Status: Accepted
Date: 2026-08-22
Type: architecture
Context: `docs/security/rbac.md` requires authorization as a "CASL/oso-style
  policy layer di server/domain/identity/policy.ts". That names two libraries in
  a Tier-1 document; the code uses neither, so the departure belongs in writing.
Decision: A hand-rolled typed matrix. oso was ruled out on facts — last published
  2024-01-13, an unmaintained WASM engine, with the live product a hosted service
  that would put a network call in front of every check. CASL was declined
  because its distinguishing feature, `accessibleBy()` compiling rules into a
  query filter, has no Drizzle adapter: all five `R*` rows need a hand-written
  WHERE clause regardless, and CASL would only re-check rows already filtered.
  The matrix stores rbac.md's own cell tokens verbatim, so parity with the
  document is an exact string comparison over all 63 cells.
Consequences: A cell resolves to three values, not two. `scoped` means the matrix
  *cannot* answer and dispatches to a predicate taking the database — so an `R*`
  row cannot be resolved by table lookup. Unimplemented predicates are absent
  rather than `false`, because `false` is a decision and absence is not.
  Enforcement is a factory handlers are built from, so a handler with no
  authorization decision does not compile; it prevents omission, not bypass, and
  a grep test is the only control against a hand-written `defineEventHandler`.
  Note the trap this design does not remove: authorising a request and narrowing
  its query are separate obligations, and the first does not discharge the second.
Rollback: The matrix is one file and the gate another. Adopting a library later
  means rewriting both, and the 63-cell parity test would have to be replaced by
  whatever the library can prove instead.
```

Decided in [#20](https://github.com/afif-hh/fia-leadership/issues/20); ninth resource added in [#22](https://github.com/afif-hh/fia-leadership/issues/22).
