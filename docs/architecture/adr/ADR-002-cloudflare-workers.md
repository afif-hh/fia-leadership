```
ADR-002: Deploy to Cloudflare Workers instead of containers
Status: Accepted
Date: 2026-08-22
Type: architecture
Context: PRD §2 specifies "Container (Docker), stateless app tier, horizontal
  scaling". Workers was chosen by the Tech Lead before the database question was
  opened, and every later decision sits inside that constraint.
Decision: Nitro `cloudflare_module` preset, deployed with wrangler. `nodejs_compat`
  is mandatory — better-auth imports `node:async_hooks` on every request.
  Workers Paid is a prerequisite, not an optimisation: scrypt at N=16384/r=16
  cannot fit the Free plan's 10 ms CPU limit (#36).
Consequences: No Docker, no long-lived process, no local Postgres alongside the
  app. Rules out Redis and BullMQ as currently specified, so PRD §2's Cache/Queue
  row has no implementation — nothing in this foundation needed one. A 128 MB
  isolate bounds concurrent password hashing, handled by an in-isolate gate
  (`server/utils/hash-gate.ts`). Observability differs materially from Node; the
  PRD's OpenTelemetry + pino row is unimplemented and unrevisited.
Rollback: Nitro presets are swappable and no Workers-only API is used outside
  `server/db/client.ts` and `server/utils/auth.ts`. The binding cost is Turso
  (ADR-003), chosen because of this decision.
```

Decided in [#16](https://github.com/afif-hh/fia-leadership/issues/16), reaffirmed in [#33](https://github.com/afif-hh/fia-leadership/issues/33).
