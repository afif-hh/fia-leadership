---
id: data-dictionary
title: Data Dictionary & Aturan Data Kritis
audience: agent
load_when: 'menulis migration, mengubah schema, atau menyentuh field yang punya kontrol khusus'
covers: [FR-005, NFR-11]
---

# Data Dictionary

> Daftar tabel per domain **tidak** diduplikasi di sini. Sumber kebenaran adalah
> `server/db/schema/<domain>.ts`. Halaman ini hanya memuat field yang punya **kontrol khusus**
> — yaitu field yang salah penanganannya menyebabkan kerusakan yang tidak bisa dibatalkan.

~~Satu Postgres schema per domain, dideklarasikan dengan `pgSchema('<domain>')`.~~ **Tidak lagi berlaku** — database adalah Turso/libSQL (SQLite), jadi tidak ada `pgSchema()`. Boundary per-domain dinyatakan lewat prefix nama tabel (`identity_*`) plus ESLint `no-restricted-imports`, dan **hanya berlaku sebelum runtime**.
Domain: `identity` · `assessment` · `profile` · `learning` · `simulation` · `development` ·
`feedback360` · `research` · `platform`.

## Field dengan Kontrol Khusus

| Field                                | Type         | Makna                                     | Kontrol                                                                                                       |
| ------------------------------------ | ------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `assessment_versions.id`             | uuid         | Primary key                               | Immutable setelah publish                                                                                     |
| `assessment_versions.version_no`     | integer      | Nomor versi                               | Unique per assessment type                                                                                    |
| `assessment_versions.status`         | enum         | `draft \| review \| published \| retired` | Published = **immutable** (FR-005)                                                                            |
| `sessions.status`                    | enum         | `in_progress \| submitted \| scored`      | State machine, transisi terkontrol                                                                            |
| `responses.answer_value`             | numeric/text | Jawaban peserta                           | **TIDAK PERNAH** masuk application log/trace/metric                                                           |
| `scores.score_value`                 | numeric      | Nilai terhitung                           | Wajib terhubung ke `scoring_rule_id`                                                                          |
| `scores.score_type`                  | enum         | `raw \| normalized \| style \| readiness` | Semantik eksplisit, tidak di-overload                                                                         |
| `leadership_profiles.dominant_style` | code         | Gaya dominan                              | **Derived** — tidak boleh diedit manual                                                                       |
| `profile_snapshots.payload`          | jsonb        | Snapshot report                           | Signed dengan version metadata                                                                                |
| `consents.policy_version`            | string       | Versi notice                              | Wajib ada sebelum assessment bila berlaku                                                                     |
| `consents.policy_hash`               | string       | Hash teks kebijakan yang dirender         | Membuktikan _isi_ yang disetujui, bukan hanya nomor versi — mendeteksi kebijakan yang diubah tanpa naik versi |
| `audit_logs.event_type`              | string       | Jenis kejadian                            | Append-only — tidak boleh UPDATE/DELETE                                                                       |
| `ai_runs.model`                      | string       | Model runtime AI                          | Tidak menyimpan secret                                                                                        |
| `ai_runs.prompt_version`             | string       | Versi prompt                              | Untuk auditability                                                                                            |

## Di Mana Kontrol Berada (engine vs aplikasi)

Turso adalah SQLite: tidak ada enum bawaan engine, tidak ada `jsonb`. Beberapa kontrol yang di
tabel di atas terlihat seperti jaminan engine sekarang dipegang aplikasi. Jangan berasumsi engine
masih menahannya.

| Kontrol                                          | Dipegang oleh            | Mekanisme                                                                                                        |
| ------------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Nilai enum tertutup (`role`, `status`, `method`) | **Engine**               | `CHECK` membership — vocabulary tertutup, perubahannya keputusan governance                                      |
| `audit_logs.event_type`                          | **Engine (format saja)** | `CHECK` format `<domain>.<action>`; vocabulary-nya ditutup di aplikasi, bukan di engine — lihat catatan di bawah |
| Vocabulary `event_type`                          | **Aplikasi**             | `z.discriminatedUnion` per domain di `server/domain/<domain>/audit-events.ts`                                    |
| Bentuk `audit_logs.detail`                       | **Aplikasi**             | `z.strictObject()` — menolak key tak dikenal, tidak menghapusnya diam-diam                                       |
| `audit_logs` append-only                         | **Engine**               | trigger `RAISE(ABORT)` + interface repository tanpa method update/delete                                         |
| Kombinasi role terlarang                         | **Engine + aplikasi**    | trigger (tidak bisa dilewati) + guard service (pesan error yang bermakna)                                        |
| Isolasi antar domain                             | **Sebelum runtime saja** | TypeScript + ESLint. Token fine-grained Turso **bukan** security boundary                                        |

Alasan `event_type` hanya dibatasi formatnya: SQLite tidak punya `ALTER TABLE … ADD CONSTRAINT`,
jadi mengubah `CHECK` berarti rebuild tabel 12 langkah — dan rebuild `audit_logs` ikut menghapus
trigger append-only-nya. Menambah audited action karena itu tidak boleh butuh migration.

## Aturan Wajib

1. Instrumen assessment yang sudah `published` **immutable**. Perubahan apa pun butuh
   versi baru (FR-005).
2. `responses.answer_value` tidak pernah tercatat di structured log/trace
   ([PII Rule](../../CLAUDE.md#pii-rule)).
3. Semua skor traceable ke `assessment_version_id` + `scoring_version_id` + `response_set`
   - `timestamp` (NFR-11).
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
