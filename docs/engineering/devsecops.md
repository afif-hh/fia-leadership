---
id: devsecops
title: DevSecOps Workflow & CI Gates
audience: agent
load_when: "membuka PR, mengubah CI, merencanakan task, atau bekerja multi-session"
---

# DevSecOps Workflow

```
Issue → clarify acceptance criteria → Claude Code task → branch/worktree
  → implement → tests → lint/typecheck → security checks → PR
  → human review → merge → deploy staging → UAT → production
```

## Definition of Ready

- User story jelas; acceptance criteria testable.
- Data/privacy impact diketahui.
- Dependencies & migration impact diketahui.
- Design/ADR tersedia bila ada perubahan arsitektur.

## Definition of Done

Lihat [/CLAUDE.md](../../CLAUDE.md) §4 — sumber kebenaran tunggal, tidak diduplikasi di sini.

## CI/CD Quality Gates

| Gate | Tool/Prinsip | Fail Condition |
|---|---|---|
| Format/Lint | ESLint + Prettier | Error |
| Type Check | `tsc --noEmit` (strict) | Type error |
| Unit Tests | Vitest — domain/scoring tests | Failure |
| Integration Tests | Vitest + test-container Postgres | Failure |
| SAST | Static scan | Critical/High unaccepted |
| SCA | Dependency scan (`npm audit`/Snyk) | Critical exploitable |
| Secret Scan | gitleaks | Secret detected |
| Build | Container/app build | Failure |
| E2E Smoke | Playwright — critical journeys | Failure |
| Accessibility | axe-core automated + manual sampling | Critical violation |
| AI Eval | Prompt/model regression | Policy threshold gagal |

Merge yang wajib human review eksplisit (automated pass tidak cukup):
**scoring engine · auth · consent flow**.

## Rate Limit Baseline

Angka awal, disesuaikan setelah observasi beban:

| Endpoint group | Limit |
|---|---|
| `POST /auth/session` | 5 / menit / IP, 10 / jam / akun |
| `POST /sessions/{id}/submit` | 3 / menit / user |
| `PUT /sessions/{id}/responses` (autosave) | 60 / menit / user |
| AI-backed endpoint | 10 / menit / user, quota harian per kelas risiko |
| `GET /certificates/{id}/verify` (public) | 30 / menit / IP |

## Environment & Config

Tidak ada secret hard-coded (NFR-10). Semua konfigurasi lewat env, dibaca sekali di
`nuxt.config.ts` / runtime config, bukan `process.env` tersebar di service.

| Variable | Secret | Catatan |
|---|---|---|
| `DATABASE_URL` | ya | Per environment |
| `REDIS_URL` | ya | Session, queue, rate limit |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_KEY` / `S3_SECRET` | sebagian | Object storage |
| `AI_PROVIDER_KEY` | ya | Hanya dibaca oleh ai-gateway |
| `AI_MODEL_PINNED` | tidak | Model version di-pin, bukan "latest" |
| `SESSION_SECRET` | ya | Rotasi terjadwal |
| `INVITE_TOKEN_SECRET` | ya | Signing invitation 360 |
| `PUBLIC_BASE_URL` | tidak | Untuk link notifikasi & verifikasi sertifikat |

## Multi-Agent / Multi-Session Delivery

Claude Code dapat dijalankan paralel (multi-session/worktree) **hanya bila** dependency
dan ownership jelas.

| Agent/Role | Scope | Output | Gate |
|---|---|---|---|
| Architecture | ADR, dependency impact | Draft ADR, sequence diagram | Architect review |
| Backend | API/domain/data | Code + tests + migration | Backend review |
| Frontend | UI, accessibility | Components + tests | UX/a11y review |
| QA | Test matrix, regression | Automated tests, defect report | QA approval |
| Security | Threat review | Findings + mitigation | Security approval |
| Docs | Runbook, API docs | Updated documentation | Product/tech lead review |

**Aturan utama**: satu agent/session tidak boleh mengubah folder domain yang sedang
dikerjakan session lain tanpa koordinasi. Merge dilakukan setelah integration test
pada branch gabungan.

## Task Template

```
Task: <judul>
Context: Baca CLAUDE.md + docs/product/PRD.md Reference Map.
         Muat HANYA: <daftar file dari Reference Map>
Constraints:
  - <batasan keras, mis. JANGAN mengubah formula scoring>
Acceptance criteria:
  1. <testable>
Commands sebelum selesai: lint, typecheck, test, <e2e smoke yang relevan>
Deliver: code, tests, docs update, PR summary
```

Contoh bug task:

```
Task: Fix duplicate score run pada repeated submit
Muat: docs/assessment/scoring-spec.md, docs/assessment/golden-tests.md,
      docs/architecture/api-design.md
1. Reproduksi dengan failing integration test terlebih dahulu.
2. Investigasi idempotency boundary di endpoint submit (SC-07).
3. Implementasikan fix minimal yang aman.
4. JANGAN mengubah historical score record.
5. Tambahkan regression test untuk double-submit dan network retry.
6. Ringkas root cause, data impact, migration/cleanup (jika ada).
```
