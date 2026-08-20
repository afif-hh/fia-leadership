---
id: data-dictionary
title: Data Dictionary & Aturan Data Kritis
audience: agent
load_when: "menulis migration, mengubah schema, atau menyentuh field yang punya kontrol khusus"
covers: [FR-005, NFR-11]
---

# Data Dictionary

> Daftar tabel per domain **tidak** diduplikasi di sini. Sumber kebenaran adalah
> `server/db/schema/<domain>.ts`. Halaman ini hanya memuat field yang punya **kontrol khusus**
> — yaitu field yang salah penanganannya menyebabkan kerusakan yang tidak bisa dibatalkan.

Satu Postgres schema per domain, dideklarasikan dengan `pgSchema('<domain>')`.
Domain: `identity` · `assessment` · `profile` · `learning` · `simulation` · `development` ·
`feedback360` · `research` · `platform`.

## Field dengan Kontrol Khusus

| Field | Type | Makna | Kontrol |
|---|---|---|---|
| `assessment_versions.id` | uuid | Primary key | Immutable setelah publish |
| `assessment_versions.version_no` | integer | Nomor versi | Unique per assessment type |
| `assessment_versions.status` | enum | `draft \| review \| published \| retired` | Published = **immutable** (FR-005) |
| `sessions.status` | enum | `in_progress \| submitted \| scored` | State machine, transisi terkontrol |
| `responses.answer_value` | numeric/text | Jawaban peserta | **TIDAK PERNAH** masuk application log/trace/metric |
| `scores.score_value` | numeric | Nilai terhitung | Wajib terhubung ke `scoring_rule_id` |
| `scores.score_type` | enum | `raw \| normalized \| style \| readiness` | Semantik eksplisit, tidak di-overload |
| `leadership_profiles.dominant_style` | code | Gaya dominan | **Derived** — tidak boleh diedit manual |
| `profile_snapshots.payload` | jsonb | Snapshot report | Signed dengan version metadata |
| `consents.policy_version` | string | Versi notice | Wajib ada sebelum assessment bila berlaku |
| `audit_logs.event_type` | string | Jenis kejadian | Append-only — tidak boleh UPDATE/DELETE |
| `ai_runs.model` | string | Model runtime AI | Tidak menyimpan secret |
| `ai_runs.prompt_version` | string | Versi prompt | Untuk auditability |

## Aturan Wajib

1. Instrumen assessment yang sudah `published` **immutable**. Perubahan apa pun butuh
   versi baru (FR-005).
2. `responses.answer_value` tidak pernah tercatat di structured log/trace
   ([PII Rule](../../CLAUDE.md#pii-rule)).
3. Semua skor traceable ke `assessment_version_id` + `scoring_version_id` + `response_set`
   + `timestamp` (NFR-11).
4. `audit_logs` append-only.
5. JSONB hanya untuk metadata fleksibel — bukan pengganti struktur inti assessment.
6. Semua perubahan schema lewat `drizzle-kit generate` + `drizzle-kit migrate`.
   Prosedur & rollback: `skills/database-migration/SKILL.md`.

## Seed & Fixture Policy

- `server/db/seed/` dan `tests/fixtures/` **tanpa data pribadi nyata**, tanpa pengecualian.
- Seed assessment memakai item sintetis yang jumlah dan skalanya menyerupai instrumen nyata,
  agar golden test scoring bermakna.
- Fixture scoring wajib mencantumkan `assessment_version` dan `scoring_version`
  (lihat [assessment/golden-tests.md](../assessment/golden-tests.md)).
