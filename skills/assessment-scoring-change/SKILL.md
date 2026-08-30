---
name: assessment-scoring-change
description: Prosedur wajib untuk setiap perubahan yang menyentuh formula, threshold, normalisasi, tie-handling, urutan pipeline, item mapping, readiness band, atau representasi numerik skor. Dipakai juga saat membangun scoring engine untuk pertama kali.
---

# Assessment Scoring Change

`/CLAUDE.md` aturan 1 melarang mengubah formula atau threshold scoring tanpa ADR assessment
yang disetujui Academic Lead. Dokumen ini adalah prosedurnya. Aturan 11 menambahkan bahwa
scoring engine tidak boleh di-merge tanpa review manusia eksplisit — automated check lulus
saja tidak cukup.

## Kapan prosedur ini berlaku

Berlaku bila perubahanmu menyentuh salah satu dari:

- Formula perhitungan apa pun: raw subscale, normalisasi, weighting, style score, overall.
- Threshold: batas readiness band, cutoff developmental flag, minimum kelengkapan jawaban.
- Urutan pipeline di [scoring-spec.md](../../docs/assessment/scoring-spec.md). Normalisasi
  sebelum weighting menghasilkan angka berbeda dari weighting sebelum normalisasi, jadi
  urutan adalah formula, bukan gaya penulisan.
- Tie-handling untuk dominant/secondary style.
- Representasi numerik dan titik pembulatan. Ini terlihat seperti detail implementasi, tetapi
  membulatkan per langkah dan membulatkan sekali di akhir menghasilkan angka akhir yang
  berbeda — lihat [#26](https://github.com/afif-hh/fia-leadership/issues/26).
- Mapping item ke dimensi pada versi yang dipakai untuk scoring.
- Definisi atau isi `scoring_version` yang sudah pernah dipakai menghasilkan skor.

**Tidak** berlaku untuk: refactor yang terbukti tidak mengubah output (golden test identik),
perbaikan pesan error, perubahan rendering, atau penambahan test.

## Langkah kerja

1. **Baca dulu.** [scoring-spec.md](../../docs/assessment/scoring-spec.md),
   [golden-tests.md](../../docs/assessment/golden-tests.md),
   [kdpgk-v1.md](../../docs/assessment/kdpgk-v1.md), dan
   [validity-log.md](../../docs/assessment/validity-log.md). Reference Map di
   `docs/product/PRD.md` §4 sudah memetakan keempatnya ke task jenis ini.

2. **Tulis ADR bertipe `assessment`.** Pakai
   [ADR-000-template.md](../../docs/architecture/adr/ADR-000-template.md). Status awal
   **Proposed**. ADR wajib memuat, dengan angka konkret:
   - formula lama dan formula baru, berdampingan;
   - setiap threshold yang berubah, beserta alasan akademiknya;
   - dampak pada skor historis (lihat langkah 4);
   - siapa yang menyetujui dan kapan (diisi Academic Lead, bukan oleh agent).

3. **Naikkan `scoring_version`.** Jangan pernah mengubah perilaku sebuah scoring version yang
   sudah pernah menghasilkan skor. Perubahan formula selalu berarti versi baru.

4. **Jangan hitung ulang skor lama secara otomatis.** Re-scoring menghasilkan `score_run`
   baru dengan alasan tercatat, tidak pernah overwrite. Report historis harus tetap
   menampilkan angka yang sama sesudah perubahan ini — itulah yang diuji SC-08.

5. **Perbarui golden vector.** Fixture di `server/tests/fixtures/scoring/` wajib mencantumkan
   `assessment_version` dan `scoring_version` yang dipakai saat vector dibuat. Vector versi
   lama **tetap ada** dan tetap dijalankan; vector baru ditambahkan di sebelahnya.

6. **Jalankan gate.**

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test:run
   ```

   SC-01 … SC-08 dan property test invariant wajib lulus. Bila sebuah golden test lama
   berubah nilainya, itu bukan test yang perlu diperbaiki — itu adalah perubahan formula yang
   belum kamu sadari, atau dampak historis yang belum ditulis di ADR.

7. **Perbarui dokumen.** `scoring-spec.md` bila kontrak atau pipeline berubah,
   `validity-log.md` bila status validasi instrumen ikut bergerak, dan
   `data-dictionary.md` bila ada field baru dengan kontrol khusus.

8. **Buka PR dengan label review manusia.** Ringkasan PR wajib memuat: ADR yang menyertai,
   ringkasan risiko, migration dan rollback plan, serta kalimat eksplisit bahwa merge
   menunggu approval Academic Lead. Jangan merge sendiri.

## Yang tidak boleh dilakukan

- Menghitung skor numerik otoritatif dengan LLM (ADR-001). LLM boleh menjelaskan, tidak
  menghitung.
- Menuliskan `responses.answer_value` ke log, trace, metric, atau pesan error — termasuk
  pesan error validasi ([PII Rule](../../CLAUDE.md#pii-rule)).
- Mempresentasikan threshold sebagai norma populasi selama status di `validity-log.md` belum
  `approved`.
- Melonggarkan test agar formula baru lulus.

## Definition of Done

- ADR assessment ada, statusnya `Proposed`, dan menunggu approval Academic Lead.
- `scoring_version` baru, bukan modifikasi versi lama.
- Golden vector lama dan baru dua-duanya ada dan dua-duanya lulus.
- SC-01 … SC-08 dan property invariant lulus.
- Skor historis terbukti tidak berubah (SC-08).
- Lint, typecheck, dan seluruh test lulus.
- Dokumen terkait diperbarui.
- PR menyertakan risiko, migration, rollback, dan menunggu review manusia.
