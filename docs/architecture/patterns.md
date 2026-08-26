---
id: patterns
title: Arsitektur & Domain Boundary
audience: agent
load_when: "menambah domain, memindahkan logic antar-layer, atau ragu di mana kode harus diletakkan"
covers: [NFR-07]
---

# Pola Arsitektur

**Modular monolith** dengan domain boundary tegas dalam satu deployable Nuxt app.

Boundary ini disiapkan agar dapat berevolusi menjadi service-oriented (mengekstrak domain
menjadi service terpisah) tanpa rewrite besar bila skala meningkat.

## Domain

`identity` · `assessment` · `profile` · `learning` · `simulation` · `development` ·
`feedback360` · `research` · `platform`

Pemetaan ke kapabilitas C1–C9: [product/capabilities.md](../product/capabilities.md).

## Aturan Layer

| Layer | Lokasi | Boleh | Tidak boleh |
|---|---|---|---|
| HTTP | `server/api/v1/**` | Validasi input, auth/authz check, panggil service, mapping response | Business logic, query DB langsung |
| Service | `server/domain/<domain>/` | Business logic, orkestrasi, emit domain event | Akses repository domain lain |
| Repository | `server/domain/<domain>/` | Query ke schema domainnya sendiri | Query ke schema domain lain |
| Shared | `shared/types/` | Tipe kontrak API, enum | Logic |

Kolom **Layer** menjelaskan tanggung jawab, bukan nama file. Modul di dalam satu
domain dinamai sesuai perannya (`repository.ts`, `read.ts`, `policy.ts`), bukan
dengan akhiran `*.service.ts` / `*.repo.ts` — lihat
[ADR-008](./adr/ADR-008-intent-named-domain-modules.md). Yang tetap mengikat
adalah aturan layernya: HTTP tidak memuat business logic, dan akses lintas domain
hanya lewat `index.ts` domain tersebut.

## Aturan Boundary (non-negotiable)

1. Domain lain **hanya** berkomunikasi lewat service interface publik domain tersebut,
   atau lewat [domain events](./domain-events.md).
2. **Tidak ada akses langsung ke tabel domain lain** dari luar domainnya — tidak ada
   join lintas schema di repository.
3. Client-side middleware (`app/middleware/`) adalah defense in depth, **bukan** security
   boundary. Authorization selalu di server.
4. Satu Postgres schema per domain, dideklarasikan dengan `pgSchema('<domain>')` di
   `server/db/schema/<domain>.ts`.

## Konvensi Struktur

Sumber kebenaran struktur folder adalah **filesystem repo**, bukan dokumen ini.
Yang dijamin stabil dan boleh diandalkan agent:

```
app/                  # Nuxt app dir (UI)
  pages/(public)/     # Public Website route group
  pages/dashboard/    # Lab Admin shell — flat, BUKAN pages/(portal)/
server/api/v1/        # HTTP layer tipis
server/domain/<d>/    # service + repository per bounded context
server/db/schema/     # drizzle schema, 1 file per domain
server/db/migrations/ # hasil drizzle-kit generate
server/db/seed/       # seed scripts (TANPA data pribadi nyata)
server/services/scoring/     # scoring engine
server/services/ai-gateway/  # satu-satunya pintu ke model AI
shared/types/         # kontrak yang dipakai app/ dan server/
docs/                 # dokumen ini
skills/               # Claude Code Skills (SKILL.md per prosedur berulang)
```

> **Deviasi yang disengaja:** `/dashboard` berada langsung di `app/pages/dashboard/`, bukan di
> route group `pages/(portal)/` yang semula direncanakan di dokumen ini. Diputuskan saat charting
> issue #15 dan dibangun di issue #25: dengan satu audiens (Lab Admin) dan satu shell, route group
> hanya menambah satu lapisan tanpa memisahkan apa pun. Dokumen ini yang diperbarui, bukan route-nya.
> Bila portal kelak melayani beberapa peran dengan layout berbeda, group bisa diperkenalkan saat itu.



## Data & JSONB

Relational model untuk integritas, versioning, dan auditability.
JSONB **hanya** untuk metadata fleksibel — bukan pengganti struktur inti assessment.
Field kritis dan kontrolnya: [data/data-dictionary.md](../data/data-dictionary.md).
