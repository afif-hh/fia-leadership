---
id: privacy-security
title: Secure SDLC & Privacy-by-Design
audience: agent
load_when: 'threat modelling, review keamanan, retention, atau keputusan tentang pemakaian data'
covers: [NFR-04, NFR-05]
---

# Security & Privacy

## Secure SDLC

| Stage   | Control                                                         |
| ------- | --------------------------------------------------------------- |
| Plan    | Threat model, data classification, security acceptance criteria |
| Code    | Secure coding, dependency scan, secret scan, code review        |
| Build   | Reproducible build, SBOM (bila tersedia), signed artifact       |
| Test    | SAST, SCA, unit/integration, authz tests, DAST di staging       |
| Deploy  | Least-privilege service account, secret manager, TLS            |
| Operate | Logging, alerting, patching, backup, incident runbook           |
| Respond | Vulnerability triage, rollback, post-incident review            |

## Privacy-by-Design

Prinsip: collect minimum necessary · separate purpose · restrict access ·
establish retention · support correction · log access.

> **Data operasional tidak otomatis boleh dipakai untuk riset** hanya karena tersedia di
> database. Butuh approval terpisah — lihat [features/research.md](../features/research.md).

Klasifikasi data & akses default: [rbac.md](./rbac.md).
Aturan PII di log/trace/metric: [/CLAUDE.md](../../CLAUDE.md#pii-rule).

## Kontrol yang Sering Terlewat

- Rate limit pada endpoint auth dan AI (angka: lihat `docs/engineering/devsecops.md`).
- Upload restriction: tipe, ukuran, scanning, tidak dieksekusi dari domain aplikasi.
- Signed token + expiry untuk invitation 360 feedback.
- Tidak ada raw response di log — berlaku juga di error handler dan trace attribute.
- Session security: rotasi, httpOnly, sameSite, invalidasi saat role berubah.
