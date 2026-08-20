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
