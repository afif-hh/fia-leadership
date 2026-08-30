---
id: handover
title: Go-Live Criteria & Handover Package
audience: human
load_when: 'persiapan go-live atau serah terima. Agent tidak perlu memuat ini.'
---

# Go-Live Acceptance Criteria

- Critical user journey lulus UAT.
- Tidak ada open SEV-1/SEV-2 defect.
- Scoring golden test disetujui Academic Lead.
- Role/authorization matrix teruji.
- Backup & restore test berhasil.
- Privacy notice & consent version diterbitkan.
- Accessibility critical issue diselesaikan.
- Runbook, admin manual, architecture, API documentation tersedia.
- Source code & CI/CD berada di akun/repository institusi.
- Admin & tim teknis menerima knowledge transfer.

# Handover Package

| Artefak           | Isi                                                   |
| ----------------- | ----------------------------------------------------- |
| Source Repository | Code, history, tags, release notes                    |
| Architecture Pack | C4/diagram, ADR, dependency map                       |
| Database Pack     | ERD, migrations, seed policy, backup                  |
| Assessment Pack   | Instrument catalog, scoring spec, validation log      |
| Security Pack     | Threat model, scan report, incident runbook           |
| Operations Pack   | Deployment, monitoring, backup/restore                |
| Product Pack      | PRD, user stories, roadmap, acceptance criteria       |
| Training Pack     | Admin manual, user guide, training materials          |
| Agent Pack        | CLAUDE.md, Skills, task templates, repo working rules |

## Continuous Improvement

Setiap semester dilakukan product review: usage, support issues, security, assessment
evidence, user feedback, accessibility, AI eval, data quality, roadmap.

Perubahan scoring/instrumen = **academic release**.
Perubahan software = **product release**.
Approval gate keduanya berbeda.
