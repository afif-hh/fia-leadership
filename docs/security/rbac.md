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

| Resource                 | Student     | Lecturer/Coach | Lab Admin     | Academic Lead   | Researcher | Faculty Executive | External Partner |
| ------------------------ | ----------- | -------------- | ------------- | --------------- | ---------- | ----------------- | ---------------- |
| Own Profile              | CRUD        | R              | R             | R               | –          | –                 | –                |
| Own Assessment           | CRUD        | R*             | R             | R               | –          | –                 | –                |
| Assigned Student Detail  | –           | R              | R             | R               | –          | –                 | R*               |
| Assessment Configuration | –           | –              | CRUD          | CRUD            | –          | –                 | –                |
| Scoring Rules            | –           | –              | Draft         | Approve         | –          | –                 | –                |
| Aggregate Dashboard      | Own cohort  | R              | R             | R               | R*         | R                 | R*               |
| Research Export          | –           | –              | Approve (op.) | Approve (acad.) | R*         | –                 | –                |
| Audit Log                | Own actions | –              | R             | R               | –          | –                 | –                |
| User Administration      | –           | –              | CRUD          | R               | –          | –                 | –                |

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

**Scoring Rules** = mengelola formula, bobot, dan threshold penilaian. Dua peran, dua action
berbeda pada satu baris: Lab Admin `Draft`, Academic Lead `Approve`. Pemisahan itu adalah dasar
`/CLAUDE.md` aturan 1 dan bukan sekadar konvensi — approve adalah saat sebuah threshold mulai
menentukan apa yang dikatakan sistem tentang seorang mahasiswa.

Baris ini tidak memberi token `R` kepada siapa pun. Dibaca sebagai lookup murni, itu berarti
Academic Lead menyetujui sesuatu yang tidak boleh ia lihat. `interpret()` karena itu memperlakukan
`Draft` dan `Approve` sebagai **mencakup `read`** atas resource yang sama. Ini interpretasi atas
dokumen, bukan perubahan matriks, dan diuji eksplisit di `policy.test.ts`. Varian berkurung
`Approve (op.)` / `Approve (acad.)` pada baris Research Export **tidak** ikut: baris itu mengatur
data `Restricted` yang sel pembacanya scoped, dan yang disetujui di sana adalah sebuah
_permintaan_, bukan isi export-nya.

**Wajib diimplementasikan sebagai policy rule server-side** (policy layer di
`server/domain/identity/policy.ts`), **bukan** hanya UI hiding. Implementasinya hand-rolled, bukan
CASL atau oso — alasannya di
[ADR-006](../architecture/adr/ADR-006-hand-rolled-policy-layer.md). UI bukan security boundary.
Setiap endpoint di [architecture/api-design.md](../architecture/api-design.md) harus
memetakan ke satu baris tabel ini.

## Klasifikasi Data & Akses Default

| Data Class   | Contoh                                              | Akses Default          |
| ------------ | --------------------------------------------------- | ---------------------- |
| Public       | News, event, publikasi riset publik                 | Public                 |
| Internal     | Konfigurasi program, draft konten modul             | Staff                  |
| Confidential | Student profile, assessment score                   | Owner + assigned staff |
| Restricted   | Raw responses, detail 360 feedback, research export | Strictly authorized    |

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
- Buat versi instrumen — `assessment.version_created`
- Publikasikan versi instrumen — `assessment.version_published`
- Retire versi instrumen — `assessment.version_retired`
- Draft scoring version — `assessment.scoring_version_created`
- Setujui scoring version — `assessment.scoring_version_approved`
- Retire scoring version — `assessment.scoring_version_retired`
- Hitung ulang skor sebuah sesi — `profile.session_rescored`

Tiga event assessment di atas ditulis di dalam transaksi yang sama dengan
perubahannya (`server/domain/assessment/audit-events.ts`). Publish dan retire
tidak dapat dibatalkan (FR-005), jadi keduanya berada di daftar ini karena
sifatnya permanen — bukan karena termasuk "Ubah scoring config", yang tetap
baris `Scoring Rules` yang terpisah.

Tiga event scoring memenuhi baris "Ubah scoring config" di daftar wajib. Ketiganya ditulis di
dalam transaksi perubahannya sendiri, sama seperti tiga event versi di atasnya.

Penilaian **awal** sebuah sesi sengaja tidak diaudit: baris `profile_score_runs` sudah merupakan
catatan append-only yang bertanda waktu dan bercap versi untuk kejadian itu, dan salinan kedua di
`audit_logs` berarti satu baris per mahasiswa per asesmen tanpa apa pun untuk diinvestigasi —
alasan yang sama yang dipakai #65 untuk autosave. **Rescore** diaudit, karena di situ seseorang
memutuskan hasil yang sudah dilihat mahasiswa harus dihitung ulang.

Detail event hanya berisi id dan hitungan — tidak ada `stem` item, `answer_value`, nilai skor,
maupun band, sesuai [PII Rule](../../CLAUDE.md#pii-rule).

Endpoint baru wajib menentukan audit classification di definition of done —
prosedur: `skills/secure-api-endpoint/SKILL.md`.

`audit_logs` tidak boleh di-UPDATE atau di-DELETE. Konten audit diminimalkan
(user id boleh, payload tidak) — lihat [PII Rule](../../CLAUDE.md#pii-rule).
