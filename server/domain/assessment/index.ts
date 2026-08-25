/**
 * The `assessment` domain's public entrypoint. See the note in ../platform/index.ts.
 */
export {
  ASSESSMENT_AUDIT_EVENT_TYPES,
  assessmentAuditEvent,
  type AssessmentAuditDetail,
  type AssessmentAuditEventType,
} from './audit-events.ts'
export {
  ALLOWED_TRANSITIONS,
  IllegalTransitionError,
  assertTransitionAllowed,
} from './state-machine.ts'
export {
  CrossInstrumentError,
  NotFoundError,
  VersionFrozenError,
  createAssessmentRepository,
  scalePointsSchema,
  type AddVersionItemInput,
  type AssessmentRepository,
  type CreateDimensionInput,
  type CreateInstrumentInput,
  type CreateItemInput,
  type CreateScaleInput,
  type CreateVersionInput,
  type CreateVersionResult,
  type ScalePoints,
} from './repository.ts'
export {
  getInstrument,
  getVersion,
  getVersionDetail,
  isFrozen,
  listBankItems,
  listDimensions,
  listInstruments,
  listScales,
  listVersions,
  type InstrumentSummary,
  type VersionDetail,
  type VersionItemDetail,
  type VersionSummary,
} from './read.ts'
export { diffVersionAgainstSource, type StemChange, type VersionDiff } from './diff.ts'
