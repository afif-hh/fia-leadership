/**
 * The `identity` domain's public entrypoint. See the note in ../platform/index.ts.
 */
export {
  RoleExclusionError,
  assertRolesAllowed,
  createRolesRepository,
  parseProjection,
  projectRoles,
  type SetRolesInput,
} from './roles'
export {
  IDENTITY_AUDIT_EVENT_TYPES,
  identityAuditEvent,
  type IdentityAuditDetail,
} from './audit-events'
