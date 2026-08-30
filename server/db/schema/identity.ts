import { check, index, sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * The `identity` domain.
 *
 * SQLite has no `pgSchema()`, so the domain boundary is the `identity_` prefix plus the ESLint
 * import rule — enforced before runtime only, never at the storage layer (#27, #34).
 *
 * Split by ownership, because it decides who may change a column: better-auth-owned tables follow
 * its schema generator (diff them on every upgrade); repo-owned tables it never touches.
 */

// ---------------------------------------------------------------------------
// Role codes — the closed vocabulary from docs/security/rbac.md.
// Changing this list is a governance decision, which is why it also carries a CHECK
// constraint: the Drizzle `enum` below is a TypeScript constraint that vanishes at runtime,
// and `role` is what the policy layer trusts.
// ---------------------------------------------------------------------------
export const ROLE_CODES = [
  'student',
  'lecturer_coach',
  'lab_admin',
  'academic_lead',
  'researcher',
  'faculty_executive',
  'external_partner',
] as const
export type RoleCode = (typeof ROLE_CODES)[number]

export const USER_STATUSES = ['active', 'disabled'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

/** How a consent acceptance reached the database. Closed set, so it takes a CHECK. */
export const CONSENT_METHODS = ['web_form', 'seed', 'import'] as const
export type ConsentMethod = (typeof CONSENT_METHODS)[number]

const sqlList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '))

// ---------------------------------------------------------------------------
// better-auth-owned
// ---------------------------------------------------------------------------

export const identityUser = sqliteTable(
  'identity_user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    image: text('image'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),

    /**
     * Sorted, comma-separated projection of `identity_user_roles`, written only by `setRoles()` in
     * the same transaction. Rides the session cookie cache, so authorization costs zero reads. The
     * table remains the authority.
     */
    roles: text('roles').notNull().default(''),

    status: text('status', { enum: USER_STATUSES }).notNull().default('active'),
  },
  (t) => [check('identity_user_status_check', sql`${t.status} IN (${sqlList(USER_STATUSES)})`)]
)

/**
 * better-auth's session table.
 *
 * `ip_address` and `user_agent` exist only because the Drizzle adapter refuses to start without
 * them; #38 decided not to retain either, so a `databaseHooks.session.create.before` hook blanks
 * both and sign-in.test.ts asserts they stay empty. Do not start writing to them without
 * revisiting #38.
 *
 * With both blank a session row is a token and a foreign key, so clearing expired rows is cleanup
 * rather than erasure.
 */
export const identitySession = sqliteTable(
  'identity_session',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => identityUser.id, { onDelete: 'cascade' }),

    /** Required by the adapter, deliberately never populated. See the note above. */
    ipAddress: text('ip_address'),
    /** Required by the adapter, deliberately never populated. See the note above. */
    userAgent: text('user_agent'),
  },
  (t) => [index('identity_session_user_id_idx').on(t.userId)]
)

export const identityAccount = sqliteTable(
  'identity_account',
  {
    id: text('id').primaryKey(),
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => identityUser.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('identity_account_user_id_idx').on(t.userId),
    uniqueIndex('identity_account_issuer_account_id_key').on(t.issuer, t.accountId),
  ]
)

export const identityVerification = sqliteTable(
  'identity_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('identity_verification_identifier_idx').on(t.identifier)]
)

// ---------------------------------------------------------------------------
// repo-owned
// ---------------------------------------------------------------------------

/**
 * The authority for role grants. `identity_user.roles` is a projection of this table.
 *
 * Deliberately minimal (issue #37): no `scope_type`/`scope_id`, because Lab Admin — this
 * foundation's only audience — has no `R*` cell in rbac.md's matrix, and the assignment and
 * cohort tables those columns would restrict against belong to domains this map does not build.
 * No `revoked_at` either: revocation is a delete, and grant history lives in
 * `platform.audit_logs`, which is append-only.
 *
 * Two mutually exclusive combinations are forbidden and enforced by a trigger, not by this
 * CHECK — SQLite cannot express a cross-row constraint. The CHECK below rejects a value that is
 * not a role; the trigger rejects a combination that is not allowed. Different jobs.
 */
export const identityUserRoles = sqliteTable(
  'identity_user_roles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => identityUser.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ROLE_CODES }).notNull(),
    grantedAt: integer('granted_at', { mode: 'timestamp_ms' }).notNull(),
    grantedBy: text('granted_by').references(() => identityUser.id),
  },
  (t) => [
    uniqueIndex('identity_user_roles_user_id_role_key').on(t.userId, t.role),
    check('identity_user_roles_role_check', sql`${t.role} IN (${sqlList(ROLE_CODES)})`),
  ]
)

/**
 * Consent acceptance, per policy document version (rbac.md, FR-003).
 *
 * The FK is `restrict`, not cascade: consent records outlive account deactivation (FR-023),
 * and a consent row is a legal record that is not erasable on request — erasing it would leave
 * the platform holding assessment data with no surviving proof it was permitted to collect it.
 *
 * `policy_hash` is the load-bearing column (issue #38). A version string identifies a document
 * only if versions are truly immutable; the realistic failure is a policy amended in place
 * without a version bump, after which the record attests to something unreconstructable.
 * This presumes the rendered policy text is a stable versioned artifact — see the map's fog.
 *
 * No IP address and no user-agent: authentication already establishes who consented, and the
 * restrict FK would make those values outlive the account permanently.
 */
export const identityConsents = sqliteTable(
  'identity_consents',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => identityUser.id, { onDelete: 'restrict' }),
    policyId: text('policy_id').notNull(),
    policyVersion: text('policy_version').notNull(),
    policyHash: text('policy_hash').notNull(),
    acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }).notNull(),
    method: text('method', { enum: CONSENT_METHODS }).notNull(),
    /**
     * Withdrawal, added in #59. The row is never deleted — the `restrict` FK above exists
     * precisely because a consent record is a legal record, and erasing it would leave the
     * platform holding assessment data with no surviving proof it was permitted to collect it.
     * A withdrawn row still attests truthfully that consent was given, and additionally that it
     * was later revoked.
     *
     * Only ever set on the optional `research-participation` document. Withdrawing the mandatory
     * privacy notice means ceasing to use the platform at all — that is account deactivation
     * (FR-023), not a column.
     *
     * Nothing writes this yet: the surface a student withdraws through lives in identity/profile
     * and is out of the taking flow's scope. The column exists so the opt-in that ships is not an
     * opt-in that can never be undone, and so the `research` domain has a filter to read.
     */
    withdrawnAt: integer('withdrawn_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('identity_consents_user_policy_version_key').on(
      t.userId,
      t.policyId,
      t.policyVersion
    ),
    check('identity_consents_method_check', sql`${t.method} IN (${sqlList(CONSENT_METHODS)})`),
  ]
)
