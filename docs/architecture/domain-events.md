---
id: domain-events
title: Domain Events
audience: agent
load_when: 'integrasi antar-domain, notifikasi, analytics, atau job async'
depends_on: [patterns]
---

# Domain Events

Event adalah satu-satunya cara domain berkomunikasi selain service interface publik.
Transport: Redis pub/sub atau queue (BullMQ).

| Event                      | Payload Minimal                           |
| -------------------------- | ----------------------------------------- |
| `AssessmentStarted`        | `session_id, user_id, assessment_version` |
| `AssessmentSubmitted`      | `session_id`                              |
| `AssessmentScored`         | `score_run_id`                            |
| `ProfileUpdated`           | `profile_snapshot_id`                     |
| `ModuleCompleted`          | `enrollment_id, module_id`                |
| `SimulationCompleted`      | `attempt_id`                              |
| `DevelopmentGoalCreated`   | `goal_id`                                 |
| `CoachingSessionCompleted` | `session_id`                              |
| `Feedback360Closed`        | `campaign_id`                             |
| `CertificateIssued`        | `certificate_id`                          |
| `ResearchExportGenerated`  | `export_id`                               |

## Aturan

- **Payload minimal = ID saja** bila memungkinkan. Consumer mengambil detail lewat service
  interface sesuai izinnya sendiri.
- PII di event bus diminimalkan — lihat [PII Rule](../../CLAUDE.md#pii-rule).
- Consumer tidak boleh mengasumsikan urutan pengiriman. Buat handler idempotent.
- Event dipakai untuk: notification, analytics, async report generation, audit integration.
- Menambah event baru = menambah baris di tabel ini pada PR yang sama.
