---
id: api-design
title: API Design
audience: agent
load_when: "membuat atau mengubah endpoint, kontrak request/response, atau error handling"
depends_on: [rbac]
covers: [FR-006]
---

# API Design

Convention: **Nitro server routes** di `server/api/v1/**` → otomatis terekspos di `/api/v1/**`.

Semua endpoint wajib authorization check di service/policy layer (server-side).
**UI bukan security boundary.** Filter data berdasarkan role/assignment dilakukan di server.

Setiap endpoint baru wajib memetakan ke satu baris matriks di
[security/rbac.md](../security/rbac.md) dan menentukan audit classification.

## Error Contract

Semua endpoint mengembalikan envelope error yang sama. Jangan menciptakan bentuk baru.

```jsonc
{
  "error": {
    "code": "ASSESSMENT_VERSION_IMMUTABLE",  // SCREAMING_SNAKE, stabil, dapat di-i18n
    "message": "Versi instrumen yang sudah dipublikasikan tidak dapat diubah.",
    "requestId": "01J...",                   // selalu ada, untuk korelasi trace
    "fields": [                              // hanya untuk 422
      { "path": "items[3].value", "code": "REQUIRED" }
    ]
  }
}
```

| Status | Dipakai untuk |
|---|---|
| 400 | Request malformed (JSON invalid, param tidak terparse) |
| 401 | Belum terautentikasi |
| 403 | Terautentikasi tapi policy menolak — **jangan** bocorkan keberadaan resource |
| 404 | Resource tidak ada, atau tidak boleh diketahui keberadaannya |
| 409 | Konflik state (submit ganda, version sudah published) |
| 422 | Validasi domain gagal — wajib isi `fields` |
| 429 | Rate limit terlampaui |
| 500 | Kesalahan internal — **tidak pernah** membocorkan stack/raw payload |

Message error tidak boleh memuat `responses.answer_value` atau data pribadi.

## Konvensi Umum

- Versi di path: `/api/v1/`. Breaking change → `/api/v2/`, bukan mengubah v1.
- Pagination: `?limit=&cursor=`, response memuat `nextCursor`.
- Idempotency: endpoint submit menerima `Idempotency-Key` header (lihat SC-07).
- Timestamp: ISO 8601 UTC.
- Semua response memuat `requestId`.

## Endpoint Catalog

Tabel di bawah adalah **kontrak awal**. Sumber kebenaran jangka panjang adalah route files
dan OpenAPI yang digenerate darinya — perbarui tabel ini hanya bila kontrak berubah.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/auth/session` | Login/session |
| GET | `/api/v1/me` | Current user |
| POST | `/api/v1/consents` | Rekam acceptance consent/policy version |
| GET | `/api/v1/assessments` | Daftar assessment tersedia |
| POST | `/api/v1/assessments/{id}/sessions` | Mulai session |
| PUT | `/api/v1/sessions/{id}/responses` | Simpan jawaban (autosave) |
| POST | `/api/v1/sessions/{id}/submit` | Submit assessment → trigger scoring |
| GET | `/api/v1/profiles/me` | Leadership profile saat ini |
| GET | `/api/v1/profiles/me/history` | Riwayat profil (snapshot) |
| POST | `/api/v1/admin/assessment-versions` | Buat/publish versi instrumen (Lab Admin) |
| POST | `/api/v1/admin/scoring-rules` | Draft/approve scoring rule |
| GET | `/api/v1/academy/modules` | Daftar modul |
| POST | `/api/v1/academy/modules/{id}/enroll` | Enroll modul |
| PUT | `/api/v1/academy/enrollments/{id}/progress` | Update progress |
| GET | `/api/v1/simulations` | Daftar skenario |
| POST | `/api/v1/simulations/{id}/attempts` | Mulai simulasi |
| POST | `/api/v1/simulations/attempts/{id}/decisions` | Rekam keputusan node |
| POST | `/api/v1/development/goals` | Buat development goal |
| PUT | `/api/v1/development/goals/{id}/evidence` | Tambah evidence |
| GET | `/api/v1/coach/mentees` | Daftar mentee yang diampu |
| POST | `/api/v1/coach/sessions` | Rekam sesi coaching |
| POST | `/api/v1/feedback360/campaigns` | Buat campaign 360 |
| POST | `/api/v1/feedback360/campaigns/{id}/invite` | Kirim invitation (signed token) |
| POST | `/api/v1/feedback360/responses` | Submit respons rater |
| GET | `/api/v1/certificates/{id}/verify` | Verifikasi sertifikat (public, by code) |
| GET | `/api/v1/intelligence/cohorts/{id}` | Aggregate metrics cohort |
| POST | `/api/v1/research/exports` | Request/generate export dataset teranonim |
| GET | `/api/v1/cms/pages` | Konten public website |
| GET | `/api/v1/audit-logs` | Query audit log (role-restricted) |
