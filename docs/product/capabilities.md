---
id: capabilities
title: Domain Kapabilitas & Prioritas Fitur
audience: both
load_when: 'menentukan scope, prioritas, atau domain mana yang tersentuh sebuah task'
---

# Domain Kapabilitas (C1–C9)

| Kode | Domain                  | Ringkasan                                                                       | Schema Postgres |
| ---- | ----------------------- | ------------------------------------------------------------------------------- | --------------- |
| C1   | Identity & Governance   | Identity, profile, roles, consent, permissions, audit                           | `identity`      |
| C2   | Assessment              | Instrument, item bank, session, response, scoring, validity metadata            | `assessment`    |
| C3   | Leadership Profile      | Potential, style profile, Blake-Mouton, readiness, narrative                    | `profile`       |
| C4   | Learning Academy        | Curriculum, module, lesson, quiz, reflection, progress, badge                   | `learning`      |
| C5   | Simulation              | Scenario, role, branch, decision, rubric, feedback, reflection                  | `simulation`    |
| C6   | Development & Coaching  | Development plan, goals, evidence, coaching session, follow-up                  | `development`   |
| C7   | 360 Feedback            | Campaign, rater groups, invitation, response, anonymity threshold, gap analysis | `feedback360`   |
| C8   | Research & Intelligence | Aggregate analytics, cohort trend, research dataset, KPI                        | `research`      |
| C9   | Platform & AI           | Notifications, CMS, integration, AI gateway, observability, DevSecOps           | `platform`      |

## Feature Map & Prioritas

| Prioritas | Fitur                                         | Kategori            | Spesifikasi                                                                                                                       |
| --------- | --------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| P0        | Identity, SSO-ready, RBAC, consent            | Foundation          | [security/rbac.md](../security/rbac.md)                                                                                           |
| P0        | Assessment Engine + KDPGK                     | Core                | [assessment/kdpgk-v1.md](../assessment/kdpgk-v1.md), [ADR-010](../architecture/adr/ADR-010-scoring-v1-formulas-and-thresholds.md) |
| P0        | Leadership Profile + radar + grid + narrative | Core                | [assessment/scoring-spec.md](../assessment/scoring-spec.md)                                                                       |
| P0        | Student Dashboard                             | Core                | [features/dashboard.md](../features/dashboard.md)                                                                                 |
| P0        | Admin Instrument Management                   | Core                | [assessment/kdpgk-v1.md](../assessment/kdpgk-v1.md)                                                                               |
| P0        | Audit & security baseline                     | Foundation          | [security/privacy-security.md](../security/privacy-security.md)                                                                   |
| P1        | Leadership Academy                            | Learning            | [features/academy.md](../features/academy.md)                                                                                     |
| P1        | Simulation Center                             | Experiential        | [features/simulation.md](../features/simulation.md)                                                                               |
| P1        | Development Plan                              | Development         | [features/development.md](../features/development.md)                                                                             |
| P1        | Lecturer/Coach Dashboard                      | Development         | [features/dashboard.md](../features/dashboard.md)                                                                                 |
| P2        | Coaching Workflow                             | Development         | [features/development.md](../features/development.md)                                                                             |
| P2        | 360 Feedback                                  | Advanced Assessment | [features/feedback360.md](../features/feedback360.md)                                                                             |
| P2        | Certificate & Badge                           | Credential          | [features/academy.md](../features/academy.md)                                                                                     |
| P2        | Research Workspace                            | Research            | [features/research.md](../features/research.md)                                                                                   |
| P2        | Faculty Leadership Intelligence               | Intelligence        | [features/dashboard.md](../features/dashboard.md)                                                                                 |
| P3        | AI Leadership Coach                           | AI                  | [ai/governance.md](../ai/governance.md)                                                                                           |
| P3        | Adaptive Simulation                           | AI                  | [features/simulation.md](../features/simulation.md)                                                                               |
| P3        | External Partner Portal                       | Ecosystem           | [security/rbac.md](../security/rbac.md)                                                                                           |
