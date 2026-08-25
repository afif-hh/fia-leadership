---
id: rbac
title: RBAC, Consent & Audit
audience: agent
load_when: 'membuat/mengubah endpoint, query data lintas pengguna, atau menyentuh consent & audit'
covers: [FR-001, FR-002, FR-003, FR-011, FR-022, NFR-04]
---

# RBAC — Role-Based Access Control

Peran: **Student · Lecturer/Coach · Lab Admin · Academic Lead · Researcher ·
Faculty Executive · External Partner**

## Matriks Akses

| Resource | Student | Lecturer/Coach | Lab Admin | Academic Lead | Researcher | Faculty Executive | External Partner |
|---|---|---|---|---|---|---|---|
| Own Profile | CRUD | R | R | R | – | – | – |
| Own Assessment | CRUD | R* | R | R | – | – | – |
| Assigned Student Detail | – | R | R | R | – | – | R* |
| Assessment Configuration | – | – | CRUD | CRUD | – | – | – |
| Scoring Rules | – | – | Draft | Approve | – | – | – |
| Aggregate Dashboard | Own cohort | R | R | R | R* | R | R* |
| Research Export | – | – | Approve (op.) | Approve (acad.) | R* | – | – |
| Audit Log | Own actions | – | R | R | – | – | – |
| User Administration | – | – | CRUD | R | – | – | – |

`R*` = dibatasi oleh assignment, approval, cohort, atau tenancy.

**User Administration** = mengelola akun pengguna lain: memberikan/mencabut role
(`identity_user_roles`) dan menonaktifkan akun (FR-023). Ditambahkan karena kedua tindakan itu
sudah ada dan sudah menghasilkan audit event, tetapi sebelumnya tidak memetakan ke baris mana pun —
padahal [architecture/api-design.md](../architecture/api-design.md) mewajibkan setiap endpoint
memetakan ke tepat satu baris. Bukan "Own Profile": baris itu berbicara tentang data diri sendiri.

**Assessment Configuration** = membuat/mengedit/mem-publish instrumen assessment, item bank,
dimensi dan scale (bukan scoring config — itu tetap baris "Scoring Rules" terpisah). Academic Lead
naik dari `Approve` ke `CRUD` (issue #45): `roadmap.md`'s RACI membaca Admin Lab sebagai Consulted,
bukan Responsible, untuk "Assessment construct", tapi baris ini sengaja menyimpang darinya — kedua
role sama-sama butuh akses tulis penuh untuk fleksibilitas operasional (Admin Lab bisa membantu
entri data item bank tanpa merutekan setiap edit lewat Academic Lead).

**Wajib diimplementasikan sebagai policy rule server-side** (policy layer di
`server/domain/identity/policy.ts`), **bukan** hanya UI hiding. Implementasinya hand-rolled, bukan
CASL atau oso — alasannya di
[ADR-006](../architecture/adr/ADR-006-hand-rolled-policy-layer.md). UI bukan security boundary.
Setiap endpoint di [architecture/api-design.md](../architecture/api-design.md) harus
memetakan ke satu baris tabel ini.

## Klasifikasi Data & Akses Default

| Data Class | Contoh | Akses Default |
|---|---|---|
| Public | News, event, publikasi riset publik | Public |
| Internal | Konfigurasi program, draft konten modul | Staff |
| Confidential | Student profile, assessment score | Owner + assigned staff |
| Restricted | Raw responses, detail 360 feedback, research export | Strictly authorized |

## Consent & Governance

- `identity.consents` mencatat acceptance per versi dokumen kebijakan (privacy notice).
- Consent wajib ada **sebelum** assessment dimulai bila kebijakan mensyaratkan (FR-003).
- Non-aktivasi akun (FR-023) **tidak** menghapus historical record.

## Audit Classification

Semua tindakan sensitif **wajib** menghasilkan event `platform.audit_logs` (append-only):

- Submit assessment
- Ubah scoring config
- Akses profil mahasiswa lain
- Export research dataset
- Disable akun

Endpoint baru wajib menentukan audit classification di definition of done —
prosedur: `skills/secure-api-endpoint/SKILL.md`.

`audit_logs` tidak boleh di-UPDATE atau di-DELETE. Konten audit diminimalkan
(user id boleh, payload tidak) — lihat [PII Rule](../../CLAUDE.md#pii-rule).
