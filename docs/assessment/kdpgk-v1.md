---
id: kdpgk-v1
title: Assessment Engine — KDPGK (Assessment V1)
audience: both
load_when: "bekerja pada instrumen, item bank, authoring, atau output report assessment"
covers: [FR-004, FR-005, FR-006, FR-010]
---

# KDPGK — Assessment V1

10 gaya operasional portal:

**Directive/Autocratic · Participative/Democratic · Delegative · Task-Oriented · People-Oriented ·
Transformational · Transactional · Situational/Adaptive · Ethical-Authentic · Innovative/Digital-Change**

> **Catatan implementasi.** Dokumen ini **tidak** menyertakan bank item/pertanyaan aktual.
> Yang didefinisikan adalah skema (`assessment.items`, `assessment.dimensions`,
> `assessment.version_items`, `assessment.scoring_rules`) dan pipeline scoring, agar engine
> siap menerima item bank nyata saat tersedia.
>
> Skor 0–100 adalah **indeks komunikasi hasil**, bukan vonis. Disclaimer ini **wajib tampil
> di setiap output**.

## Output Wajib per Assessment Run

| Output | Komponen Visual/Naratif |
|---|---|
| Overall Potential | Gauge/score + band + explanation |
| Domain Profile | ≥8 domain sesuai instrumen |
| 10 Style Profile | Radar chart + tabel (alternatif teks wajib — WCAG) |
| Dominant/Secondary | Primary pattern + hybrid flag |
| Blake-Mouton | Coordinate 1–9 × 1–9 + interpretasi kuadran |
| Strengths | Top domain + contoh perilaku |
| Development Priorities | Domain prioritas + rekomendasi aksi |
| Situational Recommendation | Opsi perilaku sesuai konteks |
| Narrative | Report developmental, non-diagnostik (rule-based) |
| Next Action | Link ke module/simulation/development goal |

Setiap visual wajib punya padanan teks — lihat [security/accessibility.md](../security/accessibility.md).

## Authoring & Immutability

- Admin membuat assessment type, version, sections, items, scale, scoring config (FR-004).
- Status version: `draft → review → published → retired`.
- Version yang sudah `published` bersifat **immutable** (FR-005). Perubahan apa pun
  menghasilkan versi baru. Rollback ke draft tidak mengubah historical report.
- Assessment taking: start, autosave, resume, submit (FR-006). Timeout tidak boleh
  menghilangkan jawaban.

## Validasi Instrumen

Prasyarat sebelum instrumen dipakai untuk keputusan formal atau riset.
Status validasi dicatat di [validity-log.md](./validity-log.md).

Minimum program validasi:

1. Expert content review
2. Cognitive interview / pilot
3. Item analysis
4. Internal consistency
5. EFA/CFA (bila desain & sampel mendukung)
6. Measurement invariance (bila membandingkan kelompok)
7. Criterion/convergent evidence (jika tersedia)

Threshold readiness **tidak** dianggap norma populasi sebelum data normatif memadai.
