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

Token desain (warna, tipografi, spacing, shape, komponen) untuk seluruh produk — public website
maupun private portal — didefinisikan tunggal di
[design/design.md](../design/design.md). Jangan hard-code warna di komponen; rujuk token dari
dokumen tersebut.
