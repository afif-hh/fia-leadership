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
| ~~POST~~ | ~~`/api/v1/admin/assessment-versions`~~ | **Digantikan** oleh blok Assessment Authoring di bawah (issue #53) |
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

## Assessment Authoring (issue #53)

Menggantikan satu baris `POST /api/v1/admin/assessment-versions` di katalog di atas. Baris itu
menggabungkan "buat" dan "publish" menjadi satu endpoint, padahal keduanya adalah transisi state
yang berbeda dengan invariant berbeda ([#48](https://github.com/afif-hh/fia-leadership/issues/48)),
dan tidak menyediakan tempat untuk item bank, dimensi, scale, maupun diff.

Semua endpoint di bawah memetakan ke **satu** baris matriks rbac.md: **Assessment Configuration**,
yang sel Lab Admin dan Academic Lead-nya keduanya `CRUD`
([#45](https://github.com/afif-hh/fia-leadership/issues/45)). Tidak ada sel `scoped` di baris itu,
jadi tidak ada endpoint di sini yang perlu scope predicate.

| Method | Endpoint | Action | Audit | Purpose |
|---|---|---|---|---|
| GET | `/api/v1/assessment/instruments` | read | – | Daftar instrumen |
| POST | `/api/v1/assessment/instruments` | create | – | Buat instrumen |
| GET | `/api/v1/assessment/instruments/{instrumentId}` | read | – | Satu instrumen + versions + item bank + dimensions + scales |
| POST | `/api/v1/assessment/instruments/{instrumentId}/versions` | create | **ya** | Buat versi: blank, atau clone dari `sourceVersionId` |
| POST | `/api/v1/assessment/instruments/{instrumentId}/items` | create | – | Tambah item ke bank (+ mapping dimensi opsional) |
| POST | `/api/v1/assessment/instruments/{instrumentId}/dimensions` | create | – | Tambah dimensi |
| POST | `/api/v1/assessment/instruments/{instrumentId}/scales` | create | – | Tambah scale |
| GET | `/api/v1/assessment/versions/{versionId}` | read | – | Detail versi: selection, mapping dimensi, scale |
| PATCH | `/api/v1/assessment/versions/{versionId}` | update | – | Edit selection draft: `addItem` / `removeItem` / `reorder` / `setReverseCoded` |
| GET | `/api/v1/assessment/versions/{versionId}/diff` | read | – | Diff terhadap `source_version_id` |
| POST | `/api/v1/assessment/versions/{versionId}/review` | update | – | `draft → review` |
| POST | `/api/v1/assessment/versions/{versionId}/publish` | update | **ya** | `review → published` (isi snapshot lalu flip, satu transaksi) |
| POST | `/api/v1/assessment/versions/{versionId}/retire` | update | **ya** | `published → retired` |
| PATCH | `/api/v1/assessment/items/{itemId}` | update | – | Reword item bank **in place** |
| PUT | `/api/v1/assessment/items/{itemId}/dimensions` | update | – | Ganti seluruh set dimensi satu item (delete-then-insert, satu transaksi) |
| PATCH | `/api/v1/assessment/dimensions/{dimensionId}` | update | – | Ubah dimensi |
| PATCH | `/api/v1/assessment/scales/{scaleId}` | update | – | Ubah scale |

### Audit classification

Kolom **Audit** di atas berarti `audit: true` pada spec route, yang memaksa
`requireFreshSession` — keputusan otorisasi untuk aksi ini tidak boleh dibaca dari cookie cache
yang basi hingga 60 detik. Tiga endpoint memakainya: **create version**, **publish**, dan
**retire** — tepat tiga aksi yang menulis audit event
(`assessment.version_created` / `_published` / `_retired`) di dalam transaksinya sendiri.

`review` **tidak** audit-classified: ia tidak membekukan apa pun dan tidak ada di daftar Audit
Classification rbac.md. Endpoint read juga tidak — membaca audit log sendiri sudah diputuskan tidak
diaudit di [#20](https://github.com/afif-hh/fia-leadership/issues/20), dan hal yang sama berlaku
di sini.

Detail audit **hanya** memuat id dan hitungan — tidak pernah stem item, scale point, atau isi
jawaban ([PII Rule](../../CLAUDE.md#pii-rule)).

### Status yang dikembalikan

Selain tabel status umum di atas, domain ini memetakan error-nya seperti ini
(`server/http/domain-errors.ts`):

| Domain error | Status | `error.code` |
|---|---|---|
| `NotFoundError` | 404 | `NOT_FOUND` |
| `VersionFrozenError` | 409 | `ASSESSMENT_VERSION_IMMUTABLE` |
| `IllegalTransitionError` | 409 | `ASSESSMENT_VERSION_TRANSITION_ILLEGAL` |
| `CrossInstrumentError` | 422 | `ASSESSMENT_CROSS_INSTRUMENT` |
| Validasi `zod/mini` gagal | 422 | `VALIDATION_FAILED` (+ `fields`) |

404 tidak pernah memuat kembali id yang diminta, dan 422 hanya memuat `path` + `code` per field —
**tidak** memuat nilai yang dikirim, supaya request yang membawa isi jawaban tidak bisa
direfleksikan keluar lewat pesan error.

Error yang **tidak** dikenali sengaja tidak dipetakan: ia tetap menjadi 500, karena membungkus bug
sebagai 4xx yang rapi akan menyembunyikannya.

### Bentuk response

Versi yang sudah `published` atau `retired` membawa `frozen: true` dan membaca **snapshot**-nya,
bukan teks bank hari ini — inti dari snapshot-on-publish di
[#47](https://github.com/afif-hh/fia-leadership/issues/47). Versi `draft`/`review` membawa
`frozen: false` dan membaca bank live.

```jsonc
// GET /api/v1/assessment/versions/{versionId}
{
  "id": "…", "instrumentId": "…", "versionNo": 2, "status": "draft",
  "publishedAt": null, "retiredAt": null, "sourceVersionId": "…", "createdAt": "2026-08-25T…",
  "frozen": false,
  "items": [
    {
      "versionItemId": "…", "itemId": "…", "code": "kd01",
      "position": 0, "reverseCoded": false,
      "stem": "…",                                  // snapshot bila frozen, bank live bila tidak
      "scalePoints": [{ "value": 1, "label": "…" }], // idem
      "scaleCode": "likert5",
      "dimensions": [{ "id": "…", "code": "directive", "kind": "style" }]
    }
  ]
}
```

```jsonc
// GET /api/v1/assessment/versions/{versionId}/diff
{
  "versionId": "…",
  "sourceVersionId": "…",
  "blank": false,                 // true bila tidak punya source (setiap v1) — semua list kosong
  "added":   [{ "itemId": "…", "code": "kd02", "position": 1 }],
  "removed": [{ "itemId": "…", "code": "kd07", "position": 3 }],
  "moved":   [{ "itemId": "…", "code": "kd01", "from": 0, "to": 1 }],
  "reverseCodingChanged": [{ "itemId": "…", "code": "kd01", "from": false, "to": true }],
  "stemChanged": [{ "itemId": "…", "code": "kd01", "before": "…", "after": "…" }],
  "totalChanges": 5               // yang disebut review screen sebelum publish diaktifkan (#50)
}
```

`stemChanged` **wajib** ada, bukan pelengkap: [#49](https://github.com/afif-hh/fia-leadership/issues/49)
mengizinkan item bank di-reword **in place** justru dengan syarat drift-nya terlihat untuk dinilai
Academic Lead. `before` adalah wording yang dibekukan source; `after` adalah wording bank sekarang.
Tag diff di sebuah kolom tidak pernah menunjukkan teks lama, karena itu keduanya dikirim.
