---
id: scoring-spec
title: Scoring Engine Specification
audience: agent
load_when: "mengubah formula, threshold, normalisasi, tie-handling, atau pipeline scoring"
approval: Academic Lead (wajib ADR assessment)
depends_on: [kdpgk-v1, golden-tests]
covers: [FR-007, FR-008, NFR-11]
---

# Scoring Engine

Scoring engine bersifat **deterministic**. Formula = kode/config terversi, bukan prompt AI.
LLM boleh *menjelaskan* skor, tidak boleh *menghitungnya*.

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
  responses: Response[],
): ScoreRun

// invariant yang harus dijamin unit test:
assert(scoreRun.isReproducible)         // input sama → output identik
assert(scoreRun.hasVersionMetadata)     // assessment_version_id + scoring_version_id tercatat
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
