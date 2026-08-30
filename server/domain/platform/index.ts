/**
 * The `platform` domain's public entrypoint.
 *
 * Other domains import from here and nowhere else inside this folder — CLAUDE.md rule 12: domains
 * communicate through public service interfaces, never by reaching into each other's files. The
 * `fia/domain-boundary` ESLint rule enforces it.
 */
export {
  asAuditEventType,
  createAuditRepository,
  type AuditEvent,
  type AuditEventType,
  type AuditRepository,
} from './audit.ts'
export { listAuditEvents, type AuditEventRow, type ListAuditEventsOptions } from './audit-read.ts'
