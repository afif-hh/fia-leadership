---
id: public-website
title: Public Website
audience: both
load_when: "bekerja pada halaman publik, CMS, atau design token"
covers: [FR-021]
---

# Public Website

Route group: `app/pages/(public)/`. Rendering: SSR/SSG.

Struktur halaman: **Home · About · Leadership Programs · Research · Activities ·
Knowledge Center · Partners · Contact**

Hero: *"BUILD THE LEADER BEFORE THE LEADER"*
Subheadline: *"Assess. Develop. Simulate. Lead."*

## Homepage Information Hierarchy

1. Hero + primary CTA "Start Assessment"
2. Why Leadership Lab
3. Leadership Journey
4. Assessment Portfolio
5. Leadership Intelligence preview
6. Academy 8 modules
7. Simulation Center preview
8. Research & Publication
9. Partners
10. News & Events
11. Footer + privacy + accessibility statement

## CMS (FR-021)

Mengelola public pages, news, event, program, knowledge resource.
Konten CMS berkelas data `Public` atau `Internal` (draft) —
lihat [rbac](../security/rbac.md).

## Design Tokens

| Token | Rekomendasi |
|---|---|
| Visual character | Academic-modern, trustworthy, data-intelligent |
| Color | Institutional blue/neutral, kontras sesuai AA; final mengikuti brand FIA/UB |
| Typography | Sans-serif readable, ukuran body mobile-friendly |
| Spacing | Skala berbasis 8pt |
| Components | Card, tab, stepper, form, chart, table, alert, badge |
| Charts | Label accessible + alternatif teks |
| Responsive | Mobile-first untuk journey kritis |
| Motion | Reduced-motion support; animasi non-esensial saja |

Token final diimplementasikan sekali di layer tema — jangan hard-code warna di komponen.
