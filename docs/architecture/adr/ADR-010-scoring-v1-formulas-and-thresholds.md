---
id: adr-010
title: 'ADR-010: Scoring v1 — formula, threshold, dan titik pembulatan'
audience: both
load_when: 'mengubah formula, threshold, urutan pipeline, tie rule, atau representasi numerik skor'
approval: Academic Lead (BELUM diberikan)
---

```
ADR-010: Scoring v1 — formula, threshold, dan titik pembulatan
Status: Proposed        # menunggu approval Academic Lead; jangan merge tanpa itu
Date: 2026-08-30
Type: assessment
```

## Context

`docs/assessment/scoring-spec.md` menetapkan urutan pipeline dan kontrak fungsi, tetapi tidak
pernah menuliskan formula konkret, threshold band, aturan tie, maupun titik pembulatan. Tanpa
angka-angka itu scoring engine tidak dapat dibangun, dan `/CLAUDE.md` aturan 1 melarang seorang
agent menetapkannya sendiri.

Dua keputusan sudah pernah dicapai dan dicatat di luar dokumen ini:

- [#26](https://github.com/afif-hh/fia-leadership/issues/26) memutuskan representasi numerik
  (IEEE-754 penuh, satu titik pembulatan) dan menutup ticket-nya sebagai out of scope, dengan
  catatan eksplisit bahwa keputusan itu perlu sign-off Academic Lead dan sebuah bagian tertulis di
  `scoring-spec.md`. ADR ini adalah tempat sign-off itu.
- [#70](https://github.com/afif-hh/fia-leadership/issues/70) menyerahkan mekanisme pemicu scoring
  kepada effort ini.

ADR ini menuliskan seluruh angka yang dipakai scoring engine v1 dalam satu tempat, supaya
perubahannya berbiaya satu approval dan bukan satu commit.

## Decision

### 1. Urutan pipeline

Persis urutan `scoring-spec.md`, tanpa perubahan. Urutan adalah formula, bukan gaya penulisan:
normalisasi sebelum weighting menghasilkan angka berbeda dari weighting sebelum normalisasi.

```
kelengkapan → reverse coding → raw subscale → normalisasi → weighting → style score
→ dominant/secondary → grid → band → developmental flag → ledger → report
```

### 2. Reverse coding

`efektif = scaleMin + scaleMax − jawaban`.

Refleksi di dalam anchor milik item itu sendiri, sehingga tidak butuh konfigurasi terpisah: item
lima titik membalik 1↔5 dan item tujuh titik membalik 1↔7. Konsekuensinya, vektor "semua jawaban
minimum" pada SC-01 **bukan** vektor semua-1 bila instrumen punya item reverse-coded.

### 3. Raw subscale dan normalisasi

Per dimensi, atas item-item yang memetakan ke dimensi itu:

```
raw   = Σ efektif
min   = Σ scaleMin
max   = Σ scaleMax
norm  = (raw − min) / (max − min) × 100
```

Normalisasi terhadap rentang yang bisa dihasilkan **item dimensi itu sendiri**, bukan terhadap
rentang instrumen, sehingga dimensi dengan jumlah item berbeda tetap sebanding.

Dimensi yang rentangnya nol (`max = min`) bernilai 0, bukan error runtime. Kondisi ini hanya
terjangkau dari kesalahan authoring.

### 4. Weighting dan overall potential

```
overall = Σ(weight_d × norm_d) / Σ(weight_d)   untuk d berjenis `domain`
```

Hanya dimensi `domain` yang masuk ke overall. Style menggambarkan **bagaimana** seseorang
memimpin, bukan seberapa siap ia memimpin; merata-ratakan keduanya membuat sebuah preferensi
terbaca sebagai defisit.

**Bobot v1 seragam, semuanya 1.** Ini posisi yang dipilih, bukan default yang tidak diisi. Bobot
tidak seragam adalah klaim bahwa satu domain menyumbang lebih besar pada kesiapan kepemimpinan
administratif daripada domain lain, dan tidak ada bukti yang mendukung klaim itu sebelum program
validasi di `kdpgk-v1.md` dijalankan.

### 5. Titik pembulatan — satu, dan hanya satu

Seluruh nilai antara adalah IEEE-754 double presisi penuh. Pembulatan terjadi **sekali**, dengan
`Math.round`, pada saat sebuah angka menjadi sesuatu yang dibaca manusia. Band dan koordinat grid
diturunkan dari **integer hasil pembulatan itu**, bukan dari nilai mentahnya.

```ts
const shown = Math.round(scoreValue) // 69.6 → 70
const band = bandFor(shown) // interval setengah terbuka atas integer
```

Alternatif yang ditolak: membandingkan band pada dua desimal sementara menampilkan integer. Itu
akan menampilkan angka "70" di samping band yang dihitung dari 69,60 — terbaca sebagai bug, dan
memang bug.

`Math.round` membulatkan setengah ke arah positif, jadi 69,5 → 70. Skor terbatas 0–100 sehingga
kasus tepi negative-zero tidak muncul.

Ledger menyimpan nilai **tanpa pembulatan**; snapshot menyimpan bentuk terbulatkan yang dibaca
mahasiswa. **Aturan pembulatan adalah bagian dari `scoring_version`**: mengubahnya mengubah
penetapan band untuk jawaban yang sama.

### 6. Readiness band

Interval setengah terbuka atas skor overall yang sudah dibulatkan. Band terakhir mencakup 100.

| Band          | Rentang |
| ------------- | ------- |
| `emerging`    | 0–39    |
| `developing`  | 40–59   |
| `established` | 60–79   |
| `advanced`    | 80–100  |

Empat band dengan lebar 40/20/20/21 pada indeks komunikasi, bukan norma populasi. Selama status di
`validity-log.md` belum `approved`, band **tidak boleh** dipresentasikan sebagai norma — halaman
profil menyatakan itu di atas angkanya.

Band disimpan sebagai konfigurasi pada baris `assessment_scoring_versions`, bukan sebagai konstanta
di kode, sehingga mengubah threshold secara struktural berarti baris baru dan bukan satu deploy.

### 7. Dominant, secondary, dan tie

Style diurutkan menurun berdasarkan skor normalisasi, lalu menaik berdasarkan `code`. Dominant
adalah yang pertama, secondary yang kedua.

`hybrid` bernilai true bila dua skor teratas **sama persis pada presisi penuh**. Perbandingan
memakai nilai belum dibulatkan dengan sengaja: 69,4 dan 69,6 dibulatkan sama tetapi instrumen
memang memisahkan keduanya, dan menyebutnya hibrida akan menghapus pemisahan yang nyata.

Tiebreak berdasarkan `code` bukan kosmetik. Stabilitas `Array.prototype.sort` hanya menunda
pertanyaan ke urutan input, sedangkan hasil harus identik di setiap mesin dan setiap run (SC-04).

### 8. Blake-Mouton

```
coord = clamp(1 + round(shown(norm) / 100 × 8), 1, 9)
```

Diturunkan dari skor yang sudah dibulatkan, mengikuti aturan satu titik pembulatan: sumbu yang
dilihat mahasiswa sebagai 62 selalu terplot pada koordinat yang sama.

Kuadran:

| Kondisi                     | Kuadran             |
| --------------------------- | ------------------- |
| tugas ≥ 6 dan orang ≥ 6     | `team`              |
| tugas ≥ 6 dan orang ≤ 4     | `produce_or_perish` |
| tugas ≤ 4 dan orang ≥ 6     | `country_club`      |
| tugas ≤ 4 dan orang ≤ 4     | `impoverished`      |
| selain itu (salah satu = 5) | `middle_of_road`    |

Nilai 5 pada sumbu sembilan titik adalah pernyataan instrumen bahwa ia **tidak memisahkan** orang
ini pada sumbu tersebut. Membulatkannya menjadi "tinggi" atau "rendah" berarti memberi label pada
non-hasil.

Grid hanya dihasilkan bila scoring version menyebut kedua sumbu. Instrumen tanpa grid adalah
instrumen yang sah, dan mengarang sumbu untuknya akan meletakkan koordinat pada report yang tidak
mengukur apa pun.

### 9. Developmental flag

Kekuatan adalah tiga domain teratas. Prioritas pengembangan adalah tiga domain terbawah **dari
sisa setelah kekuatan diambil**, sehingga satu domain tidak pernah muncul sebagai kekuatan dan
prioritas sekaligus. Pada instrumen nyata kedua ujung tidak pernah bertemu; pada instrumen pendek
bisa, dan report yang menyebut satu domain sebagai keduanya bukan report yang bisa ditindaklanjuti.

### 10. Mekanisme pemicu scoring (menjawab #70)

Scoring dijalankan **inline** setelah submit ter-commit, dalam request yang sama. Tidak ada queue,
outbox, atau job runner di deployment ini, dan mengarang salah satunya berarti membangun
infrastruktur untuk latensi yang belum pernah diukur.

Dua hal membuatnya aman: submit sudah ter-commit lebih dulu sehingga scoring tidak dapat
membatalkannya, dan `POST /api/v1/assessment/sessions/{id}/score` menilai sesi yang sama secara
idempoten sehingga request yang mati di antara keduanya meninggalkan pekerjaan yang **konvergen**
pada panggilan berikutnya, bukan sesi yang macet selamanya.

Idempotensi dipegang partial unique index `profile_score_runs_session_id_initial_key`, bukan
cache `Idempotency-Key`: index bertahan terhadap dua isolate yang berlomba dan tidak punya masa
kedaluwarsa.

### 11. Representasi numerik dan penyimpanan (mengesahkan #26)

`profile_scores.score_value` adalah SQLite `REAL`, yaitu IEEE-754 double 8 byte — representasi yang
sama persis dengan `number` di JavaScript, sehingga round-trip penyimpanan tidak kehilangan presisi
dan invariant "input sama → output identik" tetap berlaku.

Ditolak: scaled integer dan decimal string. Keduanya menyelesaikan masalah yang ternyata tidak ada
— premis awal #26 (bahwa float mengancam reproduktibilitas lintas mesin) keliru, karena spesifikasi
bahasa mewajibkan operasi yang sama dalam urutan yang sama menghasilkan hasil bit-identik.

Pertanyaan terbuka yang diwariskan #26 — apakah protokol wire Hrana milik libSQL melakukan
round-trip double IEEE-754 secara eksak — **sudah diverifikasi** terhadap sumber
`@libsql/hrana-client@0.10.0`, bukan diasumsikan:

- Jalur JSON menulis sebuah float dengan `"" + value` (`encoding/json/encode.js`), yaitu
  `Number::toString` ECMAScript. Spesifikasi bahasa mewajibkan bentuk itu adalah representasi
  desimal terpendek yang membaca kembali ke double yang sama persis, dan pembacaannya memakai
  `JSON.parse` yang menghasilkan `number` (`encoding/json/decode.js`).
- Jalur protobuf menulis `w.double(3, msg)` (`shared/protobuf_encode.js`), yaitu field
  IEEE-754 8 byte apa adanya.

Keduanya eksak, jadi pilihan `REAL` tidak punya lubang tersisa di sisi transport.
`server/tests/integration/scoring-run.test.ts` menguji round-trip presisi penuh lewat client
sungguhan, sehingga klaim ini punya test dan bukan hanya catatan.

## Consequences

- Setiap angka di atas kini punya satu tempat. Mengubahnya butuh ADR baru dan approval Academic
  Lead, bukan sebuah commit — yang memang tujuan `/CLAUDE.md` aturan 1.
- Threshold sebagai konfigurasi baris berarti perubahan band tidak butuh deploy, tetapi tetap butuh
  approval: baris `assessment_scoring_versions` hanya bisa dibuat sebagai draft oleh Lab Admin dan
  hanya bisa disetujui oleh Academic Lead.
- Skor lama tidak pernah dihitung ulang otomatis. Formula baru berarti `scoring_version` baru;
  report historis dilayani dari `profile_snapshots` dan tidak berubah (SC-08).
- Bobot seragam berarti overall potential v1 secara efektif adalah rata-rata sederhana delapan
  domain. Itu jujur untuk instrumen yang belum tervalidasi dan hampir pasti perlu ditinjau setelah
  analisis item.
- Item bank KDPGK v1 sintetis. Angka apa pun yang dihasilkan sistem hari ini menggambarkan
  instrumen sintetis, bukan kepemimpinan seseorang, dan `validity-log.md` melarang pemakaiannya
  untuk keputusan formal.

## Rollback

Per keputusan dan murah selama belum ada skor otoritatif yang dipakai:

- Formula atau threshold salah → draft `scoring_version` baru, setujui, retire yang lama, lalu
  rescore sesi terdampak. Setiap rescore menghasilkan `score_run` baru dengan alasan tercatat, dan
  run lama tetap terbaca. Tidak ada yang di-overwrite, jadi tidak ada yang perlu dipulihkan.
- Seluruh engine perlu ditarik → migration 0012 dan 0013 dibatalkan dengan menghapus tiga tabel
  `profile_*`, dua tabel `assessment_scoring_*`, dan dua belas trigger yang disebut di header 0013. Tidak ada tabel existing yang diubah bentuknya, sehingga rollback tidak menyentuh data
  assessment mana pun.
- Prosedur lengkap untuk perubahan apa pun di dokumen ini:
  `skills/assessment-scoring-change/SKILL.md`.
