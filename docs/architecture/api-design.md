---
id: api-design
title: API Design
audience: agent
load_when: 'membuat atau mengubah endpoint, kontrak request/response, atau error handling'
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
    "code": "ASSESSMENT_VERSION_IMMUTABLE", // SCREAMING_SNAKE, stabil, dapat di-i18n
    "message": "Versi instrumen yang sudah dipublikasikan tidak dapat diubah.",
    "requestId": "01J...", // selalu ada, untuk korelasi trace
    "fields": [
      // hanya untuk 422
      { "path": "items[3].value", "code": "REQUIRED" },
    ],
  },
}
```

| Status | Dipakai untuk                                                                |
| ------ | ---------------------------------------------------------------------------- |
| 400    | Request malformed (JSON invalid, param tidak terparse)                       |
| 401    | Belum terautentikasi                                                         |
| 403    | Terautentikasi tapi policy menolak — **jangan** bocorkan keberadaan resource |
| 404    | Resource tidak ada, atau tidak boleh diketahui keberadaannya                 |
| 409    | Konflik state (submit ganda, version sudah published)                        |
| 422    | Validasi domain gagal — wajib isi `fields`                                   |
| 429    | Rate limit terlampaui                                                        |
| 500    | Kesalahan internal — **tidak pernah** membocorkan stack/raw payload          |

Message error tidak boleh memuat `responses.answer_value` atau data pribadi.

## Konvensi Umum

- Versi di path: `/api/v1/`. Breaking change → `/api/v2/`, bukan mengubah v1.
- Pagination: `?limit=&cursor=`, response memuat `nextCursor`.
- Idempotency: endpoint submit menerima `Idempotency-Key` header (lihat SC-07).
- Timestamp: ISO 8601 UTC.
- Semua response memuat `requestId`.
- Bahasa: read endpoint menerima `?locale=id|en`. Nilai tak dikenal jatuh ke cookie `fia_locale`,
  lalu `Accept-Language`, lalu `id` — bukan 400, karena bahasa adalah preferensi render pada read
  path (`server/http/request-locale.ts`). Endpoint terjemahan memakai locale sebagai **segmen
  path** (`…/translations/{locale}`) dan di situ nilainya ketat: bahasa yang tidak dilayani → 422
  `UNSUPPORTED_LOCALE`.
- API tidak pernah mengirim teks tampilan yang sudah diterjemahkan untuk hal yang punya identitas
  stabil. `code` pada error envelope dan `id` pada item navigasi adalah kuncinya; kalimatnya
  dirender di klien dari `i18n/locales/`. Lihat [ADR-009](./adr/ADR-009-bilingual-content.md).

## Endpoint Catalog

Tabel di bawah adalah **kontrak awal**. Sumber kebenaran jangka panjang adalah route files
dan OpenAPI yang digenerate darinya — perbarui tabel ini hanya bila kontrak berubah.

> **Catatan taking flow (#64, #78).** Empat baris taking di bawah menyimpang dari draft awal
> (`/api/v1/assessments/{id}/sessions`, `/api/v1/sessions/{id}/...`) dalam dua hal:
>
> 1. **Prefix domain `assessment/`**, mengikuti route authoring yang sudah ada — bukan
>    `assessments/` di top level, yang akan membuat dua prefix mirip untuk satu domain.
> 2. **`{versionId}`, bukan `{id}`.** Session terikat pada _version_, bukan instrument
>    (`assessment_sessions.version_id`), dan `{id}` yang ambigu adalah undangan untuk mengirim
>    instrument id ke endpoint yang menuntut version id.
>
> "→ trigger scoring" pada baris submit juga dihapus: #70 memutuskan map taking hanya menjamin
> _interface_-nya (status `submitted` + response set beku + audit event), sedangkan mekanisme
> pemicunya milik effort scoring engine.

| Method   | Endpoint                                            | Purpose                                                            |
| -------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| POST     | `/api/v1/auth/session`                              | Login/session                                                      |
| GET      | `/api/v1/me`                                        | Current user                                                       |
| POST     | `/api/v1/consents`                                  | Rekam acceptance consent/policy version                            |
| GET      | `/api/v1/assessments`                               | Daftar assessment tersedia                                         |
| POST     | `/api/v1/assessment/versions/{versionId}/sessions`  | Mulai session, atau lanjutkan yang masih berjalan                  |
| GET      | `/api/v1/assessment/sessions/{sessionId}`           | Baca session + item + jawaban tersimpan (resume)                   |
| PUT      | `/api/v1/assessment/sessions/{sessionId}/responses` | Simpan **satu** jawaban (autosave)                                 |
| POST     | `/api/v1/assessment/sessions/{sessionId}/submit`    | Submit assessment (scoring berjalan inline sesudah commit)         |
| POST     | `/api/v1/assessment/sessions/{sessionId}/score`     | Nilai sesi sendiri, idempoten — jalur pemulihan, bukan jalur utama |
| GET      | `/api/v1/profiles/me`                               | Leadership profile saat ini                                        |
| GET      | `/api/v1/profiles/me/history`                       | Riwayat profil (snapshot)                                          |
| ~~POST~~ | ~~`/api/v1/admin/assessment-versions`~~             | **Digantikan** oleh blok Assessment Authoring di bawah (issue #53) |
| ~~POST~~ | ~~`/api/v1/admin/scoring-rules`~~                   | **Digantikan** oleh blok Scoring Configuration di bawah (ADR-010)  |
| GET      | `/api/v1/academy/modules`                           | Daftar modul                                                       |
| POST     | `/api/v1/academy/modules/{id}/enroll`               | Enroll modul                                                       |
| PUT      | `/api/v1/academy/enrollments/{id}/progress`         | Update progress                                                    |
| GET      | `/api/v1/simulations`                               | Daftar skenario                                                    |
| POST     | `/api/v1/simulations/{id}/attempts`                 | Mulai simulasi                                                     |
| POST     | `/api/v1/simulations/attempts/{id}/decisions`       | Rekam keputusan node                                               |
| POST     | `/api/v1/development/goals`                         | Buat development goal                                              |
| PUT      | `/api/v1/development/goals/{id}/evidence`           | Tambah evidence                                                    |
| GET      | `/api/v1/coach/mentees`                             | Daftar mentee yang diampu                                          |
| POST     | `/api/v1/coach/sessions`                            | Rekam sesi coaching                                                |
| POST     | `/api/v1/feedback360/campaigns`                     | Buat campaign 360                                                  |
| POST     | `/api/v1/feedback360/campaigns/{id}/invite`         | Kirim invitation (signed token)                                    |
| POST     | `/api/v1/feedback360/responses`                     | Submit respons rater                                               |
| GET      | `/api/v1/certificates/{id}/verify`                  | Verifikasi sertifikat (public, by code)                            |
| GET      | `/api/v1/intelligence/cohorts/{id}`                 | Aggregate metrics cohort                                           |
| POST     | `/api/v1/research/exports`                          | Request/generate export dataset teranonim                          |
| GET      | `/api/v1/cms/pages`                                 | Konten public website                                              |
| GET      | `/api/v1/audit-logs`                                | Query audit log (role-restricted)                                  |

## Audit log query (FR-011)

`GET /api/v1/audit-logs` menerima `?eventType=` selain `?limit=`, dan mengembalikan `eventTypes`
bersama `events`:

```jsonc
// GET /api/v1/audit-logs?limit=100&eventType=assessment.version_published
{
  "events": [
    {
      "id": "…",
      "eventType": "assessment.version_published",
      "actorUserId": "…",
      "targetUserId": null,
      "detail": "{\"event_type\":\"assessment.version_published\",…}",
      "createdAt": "2026-08-30T11:32:25.980Z",
    },
  ],
  // Setiap tipe peristiwa yang ada pada baris yang boleh dibaca pemanggil ini.
  "eventTypes": ["assessment.version_published", "identity.role_change"],
}
```

`eventType` adalah kesamaan persis, bukan prefix. `assessment.` sebagai prefix juga akan mencocokkan
`assessment.session_submitted`, dan filter audit yang melebar tanpa diminta lebih buruk daripada
tidak ada filter.

Nilai yang tidak dibawa baris mana pun mengembalikan `events: []`, bukan 400. Baris itu memang tidak
ada, jadi "tidak ada hasil" adalah jawaban yang benar dan bukan kelonggaran; tidak ada error class
untuk ini. Nilai yang lebih panjang dari 64 karakter juga mengembalikan kosong — CHECK pada kolom
berhenti di 64, sehingga nilai sepanjang itu tidak mungkin dimiliki baris mana pun. Yang **tidak**
dilakukan adalah mengabaikan nilai terlalu panjang lalu mengembalikan seluruh baris, karena hasil
yang melebar secara senyap pada log audit lebih berbahaya daripada hasil kosong.

`eventTypes` diturunkan dari `SELECT DISTINCT event_type` atas baris yang lolos narrowing yang sama
dengan `events`, **bukan** dari daftar yang disimpan aplikasi. Kosakata event dimiliki tiap domain di
`server/domain/<domain>/audit-events.ts` ([#28](https://github.com/afif-hh/fia-leadership/issues/28)
dan amandemennya), dan registry terpusat di `platform` akan membalik dependensi itu. Konsekuensinya:
domain yang menambah aksi teraudit langsung mendapat opsi filter tanpa perubahan kode di sisi
platform, dan opsi tidak pernah bisa berbeda dari isi tabel.

Narrowing berlaku pada **keduanya**. Sel `Own actions` seorang mahasiswa membuat `eventTypes` hanya
memuat tipe peristiwa yang ia sendiri lakukan. Daftar yang tidak dinarrowing tidak membocorkan satu
baris pun, tetapi memberi tahu mahasiswa jenis tindakan apa yang dilakukan orang lain — kelas
disclosure yang sama dengan yang dijaga `scoped-narrowing.test.ts`, satu tingkat di atas baris.

Membaca endpoint ini tetap tidak diaudit ([#20](https://github.com/afif-hh/fia-leadership/issues/20)).

## Assessment Authoring (issue #53)

Menggantikan satu baris `POST /api/v1/admin/assessment-versions` di katalog di atas. Baris itu
menggabungkan "buat" dan "publish" menjadi satu endpoint, padahal keduanya adalah transisi state
yang berbeda dengan invariant berbeda ([#48](https://github.com/afif-hh/fia-leadership/issues/48)),
dan tidak menyediakan tempat untuk item bank, dimensi, scale, maupun diff.

Semua endpoint di bawah memetakan ke **satu** baris matriks rbac.md: **Assessment Configuration**,
yang sel Lab Admin dan Academic Lead-nya keduanya `CRUD`
([#45](https://github.com/afif-hh/fia-leadership/issues/45)). Tidak ada sel `scoped` di baris itu,
jadi tidak ada endpoint di sini yang perlu scope predicate.

| Method | Endpoint                                                   | Action | Audit  | Purpose                                                                        |
| ------ | ---------------------------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------ |
| GET    | `/api/v1/assessment/instruments`                           | read   | –      | Daftar instrumen                                                               |
| POST   | `/api/v1/assessment/instruments`                           | create | –      | Buat instrumen                                                                 |
| GET    | `/api/v1/assessment/instruments/{instrumentId}`            | read   | –      | Satu instrumen + versions + item bank + dimensions + scales                    |
| POST   | `/api/v1/assessment/instruments/{instrumentId}/versions`   | create | **ya** | Buat versi: blank, atau clone dari `sourceVersionId`                           |
| POST   | `/api/v1/assessment/instruments/{instrumentId}/items`      | create | –      | Tambah item ke bank (+ mapping dimensi opsional)                               |
| POST   | `/api/v1/assessment/instruments/{instrumentId}/dimensions` | create | –      | Tambah dimensi                                                                 |
| POST   | `/api/v1/assessment/instruments/{instrumentId}/scales`     | create | –      | Tambah scale                                                                   |
| GET    | `/api/v1/assessment/versions/{versionId}`                  | read   | –      | Detail versi: selection, mapping dimensi, scale                                |
| PATCH  | `/api/v1/assessment/versions/{versionId}`                  | update | –      | Edit selection draft: `addItem` / `removeItem` / `reorder` / `setReverseCoded` |
| GET    | `/api/v1/assessment/versions/{versionId}/diff`             | read   | –      | Diff terhadap `source_version_id`                                              |
| POST   | `/api/v1/assessment/versions/{versionId}/review`           | update | –      | `draft → review`                                                               |
| POST   | `/api/v1/assessment/versions/{versionId}/publish`          | update | **ya** | `review → published` (isi snapshot lalu flip, satu transaksi)                  |
| POST   | `/api/v1/assessment/versions/{versionId}/retire`           | update | **ya** | `published → retired`                                                          |
| PATCH  | `/api/v1/assessment/items/{itemId}`                        | update | –      | Reword item bank **in place**                                                  |
| PUT    | `/api/v1/assessment/items/{itemId}/dimensions`             | update | –      | Ganti seluruh set dimensi satu item (delete-then-insert, satu transaksi)       |
| PATCH  | `/api/v1/assessment/dimensions/{dimensionId}`              | update | –      | Ubah dimensi                                                                   |
| PATCH  | `/api/v1/assessment/scales/{scaleId}`                      | update | –      | Ubah scale                                                                     |

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

| Domain error              | Status | `error.code`                            |
| ------------------------- | ------ | --------------------------------------- |
| `NotFoundError`           | 404    | `NOT_FOUND`                             |
| `VersionFrozenError`      | 409    | `ASSESSMENT_VERSION_IMMUTABLE`          |
| `IllegalTransitionError`  | 409    | `ASSESSMENT_VERSION_TRANSITION_ILLEGAL` |
| `CrossInstrumentError`    | 422    | `ASSESSMENT_CROSS_INSTRUMENT`           |
| Validasi `zod/mini` gagal | 422    | `VALIDATION_FAILED` (+ `fields`)        |

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
  "id": "…",
  "instrumentId": "…",
  "versionNo": 2,
  "status": "draft",
  "publishedAt": null,
  "retiredAt": null,
  "sourceVersionId": "…",
  "createdAt": "2026-08-25T…",
  "frozen": false,
  "items": [
    {
      "versionItemId": "…",
      "itemId": "…",
      "code": "kd01",
      "position": 0,
      "reverseCoded": false,
      "stem": "…", // snapshot bila frozen, bank live bila tidak
      "scalePoints": [{ "value": 1, "label": "…" }], // idem
      "scaleCode": "likert5",
      "dimensions": [{ "id": "…", "code": "directive", "kind": "style" }],
    },
  ],
}
```

```jsonc
// GET /api/v1/assessment/versions/{versionId}/diff
{
  "versionId": "…",
  "sourceVersionId": "…",
  "blank": false, // true bila tidak punya source (setiap v1) — semua list kosong
  "added": [{ "itemId": "…", "code": "kd02", "position": 1 }],
  "removed": [{ "itemId": "…", "code": "kd07", "position": 3 }],
  "moved": [{ "itemId": "…", "code": "kd01", "from": 0, "to": 1 }],
  "reverseCodingChanged": [{ "itemId": "…", "code": "kd01", "from": false, "to": true }],
  "stemChanged": [{ "itemId": "…", "code": "kd01", "before": "…", "after": "…" }],
  "totalChanges": 5, // yang disebut review screen sebelum publish diaktifkan (#50)
}
```

`stemChanged` **wajib** ada, bukan pelengkap: [#49](https://github.com/afif-hh/fia-leadership/issues/49)
mengizinkan item bank di-reword **in place** justru dengan syarat drift-nya terlihat untuk dinilai
Academic Lead. `before` adalah wording yang dibekukan source; `after` adalah wording bank sekarang.
Tag diff di sebuah kolom tidak pernah menunjukkan teks lama, karena itu keduanya dikirim.

## Scoring Configuration (ADR-010)

Menggantikan satu baris `POST /api/v1/admin/scoring-rules` di katalog di atas. Baris itu
menggabungkan "draft" dan "approve" menjadi satu endpoint, padahal
[rbac.md](../security/rbac.md)'s baris **Scoring Rules** memberi keduanya kepada **peran yang
berbeda** — Lab Admin `Draft`, Academic Lead `Approve` — dan pemisahan itulah yang menjadi dasar
`/CLAUDE.md` aturan 1.

Semua endpoint di bawah memetakan ke satu baris matriks: **Scoring Rules**.

| Method | Endpoint                                           | Action  | Audit  | Purpose                                     |
| ------ | -------------------------------------------------- | ------- | ------ | ------------------------------------------- |
| GET    | `/api/v1/assessment/versions/{versionId}/scoring`  | read    | –      | Daftar scoring version + bobotnya           |
| POST   | `/api/v1/assessment/versions/{versionId}/scoring`  | draft   | **ya** | Draft formula baru (Lab Admin)              |
| POST   | `/api/v1/assessment/scoring-versions/{id}/approve` | approve | **ya** | `draft → approved`, membekukan (Acad. Lead) |
| POST   | `/api/v1/assessment/scoring-versions/{id}/retire`  | approve | **ya** | `approved → retired` (Acad. Lead)           |

**Catatan tentang `read` pada baris ini.** Baris Scoring Rules di rbac.md tidak memberi token `R`
kepada siapa pun. Dibaca sebagai lookup murni, itu menggambarkan Academic Lead menyetujui formula
yang tidak boleh ia lihat. `interpret()` di `server/domain/identity/policy.ts` karena itu
memperlakukan `Draft` dan `Approve` sebagai mencakup `read` atas resource yang sama — sebuah
interpretasi, bukan perubahan matriks. Varian berkurung `Approve (op.)` / `Approve (acad.)` pada
baris Research Export **tidak** ikut, karena baris itu mengatur data `Restricted` yang sel
pembacanya scoped.

`retire` memakai action `approve`, bukan action keempat: menarik sebuah formula dari peredaran
adalah penilaian akademik yang sama dengan memasukkannya, dan baris itu tidak punya token yang
memberikannya kepada siapa pun selain Academic Lead.

## Profile (ADR-010)

Memetakan ke baris **Own Profile**, action `read`. Kepemilikan baris difilter di query dengan
`principal.userId`, bukan lewat scope predicate — sel student adalah `CRUD` yang resolve ke allow
tanpa syarat sehingga tidak pernah mencapai `resolveScope`, pola yang sama dengan taking flow.

| Method | Endpoint              | Purpose                                                |
| ------ | --------------------- | ------------------------------------------------------ |
| GET    | `/api/v1/profiles/me` | Profil saat ini: snapshot terbaru, dilayani apa adanya |

`GET /api/v1/profiles/me/history` ada di katalog awal di atas tetapi **belum dibangun**. Riwayat
longitudinal adalah permukaan effort Leadership Profile, dan endpoint tanpa pembaca hanya menambah
kontrak yang harus dijaga tanpa ada yang memakainya.

`GET /profiles/me` mengembalikan `profile: null` — **bukan** 404 — bila belum ada yang dinilai:
tidak punya profil adalah keadaan biasa setiap mahasiswa sebelum asesmen pertamanya, bukan resource
yang hilang. Bersamanya ada `awaitingScore: boolean`, yang membedakan mahasiswa yang belum
mengambil apa pun dari mahasiswa yang sudah selesai tetapi instrumennya belum punya formula
tersetujui.

Report dilayani dari snapshot dan **tidak pernah** dihitung ulang. Itulah SC-08: menerbitkan
formula baru besok tidak mengubah satu angka pun pada report yang sudah dilihat hari ini.

### Status tambahan domain scoring

| Domain error                    | Status | `error.code`                      |
| ------------------------------- | ------ | --------------------------------- |
| `ScoringVersionFrozenError`     | 409    | `SCORING_VERSION_IMMUTABLE`       |
| `NoApprovedScoringVersionError` | 409    | `SCORING_VERSION_NOT_APPROVED`    |
| `SessionNotScorableError`       | 409    | `ASSESSMENT_SESSION_NOT_SCORABLE` |
| `ScoringConfigInputError`       | 422    | `SCORING_CONFIG_INVALID`          |

`SCORING_VERSION_NOT_APPROVED` sengaja 409 dan bukan 404 atau 422: sesi ada dan request-nya
benar, yang menolaknya adalah keadaan di tempat lain yang bisa diubah Academic Lead. Klien yang
membacanya tahu mencoba lagi nanti mungkin berhasil — persis yang dibutuhkan halaman profil untuk
berkata "belum siap" alih-alih "ada yang salah".
