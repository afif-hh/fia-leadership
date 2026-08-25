---
id: accessibility
title: Accessibility (WCAG 2.2 AA)
audience: agent
load_when: "membuat/mengubah komponen UI, chart, form, atau journey apa pun"
covers: [FR-009, NFR-06]
---

# Accessibility — WCAG 2.2 AA

Wajib untuk semua user journey utama. Bukan opsional, bukan fase belakangan.

Sumber token desain (warna, tipografi, spacing, komponen) ada di
[design/design.md](../design/design.md) — termasuk kontras yang sudah AA-verified. Dokumen ini
tidak mendefinisikan ulang token; ini adalah aturan wajib interaksi/struktur yang berlaku di atas
token apa pun yang dipakai.

## Aturan Umum

- Keyboard navigation penuh + focus visibility.
- Form labels + error identification eksplisit — **bukan hanya warna**.
- Contrast ratio sesuai AA; text resize didukung.
- Reduced-motion support; animasi non-esensial saja.
- Mobile-first untuk journey kritis.

## Target Size {#target-size}

[design/design.md](../design/design.md) § Touch Targets menyerahkan kewajibannya ke dokumen ini,
tetapi dokumen ini sebelumnya tidak menyatakannya sama sekali — satu-satunya penegakan adalah
sebuah CSS reset (issue #55). Aturannya sekarang eksplisit.

Dua success criterion WCAG 2.2 yang berbeda sering tertukar:

| SC | Level | Minimum |
|---|---|---|
| 2.5.8 Target Size (Minimum) | **AA** | **24×24 px** |
| 2.5.5 Target Size (Enhanced) | AAA | 44×44 px |

Baseline wajib proyek ini adalah **AA**, jadi **24×24 px adalah lantai yang tidak boleh
dilanggar** oleh target interaktif apa pun.

Di atas lantai itu, proyek ini memilih **44×44 px** untuk permukaan yang benar-benar disentuh —
lebih ketat dari AA, dan itu memang disengaja:

- **Wajib 44×44** — tombol pada journey publik/mahasiswa, radio item assessment, item navigasi,
  dan setiap kontrol pada layar yang dipakai di perangkat sentuh. Pakai `size="default"` / `"lg"` /
  `"icon"` (`buttonVariants` menjamin ≥44px).
- **Boleh 24–28px** — kontrol padat di UI internal admin yang dipakai dengan mouse/keyboard, mis.
  ledger authoring assessment. Pakai `size="xs"` / `"sm"` / `"icon-xs"` / `"icon-sm"` secara
  **eksplisit**; ini opt-in, bukan default.

Penegakannya ada di komponen (`app/components/ui/button/index.ts`), **bukan** di selektor `button`
global. Sebuah `min-height` global tidak bisa ditimpa utility `h-*` mana pun — properti-nya
berbeda — jadi ia membungkam setiap size variant tanpa ada yang melaporkannya. Itu persisnya bug
#55. Regression guard: `app/tests/unit/button-cascade.test.ts`.

## Aturan Spesifik Domain Ini

| Elemen | Kewajiban |
|---|---|
| Radar chart | **Selalu** disertai table/summary teks yang setara |
| Blake-Mouton plot | Coordinate numerik + interpretasi teks, tidak hanya visual |
| Gauge / score band | Nilai + label band dalam teks yang dapat dibaca screen reader |
| Assessment item | Dapat dibaca screen reader; grup radio punya fieldset/legend |
| Timeout assessment | **Tidak** membuat jawaban hilang — autosave sebelum expiry |
| Distribution chart (dashboard) | Padanan tabel agregat |

## Definition of Done UI

- Automated axe-core pass (CI gate, critical violation = fail).
- Manual keyboard walkthrough untuk journey yang disentuh.
- Screen reader spot-check untuk komponen baru.
- Prosedur lengkap: `skills/accessibility-review/SKILL.md`.
