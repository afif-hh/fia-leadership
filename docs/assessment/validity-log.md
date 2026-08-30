---
id: validity-log
title: Instrument Validity Log
audience: human
load_when: 'mencatat atau memeriksa status validasi psikometrik sebuah versi instrumen'
owner: Academic Lead
---

# Validity Log

Satu baris per `assessment_version`. Diisi oleh Academic Lead, bukan oleh agent.
Instrumen **tidak boleh** dipakai untuk keputusan formal atau riset sampai kolom
"Status" bernilai `approved`.

| Assessment Version | Expert Review | Pilot/Cognitive | Item Analysis | Internal Consistency | EFA/CFA | Invariance | Criterion Evidence | Status  | Tanggal | Catatan                                                                                                                                                                                                             |
| ------------------ | ------------- | --------------- | ------------- | -------------------- | ------- | ---------- | ------------------ | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KDPGK v1 (draft)   | –             | –               | –             | –                    | –       | –          | –                  | `draft` | –       | Item bank **sintetis** ada di `server/db/seed/kdpgk/bank.ts` — 40 item, 10 gaya, 8 domain, 2 sumbu. Dibuat agar engine, ledger, dan report dapat diuji end to end; belum melalui satu pun langkah validasi di bawah |

Legenda status: `draft` · `in-validation` · `approved` · `retired`

## Catatan

Formula scoring v1 sudah disetujui lewat
[ADR-010](../architecture/adr/ADR-010-scoring-v1-formulas-and-thresholds.md) pada 2026-08-30.
Itu **tidak** mengubah baris di tabel atas. Menyetujui cara menghitung bukan hal yang sama dengan
membuktikan bahwa yang dihitung mengukur sesuatu, dan KDPGK v1 tetap `draft` sampai program
validasi di [kdpgk-v1.md](./kdpgk-v1.md) dijalankan atas item bank yang nyata.

## Aturan

- Perubahan status wajib disertai ADR assessment.
- Threshold readiness tidak boleh dipresentasikan sebagai norma populasi selama status
  belum `approved` dan data normatif belum memadai.
- Bukti validasi (laporan, dataset analisis) disimpan terpisah dengan governance riset —
  lihat [features/research.md](../features/research.md).
- Item bank sintetis **bukan** draft instrumen nyata dan tidak boleh diperlakukan sebagai bahan
  validasi. Mengganti dengan bank nyata tidak butuh perubahan kode: cukup assessment version baru
  berisi item nyata, plus scoring version baru yang disetujui terhadap version itu (FR-005).
- Halaman profil menampilkan pernyataan bahwa instrumen belum tervalidasi di atas seluruh angka,
  dan `app/tests/a11y/profile.spec.ts` gagal bila pernyataan itu hilang atau turun ke bawah.
