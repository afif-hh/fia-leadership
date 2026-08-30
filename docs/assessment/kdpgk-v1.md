---
id: kdpgk-v1
title: Assessment Engine — KDPGK (Assessment V1)
audience: both
load_when: 'bekerja pada instrumen, item bank, authoring, atau output report assessment'
covers: [FR-004, FR-005, FR-006, FR-010]
---

# KDPGK — Assessment V1

10 gaya operasional portal:

**Directive/Autocratic · Participative/Democratic · Delegative · Task-Oriented · People-Oriented ·
Transformational · Transactional · Situational/Adaptive · Ethical-Authentic · Innovative/Digital-Change**

> **Status implementasi (ADR-010).** Engine, ledger, dan report sudah dibangun. Bank item
> **sintetis** ada di `server/db/seed/kdpgk/bank.ts` — 40 item, 10 gaya, 8 domain, 2 sumbu, skala
> Likert 5 titik, dwibahasa — dan disemai lewat `node server/db/seed/kdpgk/seed.ts`. Bank itu ada
> supaya seluruh rantai dapat dijalankan end to end; ia belum melalui satu pun langkah validasi di
> bawah, dan `validity-log.md` menahan KDPGK v1 pada status `draft`.
>
> Dari daftar Output Wajib di bawah, yang sudah ada adalah **angkanya**: Overall Potential dengan
> band-nya, Domain Profile, 10 Style Profile sebagai tabel, Dominant/Secondary dengan hybrid flag,
> dan koordinat Blake-Mouton dengan nama kuadrannya.
>
> Yang **belum** ada, dan semuanya milik effort Leadership Profile berikutnya:
>
> - **Explanation** pada Overall Potential — yang tampil baru skor dan label band.
> - **Interpretasi kuadran** Blake-Mouton — yang tampil baru nama kuadrannya.
> - **Contoh perilaku** pada Strengths — yang tampil baru daftar nama domain.
> - **Rekomendasi aksi** pada Development Priorities — idem.
> - **Situational Recommendation** dan **Next Action** — belum ada sama sekali; keduanya menuntut
>   modul, simulasi, atau development goal yang belum dibangun.
> - **Radar chart** (FR-009) dan **narrative rule-based** (FR-010).
>
> Tabel dan teks yang ada sekarang bukan penampung sementara untuk chart itu: WCAG 2.2 AA tetap
> menuntut padanan teksnya, jadi keduanya akan hidup berdampingan.

> **Catatan implementasi.** Dokumen ini **tidak** menyertakan bank item/pertanyaan aktual.
> Yang didefinisikan adalah skema (`assessment.items`, `assessment.dimensions`,
> `assessment.version_items`, `assessment.scoring_rules`) dan pipeline scoring, agar engine
> siap menerima item bank nyata saat tersedia.
>
> Skor 0–100 adalah **indeks komunikasi hasil**, bukan vonis. Disclaimer ini **wajib tampil
> di setiap output**.

## Output Wajib per Assessment Run

| Output                     | Komponen Visual/Naratif                            |
| -------------------------- | -------------------------------------------------- |
| Overall Potential          | Gauge/score + band + explanation                   |
| Domain Profile             | ≥8 domain sesuai instrumen                         |
| 10 Style Profile           | Radar chart + tabel (alternatif teks wajib — WCAG) |
| Dominant/Secondary         | Primary pattern + hybrid flag                      |
| Blake-Mouton               | Coordinate 1–9 × 1–9 + interpretasi kuadran        |
| Strengths                  | Top domain + contoh perilaku                       |
| Development Priorities     | Domain prioritas + rekomendasi aksi                |
| Situational Recommendation | Opsi perilaku sesuai konteks                       |
| Narrative                  | Report developmental, non-diagnostik (rule-based)  |
| Next Action                | Link ke module/simulation/development goal         |

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
