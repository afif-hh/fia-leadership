# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## This repo has its own Tier-0 context rules — read those first

Per the root `CLAUDE.md`:

1. Read `CLAUDE.md`, then `docs/product/PRD.md` — especially its **Reference Map**.
2. Load **only** the files the Reference Map points to for the task at hand.
3. Do not load all of `docs/` "just in case" — irrelevant context degrades output.
4. If the Reference Map doesn't cover the task, ask — don't guess and read everything.

This supersedes the generic single-context convention below wherever the two would conflict.

## No `CONTEXT.md` / `CONTEXT-MAP.md` yet

Neither exists at the repo root. If either is created later (e.g. by `/domain-modeling`), read it
before exploring, same as the generic convention. Their absence is not a gap to flag or fix
proactively — proceed silently.

## ADRs live at `docs/architecture/adr/`, not `docs/adr/`

This repo already has:

```
docs/
├── architecture/
│   └── adr/
│       ├── ADR-000-template.md
│       └── ADR-001-deterministic-scoring.md
├── product/PRD.md   ← Reference Map lives here
└── ...
```

Read ADRs under `docs/architecture/adr/` that touch the area you're about to work in. Note in
particular the root `CLAUDE.md` rule: scoring formulas/thresholds cannot change without an
approved ADR (see `ADR-001-deterministic-scoring.md` and the
`skills/assessment-scoring-change/SKILL.md` procedure).

## Use the glossary's vocabulary

If a `CONTEXT.md` glossary exists, use its terms as defined — don't drift to synonyms it
explicitly avoids. If a concept isn't in the glossary yet, that's a signal: either you're
inventing language the project doesn't use, or there's a real gap worth noting for
`/domain-modeling`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-001 (deterministic scoring) — but worth reopening because…_
