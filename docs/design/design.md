---
id: design
title: Design System — FIA Leadership Lab
audience: both
load_when: "membuat/mengubah UI, komponen, tema, atau halaman apa pun (public website maupun private portal)"
depends_on: [accessibility]
covers: [FR-021, NFR-06]
---

## Overview

FIA Leadership Lab adalah platform asesmen kepemimpinan untuk Fakultas Ilmu Administrasi,
Universitas Brawijaya — dipakai oleh mahasiswa, dosen/coach, admin lab, dan pimpinan fakultas.
Karakter visual yang wajib: **academic-modern, trustworthy, data-intelligent**. Ini bukan produk
konsumer atau e-commerce — setiap layar harus terasa seperti instrumen akademik yang kredibel:
tenang, presisi, dan mudah dipercaya saat menampilkan skor, profil kepemimpinan, dan rekomendasi
pengembangan seseorang.

Sistem token ini berlaku untuk **kedua permukaan produk**: Public Website (institutional,
marketing, knowledge center) dan Private Portal (dashboard, assessment, chart, form). Struktur
dokumen (Overview → Colors → Typography → Layout & Spacing → Elevation → Shapes → Components →
Do's/Don'ts → Responsive → Iteration Guide → Known Gaps) mengikuti pola token-system yang sudah
terbukti reusable — hanya *isinya* yang diautorisasi ulang untuk institusi ini, bukan
find-and-replace dari tema lain.

Warna final tetap terbuka untuk disesuaikan begitu brand guideline resmi FIA/UB tersedia — nilai
di bawah adalah baseline yang **sudah** AA-verified dan bisa dipakai sekarang tanpa menunggu
brand kit resmi. Perubahan hex tetap harus lewat proses re-verifikasi kontras di §"Iteration
Guide" sebelum merge.

Aturan aksesibilitas (kontras, keyboard, reduced-motion, padanan teks untuk chart) TIDAK
didefinisikan ulang di sini — rujuk selalu ke
[security/accessibility.md](../security/accessibility.md). Dokumen ini hanya mendefinisikan
*token nilai* (warna, tipografi, spacing, shape, komponen); *aturan wajib* interaksi/a11y tetap
tunggal di accessibility.md.

## Colors

### Brand & Accent

Primary adalah **institutional blue** — dipilih karena asosiasi universal dengan kepercayaan,
akademik, dan data (bukan warna hangat/promosional). Dipakai untuk CTA utama, link, focus ring,
active state navigasi, dan seri data utama pada chart.

| Token | Light | Dark | Usage | Contrast vs. background |
|---|---|---|---|---|
| `primary-700` | `#1d4ed8` | — | Teks/link di atas surface terang; kontras tinggi | 6.70:1 on `#ffffff` |
| `primary-600` | `#2563eb` | `#60a5fa` | Default button/CTA background (light); default accent text (dark) | 5.17:1 white-on-`#2563eb`; 7.36:1 `#60a5fa`-on-`#0b1220` |
| `primary-500` | `#3b82f6` | `#3b82f6` | Ilustrasi non-teks, chart series 1, ring accent | n/a (non-teks) |
| `primary-300` | — | `#93c5fd` | Link/aksen di dark mode saat butuh kontras ekstra | 10.38:1 on `#0b1220` |
| `on-primary` | `#ffffff` | `#0b1220` | Teks di atas `primary-600` | 5.17:1 (light) / 7.36:1 (dark) |
| `secondary` (ink) | `#0f172a` | `#e2e8f0` | Secondary emphasis, headings alternatif | 17.85:1 on `#ffffff`; 15.19:1 on `#0b1220` |

Aksen dipakai secukupnya: primary hanya untuk elemen interaktif/penekanan, bukan untuk field besar
seperti hero background penuh — biarkan neutral yang membawa luas permukaan.

### Surface

| Token | Light | Dark | Usage |
|---|---|---|---|
| `background` | `#f8fafc` | `#0b1220` | Page canvas |
| `surface` | `#ffffff` | `#111827` | Default surface (card, form, modal) |
| `surface-raised` | `#ffffff` | `#1e293b` | Elevated surface (dropdown, popover) |
| `surface-sunken` | `#f1f5f9` | `#0f172a` | Inset groups, code block, table stripe |
| `border` | `#e2e8f0` | `#334155` | Hairline border, divider |
| `border-strong` | `#cbd5e1` | `#475569` | Emphasis border, input focus outline base |
| `overlay` | `rgba(15,23,42,0.5)` | `rgba(0,0,0,0.65)` | Modal/drawer backdrop |

### Text

| Token | Light | Dark | Usage | Contrast |
|---|---|---|---|---|
| `ink-900` | `#0f172a` | `#e2e8f0` | Primary text, heading | 17.85:1 on `#ffffff`; 15.19:1 on `#0b1220` |
| `body-700` | `#334155` | `#cbd5e1` | Body copy | 10.35:1 on `#ffffff`; 12.61:1 on `#0b1220` |
| `muted-500` | `#64748b` | `#94a3b8` | Secondary text, caption, metadata | 4.76:1 on `#ffffff`; 7.30:1 on `#0b1220` |
| `disabled-400` | `#94a3b8` | `#64748b` | Disabled text (non-critical, no AA requirement) | — |

`muted-500` diverifikasi 4.76:1 di light mode — di atas ambang 4.5:1 AA normal text; jangan
diturunkan lebih terang tanpa re-verifikasi.

### Semantic (status & feedback)

| Token | Light | Dark | Usage | Contrast |
|---|---|---|---|---|
| `success-700` | `#15803d` | `#86efac` | Success text/icon | 5.02:1 on `#ffffff`; 13.33:1 on `#0b1220` |
| `success-bg` | `#f0fdf4` | `#052e16` | Success surface/alert background | — |
| `warning-800` | `#92400e` | `#fcd34d` | Warning text/icon | 7.09:1 on `#ffffff`; 12.98:1 on `#0b1220` |
| `warning-bg` | `#fffbeb` | `#451a03` | Warning surface/alert background | — |
| `danger-700` | `#b91c1c` | `#fca5a5` | Error/destructive text/icon | 6.47:1 on `#ffffff`; 9.86:1 on `#0b1220` |
| `danger-bg` | `#fef2f2` | `#450a0a` | Error surface/alert background | — |
| `info-700` | `#1d4ed8` | `#93c5fd` | Informational text/icon (reuses `primary-700`) | 6.70:1 / 10.38:1 |
| `link` | `#1d4ed8` | `#93c5fd` | Hyperlink | 6.70:1 on `#ffffff`; 10.38:1 on `#0b1220` |
| `ring-focus` | `rgba(37,99,235,0.6)` | `rgba(96,165,250,0.6)` | Focus indicator (never color-only; always with visible outline) |

**Catatan penting**: warna semantic (success/warning/danger) TIDAK BOLEH jadi satu-satunya sinyal
status di assessment item, gauge, atau score band — selalu disertai label teks/ikon per aturan
[accessibility.md](../security/accessibility.md).

### Chart / Data-Visualization Palette

Khusus radar chart, Blake-Mouton plot, gauge, dan distribution chart di dashboard — palet
kategorikal terbatas 5 warna agar tetap dapat dibedakan penyandang low-vision umum, plus selalu
didampingi padanan teks/tabel (wajib, lihat accessibility.md):

| Seri | Light | Dark |
|---|---|---|
| Series 1 | `#2563eb` (blue) | `#60a5fa` |
| Series 2 | `#0d9488` (teal) | `#2dd4bf` |
| Series 3 | `#7c3aed` (violet) | `#a78bfa` |
| Series 4 | `#ea580c` (orange, non-semantic use only) | `#fb923c` |
| Series 5 | `#64748b` (neutral, "baseline"/"previous" series) | `#94a3b8` |

### Dark Mode Comparison

| Token | Light | Dark |
|---|---|---|
| background | `#f8fafc` | `#0b1220` |
| surface | `#ffffff` | `#111827` |
| ink-900 | `#0f172a` | `#e2e8f0` |
| border | `#e2e8f0` | `#334155` |
| primary (interactive) | `#2563eb` | `#60a5fa` |

Dark mode menggeser primary dari `#2563eb` ke `#60a5fa` (lebih terang) karena `#2563eb` di atas
latar `#0b1220` hanya mencapai kontras memadai untuk elemen non-teks; untuk teks/link di dark mode
selalu pakai `primary-300`/`600-dark` (`#93c5fd`/`#60a5fa`) yang sudah diverifikasi di atas.

## Typography

### Font Family

Sans-serif geometris/humanis yang netral-akademik, readable di ukuran kecil (tabel skor, label
chart) dan di layar mobile (mahasiswa mengisi assessment dari HP). Rekomendasi: **Inter** sebagai
default (tersedia luas, hinting bagus di semua ukuran, sudah jadi standar UI modern) atau
**Source Sans 3** sebagai alternatif open-source jika brand FIA/UB nanti mensyaratkan font
tertentu. Untuk kode/ID (misalnya kode sertifikat, ID asesmen): monospace netral.

```css
--font-sans: Inter, "Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "IBM Plex Mono", "JetBrains Mono", Consolas, monospace;
```

### Hierarchy

| Token | fontFamily | fontSize | fontWeight | lineHeight | letterSpacing | Usage |
|---|---|---|---|---|---|---|
| display-lg | sans | 3rem (48px) | 700 | 1.15 | -0.02em | Hero headline (public website) |
| display-md | sans | 2.25rem (36px) | 700 | 1.2 | -0.02em | Section opener |
| heading-lg | sans | 1.75rem (28px) | 600 | 1.25 | -0.01em | Page title (portal) |
| heading-md | sans | 1.375rem (22px) | 600 | 1.3 | 0 | Card/section title |
| heading-sm | sans | 1.125rem (18px) | 600 | 1.35 | 0 | Sub-section, widget title |
| body-lg | sans | 1.0625rem (17px) | 400 | 1.6 | 0 | Lead paragraph, assessment item text |
| body-md | sans | 1rem (16px) | 400 | 1.55 | 0 | Default body — minimum size untuk teks utama mobile |
| body-sm | sans | 0.875rem (14px) | 400 | 1.5 | 0 | Metadata, table cell, helper text |
| caption | sans | 0.75rem (12px) | 400 | 1.4 | 0.01em | Timestamp, footnote — pakai seminimal mungkin |
| button-md | sans | 1rem (16px) | 600 | 1.0 | 0 | Button label |
| data-value | sans | 1.75rem (28px) | 700 | 1.1 | -0.01em | Score/angka besar (leadership score, KPI tile) |
| code-sm | mono | 0.8125rem (13px) | 400 | 1.5 | 0 | ID, kode sertifikat |

### Principles

1. **Body minimum 16px** — body-md tidak boleh diturunkan di bawah 1rem/16px di viewport mobile;
   mahasiswa mengisi assessment panjang dari HP, kelelahan mata langsung menurunkan completion
   rate (North-Star Metric).
2. **Weight disiplin** — body selalu 400; 600 untuk heading/button/label interaktif; 700 hanya
   untuk display dan `data-value` (skor, angka besar) agar angka penting benar-benar menonjol.
3. **Tracking netral** — tidak ada tracking negatif ekstrem seperti gaya marketing agresif; jaga
   `letterSpacing` di kisaran -0.02em s.d. 0 supaya tetap terasa "akademik", bukan "startup landing
   page".
4. **Satu skala untuk dua permukaan** — public website dan private portal memakai skala yang sama;
   perbedaan hanya di token mana yang dipakai paling sering (display-* dominan di public website,
   data-value/body-sm dominan di portal).

### Font Substitutes

Jika Inter tidak tersedia: fallback ke `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
Jangan gunakan serif untuk body di kedua permukaan — serif mengesankan jurnal cetak, bukan produk
digital data-intelligent yang ditargetkan di sini.

## Layout & Spacing

### 8pt Grid

Mengikuti rekomendasi yang sudah ditetapkan di
[features/public-website.md](../features/public-website.md): base unit 8px.

| Token | Value | Pixel | Usage |
|---|---|---|---|
| `space-1` | 0.25rem | 4px | Icon-to-label gap, micro spacing |
| `space-2` | 0.5rem | 8px | Base unit; tight padding, chip gap |
| `space-3` | 0.75rem | 12px | Form field internal gap |
| `space-4` | 1rem | 16px | Default component padding |
| `space-6` | 1.5rem | 24px | Card padding, button padding (horizontal) |
| `space-8` | 2rem | 32px | Card group gap, section internal spacing |
| `space-12` | 3rem | 48px | Between related sections |
| `space-16` | 4rem | 64px | Between major sections (portal) |
| `space-24` | 6rem | 96px | Between major sections (public website marketing block) |

Semua nilai adalah kelipatan 8px (kecuali `space-1`/`space-3` untuk penyesuaian mikro sesuai grid
4px turunan) — jangan pakai nilai di luar skala ini.

### Whitespace Philosophy

Public website boleh lebih lega (marketing rhythm, `space-24` antar section) karena tujuannya
membangun trust lewat first impression. Private portal — terutama halaman assessment dan
dashboard — memprioritaskan *density terkendali*: cukup ruang untuk scanability tapi tidak boros,
karena pengguna (mahasiswa/dosen) mengulangi task ini berkali-kali dan efisiensi mengisi/membaca
lebih penting daripada kesan pertama.

## Elevation & Depth

| Level | Light Mode Shadow | Dark Mode Shadow | Use Case |
|---|---|---|---|
| level0 | none | none | Flat, page background |
| level1 | `0 1px 2px rgba(15,23,42,0.06)` | `0 1px 2px rgba(0,0,0,0.4)` | Card at rest, table row hover |
| level2 | `0 4px 8px rgba(15,23,42,0.08)` | `0 4px 8px rgba(0,0,0,0.5)` | Dropdown, tooltip, active card |
| level3 | `0 12px 24px rgba(15,23,42,0.12)` | `0 12px 24px rgba(0,0,0,0.6)` | Modal, drawer |
| level4 | `0 20px 40px rgba(15,23,42,0.16)` | `0 20px 40px rgba(0,0,0,0.7)` | Toast, popover di atas modal |

Shadow tetap tipis (maks. 16% opacity light mode) — kredibilitas institusi datang dari kejelasan
informasi, bukan efek visual dramatis. Border-based depth (`border`/`border-strong`) lebih
diprioritaskan daripada shadow untuk pemisahan konten di dalam form/table.

## Shapes

| Token | Value | Usage |
|---|---|---|
| `radius-none` | 0 | Table, full-bleed banner |
| `radius-sm` | 0.25rem (4px) | Checkbox, small badge, input inline |
| `radius-md` | 0.5rem (8px) | Button, input, tab |
| `radius-lg` | 0.75rem (12px) | Card, alert, stepper container |
| `radius-xl` | 1rem (16px) | Modal, large feature card |
| `radius-full` | 9999px | Badge, avatar, switch, pill filter |

Radius sedang (md/lg) dipilih dengan sengaja — cukup lembut untuk terasa modern/approachable,
tidak terlalu bulat sehingga kehilangan kesan formal/akademik yang dibutuhkan platform asesmen.

## Components

Set komponen berikut disusun berdasarkan kebutuhan nyata platform (assessment, dashboard, CMS),
bukan template generik:

### Form & Input
- **Text input / textarea** — `surface`, border `border`, focus border `primary-600` + `ring-focus`
  outline 2px, radius `radius-md`, height 44px (touch target AA), label selalu di luar (bukan
  placeholder-only).
- **Radio group (assessment item)** — dibungkus `fieldset`/`legend` (wajib, lihat
  accessibility.md); setiap opsi 44px min tap target; selected state pakai `primary-600` circle,
  bukan warna saja.
- **Stepper** — multi-step assessment/CMS wizard; step aktif `primary-600`, step selesai
  `success-700` + check icon, step belum `border-strong`; selalu ada label teks per step (tidak
  hanya nomor/warna).
- **Select / dropdown** — sama dengan text input, tambah chevron icon; menu `surface-raised` +
  `level2` shadow.

### Data Display
- **Card** — `surface`, radius `radius-lg`, padding `space-6`, shadow `level1` at rest, `level2`
  on hover (portal) / static (public website, non-interactive card tidak perlu hover shadow).
- **Table** — header row `surface-sunken` + `body-sm` weight 600, stripe opsional
  `surface-sunken`, sel numerik right-aligned. Wajib punya scroll horizontal pattern di mobile,
  bukan font yang mengecil.
- **Radar chart container** — chart + tombol "Lihat sebagai tabel" yang toggle ke tabel data
  setara (wajib per accessibility.md); axis label `body-sm`, palet dari "Chart /
  Data-Visualization Palette" di atas.
- **Gauge / score band** — nilai numerik besar (`data-value`) + label band teks (contoh:
  "Berkembang", bukan hanya warna); band color dari semantic palette + label, tidak pernah warna
  saja.
- **Distribution chart (dashboard agregat)** — sama seperti radar: selalu punya padanan tabel
  agregat yang dapat diakses.

### Feedback & Status
- **Alert** — `surface`, left border 4px warna semantic (`success-700`/`warning-800`/
  `danger-700`/`info-700`), icon 20px + label teks status (bukan warna saja), radius `radius-lg`,
  padding `space-4`.
- **Badge** — status pendek (mis. "Draft", "Published", "Completed"); radius `radius-full`,
  padding `4px 12px`, warna dari semantic palette + selalu disertai teks label, tidak pernah ikon
  warna polos.
- **Toast** — konfirmasi non-blocking, `level4` shadow, auto-dismiss dengan opsi pause-on-hover;
  hormati `prefers-reduced-motion` untuk animasi masuk/keluar.

### Navigation
- **Tab** — untuk switching view (mis. dashboard cohort vs individual); underline `primary-600`
  pada active tab, teks `ink-900` active / `muted-500` inactive; keyboard arrow-key navigation
  wajib (lihat accessibility.md).
- **Navbar (public website)** — `background`, height 64px, shadow `level1`; collapse ke hamburger
  di bawah breakpoint `md`.
- **Sidebar (portal)** — `surface`, border-right `border`; item aktif `primary-600` background
  tint 8% + teks `primary-700`.

## Do's and Don'ts

### Do

- Pakai `primary-600`/`primary-700` hanya untuk elemen interaktif dan penekanan data utama —
  bukan untuk field besar/background dekoratif.
- Selalu sandingkan warna semantic (success/warning/danger) dengan label teks atau ikon, terutama
  di gauge, badge, dan assessment feedback.
- Gunakan skala spacing `space-1` s.d. `space-24` untuk semua jarak; jangan hardcode piksel bebas.
- Terapkan `radius-lg` untuk card dan `radius-md` untuk kontrol form secara konsisten di kedua
  permukaan produk.
- Uji ulang kontras (§ tabel di atas) setiap kali sebuah hex diganti — target selalu 4.5:1 (teks
  normal) / 3:1 (teks besar ≥ 24px atau ≥ 19px bold).
- Sediakan padanan tabel/teks untuk setiap chart (radar, Blake-Mouton, gauge, distribution) sesuai
  [accessibility.md](../security/accessibility.md) — non-negotiable di platform ini.

### Don't

- Jangan gunakan `primary-*` sebagai satu-satunya indikator status/selection — selalu sertai
  ikon/label.
- Jangan menurunkan body text di bawah 16px di breakpoint mobile.
- Jangan memakai warna di luar palet yang terdaftar tanpa menjalankan verifikasi kontras ulang.
- Jangan menduplikasi aturan WCAG (keyboard nav, focus order, reduced motion) di dokumen ini — itu
  tanggung jawab [accessibility.md](../security/accessibility.md); dokumen ini hanya token nilai.
- Jangan memakai shadow lebih berat dari `level4` untuk elemen interaktif biasa — kesan institusi
  harus tetap tenang, bukan flamboyan.
- Jangan memakai border-radius di luar skala shape yang terdaftar.

## Responsive Behavior

### Breakpoints

| Breakpoint | Width | Key Changes |
|---|---|---|
| base | 0–639px | Single column; assessment item satu per layar penuh |
| sm | 640–767px | Dua kolom untuk card grid ringan |
| md | 768–1023px | Sidebar portal muncul; navbar public website masih hamburger |
| lg | 1024–1279px | Navigasi penuh, dashboard multi-widget grid |
| xl | 1280px+ | Max content width 1280px (portal) / 1440px (public website) |

### Touch Targets

Minimum 44×44px untuk semua target interaktif (tombol, radio assessment, item nav) —
konsisten dengan rekomendasi WCAG 2.2 AA di
[accessibility.md](../security/accessibility.md); dokumen ini hanya menegaskan ukuran token,
aturan kewajibannya tetap di accessibility.md.

### Collapsing Strategy

- **Navbar (public website)** → hamburger di bawah `md`.
- **Sidebar (portal)** → collapse ke bottom-nav atau off-canvas drawer di bawah `md`.
- **Card grid** → base: 1 kolom, sm: 2, md/lg: 3, xl: 4.
- **Radar chart / gauge** → tetap render chart di mobile (bukan disembunyikan), tapi tabel
  padanan menjadi tampilan default jika viewport < `sm` dan pengguna memilih mode teks.
- **Form/stepper** → stack full-width di bawah `sm`; step indicator berubah dari horizontal ke
  vertical-compact di bawah `sm`.

### Motion

Reduced-motion support wajib (lihat accessibility.md) — semua animasi non-esensial (entrance
fade, hover transition) harus dihormati `prefers-reduced-motion: reduce` dengan fallback instan
tanpa transisi.

## Iteration Guide

1. **Satu komponen per iterasi** — jangan refactor navbar dan dashboard widget bersamaan dalam
   satu perubahan.
2. **Rujuk token, jangan hardcode** — pakai nama token (`primary-600`, `space-6`, `radius-lg`),
   bukan hex/px literal di komponen, supaya dark mode dan perubahan brand di masa depan konsisten
   otomatis.
3. **Re-verifikasi kontras setiap kali warna berubah** — gunakan formula relative luminance WCAG
   (atau tool contrast checker) sebelum merge; target 4.5:1 normal text / 3:1 large text, catat
   hasilnya di tabel warna dokumen ini.
4. **Brand final menyusul** — begitu FIA/UB menerbitkan brand guideline resmi, primary hue boleh
   disesuaikan asal tetap "institutional/trustworthy" secara karakter dan tetap lolos verifikasi
   kontras ulang; jangan mengganti karakter sistem (mis. jadi playful/vibrant) tanpa proses ADR
   desain.
5. **Uji di kedua mode** — light dan dark, di kedua permukaan (public website dan portal) —
   sebelum menganggap sebuah komponen selesai.
6. **Dokumentasikan alasan, bukan cuma tampilan** — saat menambah komponen baru, jelaskan mengapa
   ia perlu ada di sistem ini (kebutuhan assessment/dashboard apa yang dipenuhi), bukan hanya
   bagaimana rupanya.

## Known Gaps

- **Brand final belum ditetapkan** — palet di atas adalah baseline institutional-blue yang sudah
  AA-verified dan dapat dipakai sekarang; belum final mengikuti brand guideline resmi FIA/UB (lihat
  rekomendasi asli di [features/public-website.md](../features/public-website.md)).
- **Motion choreography** — durasi/easing token belum didetailkan (entrance, exit, scroll-trigger
  di public website marketing section).
- **Empty states** — belum ada pola terdokumentasi untuk empty dashboard, belum-ada-assessment,
  atau no-results search di knowledge center.
- **Illustration/photography system** — public website memerlukan gaya foto/ilustrasi institusi
  (kampus, mahasiswa, dosen) yang belum didefinisikan di dokumen ini.
- **Print styles** — sertifikat PDF dan laporan hasil assessment yang dicetak memerlukan token
  print-specific (belum didokumentasikan; lihat juga `features/academy.md` untuk sertifikat).
- **Component states matrix** — sebagian komponen (tabs, dropdown item) memiliki active/focus
  state tapi belum semua kombinasi pressed/disabled terdokumentasikan secara eksplisit.
