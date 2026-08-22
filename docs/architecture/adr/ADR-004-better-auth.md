```
ADR-004: better-auth for sessions and credentials
Status: Accepted
Date: 2026-08-22
Type: architecture
Context: PRD §2 lists no auth library; FR-002 requires local login now and
  SSO/OIDC later. Rolling our own session and password handling was never
  seriously on the table.
Decision: `better-auth/minimal` with `@better-auth/drizzle-adapter`
  (`provider: "sqlite"`), email and password, `disableSignUp: true`, first Lab
  Admin from a seed script. Four better-auth-owned tables under an `identity_`
  prefix — `schemaName` is Postgres-only. Session contract: `requireSession`
  (60 s cookie cache, zero reads) and `requireFreshSession` (one read), the
  latter mandatory for every audit-classified action.
Consequences: better-auth needs no DDL rights; its CLI refuses `migrate` for
  Drizzle, so migrations stay ours. Roles live in `identity_user_roles`, with
  `identity_user.roles` a derived projection that rides the cookie cache — which
  means worst-case 60 s stale authorization on non-audited paths. `ip_address`
  and `user_agent` columns exist because the adapter refuses to start without
  them and are always blank (#38). `disableIpTracking` must never be set: it
  disables rate limiting outright, not just IP storage.
Rollback: The session contract is two functions in
  `server/domain/identity/session.ts`; the schema is ours. Replacing the library
  means reimplementing those two functions and the credential hashing, not
  migrating data.
```

Decided in [#19](https://github.com/afif-hh/fia-leadership/issues/19); hashing plan accepted in [#36](https://github.com/afif-hh/fia-leadership/issues/36); retention in [#38](https://github.com/afif-hh/fia-leadership/issues/38).
