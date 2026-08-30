---
id: requirements
title: Functional & Non-Functional Requirements
audience: both
load_when: 'butuh daftar FR/NFR lengkap, atau memverifikasi acceptance criteria sebuah story'
---

# Requirements

ID di halaman ini adalah **kunci referensi kanonik**. Rujuk `FR-005`, bukan "bab 6 baris 5".

## Functional Requirements

| ID     | Requirement                                                                               | Spesifikasi detail                                                        |
| ------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| FR-001 | Sistem mengelola akun, status, role, dan profile pengguna.                                | [security/rbac.md](../security/rbac.md)                                   |
| FR-002 | Sistem mendukung login lokal atau integrasi SSO/OIDC pada fase integrasi.                 | [security/rbac.md](../security/rbac.md)                                   |
| FR-003 | Sistem menyimpan consent/notice acceptance per versi dokumen.                             | [security/rbac.md](../security/rbac.md)                                   |
| FR-004 | Admin dapat membuat assessment type, version, sections, items, scale, dan scoring config. | [assessment/kdpgk-v1.md](../assessment/kdpgk-v1.md)                       |
| FR-005 | Published assessment version bersifat **immutable**.                                      | [data/data-dictionary.md](../data/data-dictionary.md)                     |
| FR-006 | Mahasiswa dapat memulai, menyimpan (autosave), melanjutkan, dan mengirim assessment.      | [architecture/api-design.md](../architecture/api-design.md)               |
| FR-007 | Scoring engine menghitung raw, normalized, domain, style, readiness, dan grid.            | [assessment/scoring-spec.md](../assessment/scoring-spec.md)               |
| FR-008 | Sistem menghasilkan dominant dan secondary style dengan tie-handling terdokumentasi.      | [assessment/scoring-spec.md](../assessment/scoring-spec.md)               |
| FR-009 | Sistem menghasilkan radar chart dan Blake-Mouton plot dengan alternatif teks.             | [security/accessibility.md](../security/accessibility.md)                 |
| FR-010 | Narrative engine menghasilkan interpretasi developmental dari rule set terversi.          | [ai/prompts/narrative-engine.v1.md](../ai/prompts/narrative-engine.v1.md) |
| FR-011 | Admin dapat melihat audit history perubahan instrumen dan scoring.                        | [security/rbac.md](../security/rbac.md)                                   |
| FR-012 | Academy mengelola curriculum, module, lesson, quiz, reflection, progress.                 | [features/academy.md](../features/academy.md)                             |
| FR-013 | Simulation mengelola scenario, branch, decision, rubric, score, reflection.               | [features/simulation.md](../features/simulation.md)                       |
| FR-014 | Development Plan mengelola baseline, goal, target, action, evidence, status.              | [features/development.md](../features/development.md)                     |
| FR-015 | Coaching mengelola assignment, session, note, action item, visibility control.            | [features/development.md](../features/development.md)                     |
| FR-016 | 360 Feedback mengelola campaign, rater group, invitation, anonymous aggregation.          | [features/feedback360.md](../features/feedback360.md)                     |
| FR-017 | Sistem menerbitkan certificate/badge dengan verification code.                            | [features/academy.md](../features/academy.md)                             |
| FR-018 | Research workspace mengekspor dataset sesuai approval.                                    | [features/research.md](../features/research.md)                           |
| FR-019 | Faculty dashboard menampilkan aggregate metrics dan trend.                                | [features/dashboard.md](../features/dashboard.md)                         |
| FR-020 | Notification service mendukung in-app/email sesuai konfigurasi.                           | [features/platform.md](../features/platform.md)                           |
| FR-021 | CMS mengelola public pages, news, event, program, knowledge resource.                     | [features/public-website.md](../features/public-website.md)               |
| FR-022 | Semua tindakan sensitif menghasilkan audit event.                                         | [security/rbac.md](../security/rbac.md)                                   |
| FR-023 | Admin dapat menonaktifkan akun tanpa menghapus historical records.                        | [features/platform.md](../features/platform.md)                           |
| FR-024 | Sistem menyediakan retention/archive mechanism.                                           | [features/platform.md](../features/platform.md)                           |
| FR-025 | Sistem menyediakan export individual report ke PDF pada fase produksi.                    | [features/platform.md](../features/platform.md)                           |

## Non-Functional Requirements

| ID                     | Target                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| NFR-01 Performance     | P95 API read ≤ 800 ms pada beban normal; report standard ≤ 10 detik kecuali AI call async. |
| NFR-02 Availability    | Target 99.5% fase awal; ditingkatkan setelah observasi beban.                              |
| NFR-03 Scalability     | Stateless application tier; database indexing; queue (Redis/BullMQ) untuk pekerjaan berat. |
| NFR-04 Security        | RBAC, least privilege, secure session, encryption, secret management, OWASP controls.      |
| NFR-05 Privacy         | Data minimization, purpose limitation, consent, access logging.                            |
| NFR-06 Accessibility   | WCAG 2.2 AA untuk user journey utama.                                                      |
| NFR-07 Maintainability | Typed code (TS strict), modular domain boundary, tests, ADR, code review.                  |
| NFR-08 Observability   | Structured logs, metrics, tracing, error monitoring, audit events.                         |
| NFR-09 Recoverability  | Automated backup; restore test terdokumentasi; RPO/RTO ditetapkan setelah infra final.     |
| NFR-10 Portability     | Containerized deployment; env config tanpa hard-coded secret.                              |
| NFR-11 Auditability    | Setiap score traceable ke assessment version, scoring version, response set, timestamp.    |
| NFR-12 AI Safety       | AI output punya policy, prompt version, model metadata, guardrail, human escalation.       |

## User Stories & Acceptance Criteria

| ID       | User Story                                                                              | Acceptance Criteria                                                                                                |
| -------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| STU-01   | Sebagai mahasiswa, saya ingin mengisi assessment dengan progress yang jelas.            | Progress persentase; autosave; validasi; dapat resume; tidak kehilangan jawaban setelah refresh terkontrol.        |
| STU-02   | Sebagai mahasiswa, saya ingin melihat profil saya segera setelah assessment selesai.    | Skor terversi; radar; dominant/secondary; Blake-Mouton; strengths; development areas; disclaimer non-diagnostik.   |
| STU-03   | Sebagai mahasiswa, saya ingin tahu apa yang harus dilakukan setelah melihat hasil.      | Minimal 3 rekomendasi tertaut ke modul/aktivitas; prioritas dapat dipilih jadi goal.                               |
| LECT-01  | Sebagai dosen, saya ingin melihat pola kelas tanpa membuka semua data individual.       | Aggregate view default; drill-down hanya untuk mahasiswa yang diampu; minimum group size untuk statistik sensitif. |
| ADM-01   | Sebagai admin, saya ingin menerbitkan versi instrumen baru tanpa merusak hasil lama.    | Version immutable setelah publish; effective date; preview; rollback ke draft tidak mengubah historical report.    |
| RES-01   | Sebagai peneliti, saya ingin mengekspor dataset teranonim setelah memperoleh otorisasi. | Approval reference; de-identification; export audit; tidak ada direct identifier.                                  |
| EXEC-01  | Sebagai pimpinan, saya ingin melihat outcome program per cohort.                        | Trend agregat; pre-post; completion; TIDAK ada default individual ranking.                                         |
| COACH-01 | Sebagai coach, saya ingin menindaklanjuti development goal.                             | Goal, action, evidence, note, next review date, visibility control.                                                |
