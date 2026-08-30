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
export {
  ACTIONS,
  CELL_TOKENS,
  MATRIX,
  RESOURCES,
  RESOURCE_LABELS,
  SCOPE_PREDICATES,
  ScopeNotImplementedError,
  authorize,
  interpret,
  resolveScope,
  type Action,
  type CellToken,
  type Decision,
  type Resource,
  type ScopeContext,
  type ScopePredicate,
} from './policy'
export {
  ConsentRequiredError,
  MANDATORY_POLICY_ID,
  hasLiveConsent,
  recordConsent,
  resolveConsentForStart,
  type AcceptancePlan,
} from './consent'
export {
  PolicyArtifactError,
  currentPolicyVersion,
  getPolicyArtifact,
  renderPolicyHtml,
  type PolicyArtifact,
  type PolicyArtifactFault,
  type PolicyId,
} from './policy-documents'
export {
  requireFreshSession,
  requireSession,
  AccountDisabledError,
  UnauthenticatedError,
  type AuthPrincipal,
  type SessionSource,
} from './session'
