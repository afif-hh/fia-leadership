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
  BaseLocaleNotTranslatableError,
  CrossInstrumentError,
  DuplicateCodeError,
  InvalidReorderError,
  InvalidSourceVersionError,
  NotFoundError,
  OpenVersionExistsError,
  VersionFrozenError,
  VersionNotPublishableError,
  type BankRow,
} from './errors.ts'
export {
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
  getInstrumentTranslations,
  getVersion,
  getVersionDetail,
  isFrozen,
  listBankItems,
  listDimensions,
  listInstruments,
  listScales,
  listVersions,
  type InstrumentSummary,
  type InstrumentTranslations,
  type VersionDetail,
  type VersionItemDetail,
  type VersionSummary,
} from './read.ts'
export { diffVersionAgainstSource, type StemChange, type VersionDiff } from './diff.ts'
export {
  ALLOWED_SESSION_TRANSITIONS,
  IllegalSessionTransitionError,
  assertSessionTransitionAllowed,
  isOpenForAnswers,
} from './taking-state-machine.ts'
export {
  NoApprovedScoringVersionError,
  ScoringConfigInputError,
  ScoringVersionFrozenError,
  SessionNotScorableError,
  approveScoringVersion,
  bandsSchema,
  createScoringVersion,
  getScoringConfig,
  getScoringVersion,
  hasSessionAwaitingScore,
  listScoringVersions,
  markSessionScored,
  readScorableSession,
  retireScoringVersion,
  type Bands,
  type ScorableSession,
  type ScoringVersionSummary,
  type ScoringWeightInput,
} from './scoring.ts'
export {
  IncompleteResponseSetError,
  InvalidAnswerError,
  SessionAlreadySubmittedError,
  VersionNotTakeableError,
  getSession,
  listTakeableVersions,
  saveAnswer,
  startSession,
  submitSession,
  type TakeableVersion,
  type TakingItem,
  type TakingSession,
  type TakingSessionDetail,
} from './taking.ts'
