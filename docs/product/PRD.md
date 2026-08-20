---
id: prd-hub
title: PRD — FIA Leadership Lab
audience: both
load_when: "selalu (Tier 0)"
version: 2.0
supersedes: PRD.md v1.0 (monolitik, 1117 baris)
---

# PRD — FIA Leadership Lab

### Leadership Development Operating System (Fakultas Ilmu Administrasi, Universitas Brawijaya)

> **Dokumen ini adalah hub, bukan spesifikasi lengkap.** Isinya hanya hal yang berlaku
> di semua task. Detail per domain ada di file terpisah — muat lewat Reference Map di §4.

---

## 1. Ringkasan Produk

FIA Leadership Lab menjalankan siklus **Assess → Understand → Learn → Simulate → Develop → Lead → Measure Impact**
untuk pengembangan kepemimpinan mahasiswa. Dua permukaan:

- **Public Website** — wajah kelembagaan: knowledge center, publikasi, program, event, kemitraan.
- **Private Portal** — ruang transaksional/personal untuk mahasiswa, dosen/coach, admin lab,
  academic lead, peneliti, pimpinan fakultas, mitra eksternal.

Inti sistem adalah **Assessment Engine** (skor deterministik, terversi, auditable) yang
menghasilkan **Leadership Profile** longitudinal per mahasiswa, terhubung ke Academy,
Simulation Center, Development Plan + Coaching, 360° Feedback, Certification, Research Center,
dan Faculty Leadership Intelligence (agregat, bukan surveillance individu).

### 1.1 Prinsip Non-Negotiable

Berlaku di semua fase. Tidak boleh dilanggar oleh implementasi apa pun.

| Prinsip | Implikasi teknis wajib |
|---|---|
| Evidence-informed | Setiap konstruk assessment punya definisi, item mapping, scoring rule, versi, evidence log. |
| Developmental, bukan vonis | Report selalu memuat strengths, development areas, rekomendasi, next action — tidak pernah label permanen. |
| Contextual | Tidak ada satu gaya kepemimpinan yang "selalu terbaik". |
| Privacy-by-design | Data individual default-private; dashboard pimpinan default-agregat. |
| Secure-by-design | RBAC, least privilege, encryption, audit log di setiap endpoint sensitif. |
| Accessible-by-design | WCAG 2.2 AA untuk semua journey utama. |
| AI accountable | Output AI traceable, dibatasi policy, tidak boleh membuat keputusan high-stakes sendiri. |
| Research-ready | Dataset analitik terpisah dari data operasional, dengan governance & approval. |
| Scoring is code, not prompt | Skor numerik SELALU dihasilkan rule engine terversi, TIDAK PERNAH oleh LLM. |

### 1.2 Out of Scope

Semua fase, kecuali direvisi lewat ADR.

- Diagnosis psikologis klinis.
- Pemeringkatan publik antar-mahasiswa.
- Keputusan otomatis untuk promosi/seleksi high-stakes berbasis skor tunggal.
- Face recognition / biometric profiling.
- Pengumpulan data yang tidak relevan dengan tujuan akademik.
- AI generatif tanpa logging, policy, dan review.

### 1.3 North-Star Metrics

| Metric | Definisi | Target |
|---|---|---|
| Assessment Completion Rate | selesai / mulai | ≥ 85% |
| Profile Comprehension | peserta memahami hasil (survei singkat) | ≥ 85% |
| Development Activation | peserta membuat ≥1 development goal | ≥ 70% |
| Learning Follow-through | peserta mengikuti rekomendasi modul | ≥ 65% |
| Simulation Completion | peserta selesaikan skenario wajib | ≥ 70% |
| Reassessment Rate | post-assessment pada program longitudinal | ≥ 60% |
| Meaningful Improvement | perubahan indikator per cohort | ditetapkan per program |
| Faculty Insight Adoption | dashboard dipakai dalam evaluasi program | ≥ triwulanan |

---

## 2. Stack Wajib

| Layer | Pilihan | Catatan |
|---|---|---|
| Framework full-stack | **Nuxt 4** (Vue 3) | SSR/SSG Public Website, SPA/hybrid Private Portal, Nitro server untuk API. |
| Bahasa | **TypeScript** strict | `app/`, `server/`, `shared/`. Root `tsconfig.json` wajib `"strict": true`. |
| Build tool | **Vite** | Default Nuxt 4. |
| Test runner | **Vitest** | Unit, integration (test-container Postgres), component (`@vue/test-utils`). |
| Linting | **ESLint** flat config (`@nuxt/eslint`) | Wajib lulus sebelum PR. |
| Formatting | **Prettier** | Format-on-save + `prettier --check` di CI. |
| ORM & migrasi | **Drizzle ORM** + `drizzle-kit` | Schema-as-code, migration terversi. |
| Database | **PostgreSQL 15+** | Multi-schema, 1 schema per domain. JSONB hanya untuk metadata fleksibel. |
| Cache/Queue | **Redis** | Session cache, rate limiting, BullMQ untuk job scoring/report berat. |
| Object storage | S3-compatible (MinIO / cloud S3) | Dokumen, sertifikat PDF, lampiran evidence. |
| Deployment | Container (Docker) | Stateless app tier, horizontal scaling. |
| Observability | **OpenTelemetry** + structured logs (pino/JSON) | Lihat [observability](../engineering/observability.md). |
| E2E test | **Playwright** | Critical user journeys. |
| CI/CD | GitHub Actions | Quality gates di [devsecops](../engineering/devsecops.md). |

Stack final untuk seluruh fase (0–6). Perubahan stack butuh ADR yang disetujui Tech Lead.

## 3. Domain Boundary

**Modular monolith** dengan boundary tegas dalam satu deployable Nuxt app. Domain:
`identity` · `assessment` · `profile` · `learning` · `simulation` · `development` ·
`feedback360` · `research` · `platform`.

Aturan singkat (detail: [architecture/patterns.md](../architecture/patterns.md)):

- Setiap domain punya `server/domain/<domain>/` dengan service + repository layer sendiri.
- Domain lain **hanya** berkomunikasi lewat service interface publik atau domain events.
- `server/api/**` adalah HTTP layer tipis — validasi, authz, panggil service, mapping response.
  Tidak ada business logic di route handler.

---

## 4. Reference Map — muat HANYA yang dibutuhkan

> Ini adalah mekanisme utama pengendali konteks. Patuhi.

| Kalau task-mu menyentuh… | Muat |
|---|---|
| formula, threshold, atau pipeline scoring | [assessment/scoring-spec.md](../assessment/scoring-spec.md) + [golden-tests.md](../assessment/golden-tests.md) |
| instrumen KDPGK, item bank, output report | [assessment/kdpgk-v1.md](../assessment/kdpgk-v1.md) |
| validasi psikometrik instrumen | [assessment/validity-log.md](../assessment/validity-log.md) |
| endpoint API baru atau perubahan kontrak | [architecture/api-design.md](../architecture/api-design.md) + [security/rbac.md](../security/rbac.md) |
| skema DB, migration, field kritis | [data/data-dictionary.md](../data/data-dictionary.md) + `server/db/schema/` |
| domain event / integrasi antar-domain | [architecture/domain-events.md](../architecture/domain-events.md) |
| struktur folder, service/repository layer | [architecture/patterns.md](../architecture/patterns.md) |
| role, permission, consent, audit | [security/rbac.md](../security/rbac.md) |
| komponen UI, chart, form, journey | [security/accessibility.md](../security/accessibility.md) |
| threat model, privacy, retention | [security/privacy-security.md](../security/privacy-security.md) |
| fitur AI apa pun (coach, narrative, adaptive) | [ai/governance.md](../ai/governance.md) |
| prompt production | [ai/prompts/](../ai/prompts/) |
| Academy, modul, quiz, sertifikat | [features/academy.md](../features/academy.md) |
| Simulation Center | [features/simulation.md](../features/simulation.md) |
| Development plan, goal, coaching | [features/development.md](../features/development.md) |
| 360 feedback | [features/feedback360.md](../features/feedback360.md) |
| dashboard / agregat / executive KPI | [features/dashboard.md](../features/dashboard.md) + [security/rbac.md](../security/rbac.md) |
| research export, de-identification | [features/research.md](../features/research.md) |
| notification, CMS, file, retention | [features/platform.md](../features/platform.md) |
| public website, halaman, design token | [features/public-website.md](../features/public-website.md) |
| CI, PR, release, multi-agent | [engineering/devsecops.md](../engineering/devsecops.md) |
| strategi test | [engineering/testing.md](../engineering/testing.md) |
| SLO, incident, logging | [engineering/observability.md](../engineering/observability.md) |
| daftar FR/NFR/user story lengkap | [requirements.md](./requirements.md) |
| prioritas fitur, kapabilitas C1–C9 | [capabilities.md](./capabilities.md) |

**Tier 2 — dokumen manusia, agent tidak perlu memuatnya**:
[personas](./governance/personas.md) · [roadmap](./governance/roadmap.md) · [handover](./governance/handover.md)

---

## 5. ID Index

Gunakan ID (`FR-xxx`, `NFR-xx`, `SC-xx`) sebagai referensi lintas dokumen, **bukan nomor bab**.
ID stabil saat file dipindah; nomor bab tidak.

| ID range | Topik | File spesifikasi |
|---|---|---|
| FR-001 … FR-003 | Identity, SSO, consent | [security/rbac.md](../security/rbac.md) |
| FR-004 … FR-011 | Assessment authoring, taking, scoring, profile | [assessment/scoring-spec.md](../assessment/scoring-spec.md), [kdpgk-v1.md](../assessment/kdpgk-v1.md) |
| FR-012 | Academy | [features/academy.md](../features/academy.md) |
| FR-013 | Simulation | [features/simulation.md](../features/simulation.md) |
| FR-014, FR-015 | Development plan, coaching | [features/development.md](../features/development.md) |
| FR-016 | 360 feedback | [features/feedback360.md](../features/feedback360.md) |
| FR-017 | Certificate & badge | [features/academy.md](../features/academy.md) |
| FR-018 | Research export | [features/research.md](../features/research.md) |
| FR-019 | Faculty dashboard | [features/dashboard.md](../features/dashboard.md) |
| FR-020 … FR-025 | Notification, CMS, audit, retention, PDF export | [features/platform.md](../features/platform.md) |
| NFR-01 … NFR-12 | Non-functional targets | [requirements.md](./requirements.md) |
| SC-01 … SC-08 | Scoring acceptance tests | [assessment/golden-tests.md](../assessment/golden-tests.md) |
| PII-RULE | Aturan PII di log/trace/metric | [/CLAUDE.md](../../CLAUDE.md#pii-rule) |

---

*Sintesis teknis-implementatif dari "Dokumen Pengembangan Sistem Informasi Kepemimpinan
FIA Leadership Lab (2026)". Bagian narasi akademik, prakata, kesimpulan, dan daftar pustaka
dari dokumen sumber tidak disertakan karena tidak actionable untuk implementasi.*
