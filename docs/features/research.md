---
id: research
title: Research Data Architecture
audience: both
load_when: 'bekerja pada export dataset, de-identification, atau approval riset'
covers: [FR-018]
---

# Research Data Architecture

Schema: `research` (`projects`, `approvals`, `exports`).

> **Operational database bukan research dataset.** Data operasional tidak otomatis boleh
> dipakai untuk riset hanya karena tersedia di database. Butuh approval terpisah.

## Pipeline

```
select variables → de-identify → suppress small cells
  → create dataset version → attach approval metadata → export → audit
```

## Data Provenance (wajib dicatat per export)

- Source assessment version
- Scoring version
- Cohort/program context
- Transformation steps
- De-identification method
- Research approval reference
- Export timestamp & requester

## Kontrol

- Data class `Restricted` — akses `R*` untuk Researcher, dibatasi approval
  (lihat [rbac](../security/rbac.md)).
- Dual approval: operasional (Lab Admin) + akademik (Academic Lead).
- Tidak ada direct identifier di output (RES-01).
- Small-cell suppression sebelum export, bukan sesudah.
- Setiap export menghasilkan audit event dan `ResearchExportGenerated`.
