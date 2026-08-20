# docs/ — cara memakai & memelihara

> File ini untuk **manusia**. Sengaja tidak terdaftar di Reference Map, jadi agent
> tidak pernah memuatnya.

## Tiga tier

| Tier | Isi | Kapan dimuat |
|---|---|---|
| 0 | `/CLAUDE.md` + `docs/product/PRD.md` | Selalu |
| 1 | Sisa `docs/` | Hanya bila Reference Map di hub PRD menyuruhnya |
| 2 | `docs/product/governance/` | Diskusi perencanaan; agent tidak perlu |

Mekanisme pengendali konteks ada di **Reference Map** (`docs/product/PRD.md` §4).
File yang tidak terdaftar di sana tidak akan pernah dibaca agent.

## Aturan pemeliharaan

1. Setiap file baru wajib punya front-matter (`id`, `audience`, `load_when`) **dan**
   didaftarkan di Reference Map.
2. Jangan menduplikasi isi antar file. Satu file memilikinya, yang lain menaut.
3. File melewati ~150 baris → pertimbangkan pecah lagi.
4. Aturan yang berlaku di *setiap* task naik ke `/CLAUDE.md`.
   Aturan yang berlaku di *sebagian* task tetap di file domainnya.
5. Referensi lintas dokumen memakai **ID stabil** (`FR-005`, `NFR-11`, `SC-03`,
   `PII-RULE`) atau relative link — **bukan** nomor bab. Nomor bab pecah saat file dipindah.
6. Sumber kebenaran struktur folder, daftar tabel DB, dan daftar endpoint adalah
   **kode**, bukan dokumen. Dokumen hanya memuat aturan dan field berkontrol khusus.

## Perlu dikonfirmasi (keputusan yang tidak ada di dokumen sumber)

Tujuh hal berikut ditambahkan saat restrukturisasi karena PRD asli diam soal ini, dan
diamnya akan membuat implementasi mengarang sendiri. **Review lalu hapus daftar ini.**

| # | Tambahan | Lokasi |
|---|---|---|
| 1 | Envelope error API + konvensi status code | `architecture/api-design.md` |
| 2 | Angka rate limit baseline | `engineering/devsecops.md` |
| 3 | Daftar environment variable & mana yang secret | `engineering/devsecops.md` |
| 4 | Seed & fixture policy (dasar golden test scoring) | `data/data-dictionary.md` |
| 5 | Endpoint verifikasi sertifikat publik dibatasi — tanpa skor/data pribadi | `features/academy.md` |
| 6 | Aggregate 360 dihitung setelah campaign ditutup, bukan real-time | `features/feedback360.md` |
| 7 | Notifikasi tidak memuat skor; hanya pemicu + tautan | `features/platform.md` |

Arsip PRD monolitik v1.0: `docs/product/archive/`.
