```
ADR-008: domain modules are named for what they do, not for their layer
Status: Accepted
Date: 2026-08-25
Type: architecture
Context: `docs/architecture/patterns.md` tabulates a Service layer at
  `server/domain/<domain>/*.service.ts` and a Repository layer at
  `server/domain/<domain>/*.repo.ts`. No domain in the repository has ever used
  those names: `identity/` ships `policy.ts`, `roles.ts` and `session.ts`,
  `platform/` ships `audit.ts` and `audit-read.ts`, and `assessment/` ships
  `repository.ts`, `read.ts`, `diff.ts`, `state-machine.ts` and
  `audit-events.ts`. A code review read the table as a rule and reported the
  assessment domain as violating it; the deviation is in fact repo-wide and
  predates that domain. The same document already says the filesystem, not the
  document, is the source of truth for folder structure — so the two halves of
  `patterns.md` disagree with each other.
Decision: Modules inside a domain are named for the responsibility they hold,
  not for the layer they occupy. The layering rule itself is unchanged and still
  binding: writes go through one module per domain, reads may have their own,
  and the HTTP layer holds no business logic. What is dropped is only the
  `*.service.ts` / `*.repo.ts` suffix convention.
Consequences: `patterns.md`'s layer table is descriptive of responsibilities
  rather than prescriptive of filenames, and is annotated to say so. A reviewer
  can no longer use the suffix to identify the write path, so each domain's
  `index.ts` is the contract that matters — CLAUDE.md §12 already routes all
  cross-domain access through it. A domain that grows a genuinely separate
  orchestration layer should add it as a named module rather than renaming
  everything to match a suffix.
Rollback: Renaming files across three domains, with no behaviour change. Cheap
  but pointless unless the suffix convention is reinstated deliberately.
```

Recorded while resolving review findings on
[#56](https://github.com/afif-hh/fia-leadership/pull/56).
