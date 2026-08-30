---
id: scoring-spec
title: Scoring Engine Specification
audience: agent
load_when: 'mengubah formula, threshold, normalisasi, tie-handling, atau pipeline scoring'
approval: Academic Lead (wajib ADR assessment)
depends_on: [kdpgk-v1, golden-tests]
covers: [FR-007, FR-008, NFR-11]
---

# Scoring Engine

Scoring engine bersifat **deterministic**. Formula = kode/config terversi, bukan prompt AI.
LLM boleh _menjelaskan_ skor, tidak boleh _menghitungnya_.

> Density test tertinggi di seluruh sistem. Kesalahan formula merusak seluruh report,
> historis maupun baru.

## Pipeline Wajib

```
Validate response completeness
  → Apply reverse coding (jika ada)
  → Compute raw subscale
  → Normalize
  → Apply weighting
  → Derive style scores
  → Determine dominant/secondary (tie-handling terdokumentasi)
  → Convert Task/People ke grid 1–9
  → Assign readiness band (sesuai scoring_version)
  → Generate developmental flags
  → Save score ledger (immutable, append-only per score_run)
  → Generate profile snapshot
```

Urutan ini tidak boleh diubah tanpa ADR — normalisasi sebelum weighting menghasilkan
angka berbeda dari weighting sebelum normalisasi.

## Kontrak Fungsi

`server/services/scoring/index.ts`

```ts
function score(
  assessmentVersion: AssessmentVersion,
  scoringVersion: ScoringVersion,
  responses: Response[]
): ScoreRun

// invariant yang harus dijamin unit test:
assert(scoreRun.isReproducible) // input sama → output identik
assert(scoreRun.hasVersionMetadata) // assessment_version_id + scoring_version_id tercatat
assert(scoreRun.noLLMUsedForNumericScore)
```

## Versioning & Reproducibility

- Hasil lama **tidak** dihitung ulang otomatis saat formula baru diterbitkan.
- Re-scoring menghasilkan `score_run` **baru** + alasan tercatat — tidak pernah overwrite silent.
- Setiap report mencantumkan `assessment_version` dan `scoring_version`.
- Formula kritis wajib punya **golden test vectors** — lihat [golden-tests.md](./golden-tests.md).
- Perubahan threshold butuh **Academic Lead approval** + ADR assessment.
  Prosedur: `skills/assessment-scoring-change/SKILL.md`.
- Traceability (NFR-11): setiap skor traceable ke `assessment_version_id` +
  `scoring_version_id` + `response_set` + `timestamp`.

## Representasi Numerik & Pembulatan

Ditetapkan [ADR-010](../architecture/adr/ADR-010-scoring-v1-formulas-and-thresholds.md), yang
juga mengesahkan keputusan yang dicapai di
[#26](https://github.com/afif-hh/fia-leadership/issues/26).

- Seluruh nilai antara adalah IEEE-754 double presisi penuh. Tidak ada pembulatan per langkah.
- Pembulatan terjadi **sekali**, `Math.round`, saat sebuah angka menjadi sesuatu yang dibaca
  manusia. Band dan koordinat grid diturunkan dari integer hasil pembulatan itu.
- `Math.round` membulatkan setengah ke arah positif (69,5 → 70). Skor terbatas 0–100.
- `profile_scores.score_value` adalah SQLite `REAL` dan ditulis **tanpa** dibulatkan.
  `profile_snapshots.payload` menyimpan bentuk terbulatkan yang benar-benar dilihat mahasiswa.
- **Aturan pembulatan adalah bagian dari `scoring_version`.** Mengubahnya mengubah penetapan band
  untuk jawaban yang sama, jadi butuh ADR assessment dan approval Academic Lead.

## Implementasi

| Bagian                          | Lokasi                                         |
| ------------------------------- | ---------------------------------------------- |
| Engine (murni, tanpa DB)        | `server/services/scoring/index.ts`             |
| Konfigurasi formula             | `server/domain/assessment/scoring.ts`          |
| Persistensi & orkestrasi        | `server/domain/profile/scoring-run.ts`         |
| Golden vector                   | `server/tests/fixtures/scoring/`               |
| SC-01 … SC-05, SC-06, SC-08     | `server/tests/unit/scoring-engine.test.ts`     |
| SC-06, SC-07, SC-08 (persisted) | `server/tests/integration/scoring-run.test.ts` |

Engine tidak punya database handle, clock, atau sumber acak. Itulah yang membuat
"input sama → output identik" dapat dijamin dan membuat sebuah golden vector menjalankan jalur
kode yang sama persis dengan sebuah sesi nyata.

## Pemicu Scoring

Dijalankan inline setelah submit ter-commit — [#70](https://github.com/afif-hh/fia-leadership/issues/70)
menyerahkan pilihan mekanisme ke effort ini, dan ADR-010 §10 mencatat alasannya. Tidak ada queue
atau job runner di deployment Workers ini.

Pemulihan bila request mati di antara submit dan scoring:
`POST /api/v1/assessment/sessions/{sessionId}/score` menilai sesi yang sama secara idempoten,
dijaga partial unique index `profile_score_runs_session_id_initial_key`, bukan cache
`Idempotency-Key`.

## Aturan Data

- `responses.answer_value` TIDAK PERNAH masuk application log/trace/metric
  (lihat [PII Rule](../../CLAUDE.md#pii-rule)).
- Score ledger append-only. Tidak ada UPDATE pada `scores` yang sudah authoritative.
- `leadership_profiles.dominant_style` adalah **derived** — tidak boleh diedit manual.

## Incident Scoring

Prosedur khusus bila ditemukan skor salah — lihat
[engineering/observability.md](../engineering/observability.md#incident-scoring).
Ringkas: freeze scoring version terdampak → identifikasi sesi → validasi koreksi dengan
Academic Lead → buat `score_run` baru → regenerate report → notifikasi → audit trail.
