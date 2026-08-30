---
id: roadmap
title: Implementation Roadmap & RACI
audience: human
load_when: 'perencanaan, bukan implementasi. Agent tidak perlu memuat ini.'
---

# Implementation Roadmap

## Fase

| Fase                               | Scope                                                           | Estimasi     |
| ---------------------------------- | --------------------------------------------------------------- | ------------ |
| Phase 0 — Foundation               | Governance, repo, arsitektur, UX, persiapan validasi KDPGK      | 2–4 minggu   |
| Phase 1 — Assessment Core          | Identity, assessment, scoring, profile, student/admin dashboard | 8–12 minggu  |
| Phase 2 — Academy                  | Sistem belajar 8 modul, quiz, reflection, progress              | 8–12 minggu  |
| Phase 3 — Simulation & Development | Simulation, development plan, lecturer dashboard                | 10–14 minggu |
| Phase 4 — Coaching & 360           | Coaching, multisource feedback, certificate                     | 8–12 minggu  |
| Phase 5 — Intelligence & Research  | Executive analytics, research workspace                         | 8–12 minggu  |
| Phase 6 — AI Leadership Lab        | AI coach, adaptive simulation, rekomendasi lanjutan             | Iteratif     |

Estimasi bersifat engineering planning dan dapat dipercepat dengan Claude Code multi-session
parallel work. Tetapi validasi akademik, security review, UAT, dan change management
**tidak boleh** dipadatkan sembarangan.

## MVP 90-Day Sprint Plan

| Sprint   | Fokus                                  | Output                 |
| -------- | -------------------------------------- | ---------------------- |
| Sprint 0 | Repo, CLAUDE.md, CI, ADR, environments | Engineering foundation |
| Sprint 1 | Identity, roles, profile, consent      | Secure access          |
| Sprint 2 | Assessment model + authoring draft     | Assessment backend     |
| Sprint 3 | Student assessment UI + autosave       | Assessment experience  |
| Sprint 4 | Scoring engine + golden tests          | Deterministic scoring  |
| Sprint 5 | Leadership profile + charts            | Individual report      |
| Sprint 6 | Admin dashboard + versioning           | Operations             |
| Sprint 7 | Security, performance, a11y            | Hardening              |
| Sprint 8 | Pilot, UAT, fixes                      | Release candidate      |
| Sprint 9 | Production + training                  | Go-live                |

## RACI

| Aktivitas            | Product Owner | Academic Lead | Tech Lead | Developer/Claude Code | QA/Sec | Admin Lab |
| -------------------- | ------------- | ------------- | --------- | --------------------- | ------ | --------- |
| Scope/priority       | A             | C             | C         | I                     | I      | C         |
| Assessment construct | C             | A             | C         | I                     | I      | C         |
| Architecture         | C             | C             | A         | R                     | C      | I         |
| Implementation       | I             | I             | A         | R                     | C      | I         |
| Security approval    | I             | I             | C         | R                     | A      | I         |
| UAT                  | A             | R             | C         | C                     | R      | R         |
| Production release   | A             | C             | R         | R                     | C      | R         |

`R=Responsible, A=Accountable, C=Consulted, I=Informed`.
Claude Code bukan accountable role — bekerja di bawah supervisi Developer/Tech Lead.

## Epic Backlog

| Epic                          | Scope                                        |
| ----------------------------- | -------------------------------------------- |
| EPIC-01 Identity & Governance | SSO-ready identity, RBAC, consent, audit     |
| EPIC-02 Assessment Authoring  | Instrument builder, versioning, item mapping |
| EPIC-03 Assessment Taking     | Autosave, resume, submit, accessibility      |
| EPIC-04 Scoring & Profile     | Deterministic scoring, chart, narrative      |
| EPIC-05 Academy               | Curriculum, module, quiz, reflection         |
| EPIC-06 Simulation            | Scenario engine, branching, rubric           |
| EPIC-07 Development           | Goals, evidence, coaching                    |
| EPIC-08 360 Feedback          | Campaign, rater anonymity, gap analysis      |
| EPIC-09 Intelligence          | Aggregate dashboards, cohort trend           |
| EPIC-10 Research              | Approved dataset export                      |
| EPIC-11 Platform              | Notification, files, CMS, observability      |
| EPIC-12 AI                    | Gateway, coach, evals, policy                |
