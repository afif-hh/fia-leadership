# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Deployed environment and test accounts

The staging deployment lives at <https://fia-leadership.afif-438.workers.dev>, backed by a Turso
database (`libsql://fia-leadership-afif-hh.aws-ap-northeast-1.turso.io`). Sign-up is disabled
(`disableSignUp: true` in `server/utils/auth.ts`), so every account is seeded.

One account exists per role, each holding a single role — `lab_admin` and `academic_lead` are
mutually exclusive, and `external_partner` may not be combined with any internal role, so no
account can cover more than one of those.

| Email                       | Role                | Password           |
| --------------------------- | ------------------- | ------------------ |
| `afif@hungryhub.com`        | `lab_admin`         | `jtNT3VDVUyeAEYHd` |
| `student@example.test`      | `student`           | `pS7SFnVmd7jwMC3S` |
| `coach@example.test`        | `lecturer_coach`    | `1JbM4OkQPQZ5l0bU` |
| `academiclead@example.test` | `academic_lead`     | `YygUYX9GrBgkfFyu` |
| `researcher@example.test`   | `researcher`        | `2DibSgsB9P5IhXgw` |
| `executive@example.test`    | `faculty_executive` | `eNTpEI6DyN4rrtcN` |
| `partner@example.test`      | `external_partner`  | `JIYowJC3dAGHqya7` |

These are convenience credentials for testing a deployment that holds synthetic data only. This
repository is public, so treat every one of them as known to anyone: never put real participant
data behind them, and rotate them before the environment holds anything that matters.

### Seeding an account

`server/db/seed/create-user.ts` seeds one account with an explicit set of roles. There is no
default password anywhere in the repository, by design. Against the local file database:

```bash
pnpm db:migrate
SEED_EMAIL=someone@example.test SEED_PASSWORD='at-least-12-chars' SEED_ROLES=student \
  node server/db/seed/create-user.ts
```

Against the deployed database, pass the Turso URL and token in the same environment:

```bash
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... \
SEED_EMAIL=someone@example.test SEED_PASSWORD='at-least-12-chars' SEED_ROLES=student \
  node server/db/seed/create-user.ts
```

Valid roles are listed in `ROLE_CODES` (`server/db/schema/identity.ts`). `SEED_STATUS=disabled`
seeds a disabled account, which is what the authorization tests use.

### Seeding the KDPGK instrument

`server/db/seed/kdpgk/seed.ts` seeds the synthetic KDPGK v1 instrument: 40 items across 10 styles,
8 domains and 2 Blake-Mouton axes, in Indonesian with an English translation, published, with an
approved scoring version. It drives the real domain API, so it publishes and approves through the
same paths a Lab Admin and an Academic Lead would.

```bash
pnpm db:migrate && node server/db/seed/kdpgk/seed.ts
```

It is idempotent by refusing to start twice: an existing `kdpgk` instrument means it exits without
touching anything, because a published version is immutable and there is no partial run it could
clean up after.

The items are synthetic and unvalidated. `docs/assessment/validity-log.md` holds KDPGK v1 at
`draft`, and no score it produces may be used for a formal or research decision.

### Running the dev server against the local database

`NUXT_TURSO_DATABASE_URL` has to be set explicitly. Nuxt's `runtimeConfig` defaults it to an empty
string rather than leaving it undefined, and `createDb()` falls back to the local file only on
`undefined` — so without it every request fails with `URL_INVALID: The URL '' is not in a valid
format`.

```bash
NUXT_BETTER_AUTH_SECRET=dev-secret-at-least-32-characters-long \
NUXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000 \
NUXT_TURSO_DATABASE_URL=file:./.data/dev.db \
pnpm dev
```

### Worker secrets

Four secrets must be set with `wrangler secret put`, and the `NUXT_` prefix is required — see the
comment in `wrangler.jsonc` for why an unprefixed name produces a silent 500:

```
NUXT_BETTER_AUTH_SECRET       32+ random characters
NUXT_PUBLIC_BETTER_AUTH_URL   https://fia-leadership.afif-438.workers.dev
NUXT_TURSO_DATABASE_URL       libsql://...
NUXT_TURSO_AUTH_TOKEN         turso db tokens create <db>
```

Note that password sign-in requires the Workers **Paid** plan: scrypt cannot complete inside the
Free plan's 10ms CPU limit (see `wrangler.jsonc` and issue #36).

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
