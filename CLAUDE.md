# FIA Leadership Lab — Agent Rules

Ini adalah Tier 0: file ini + `docs/product/PRD.md` adalah satu-satunya dokumen yang
selalu dibaca. Semua dokumen lain dimuat **hanya bila** Reference Map menyuruhnya.

## 0. Aturan pemuatan konteks (baca ini lebih dulu)

1. Baca file ini.
2. Baca `docs/product/PRD.md` — khususnya **Reference Map**.
3. Muat **hanya** file yang dipetakan Reference Map untuk task-mu.
4. JANGAN memuat seluruh `docs/` "untuk jaga-jaga". Konteks yang tidak relevan
   menurunkan kualitas output, bukan menaikkannya.
5. Kalau Reference Map tidak mencakup task-mu, tanya — jangan menebak lalu membaca semuanya.

## 1. Aturan kerja (non-negotiable)

1. JANGAN mengubah formula/threshold scoring tanpa ADR assessment yang disetujui Academic Lead.
   Prosedur: `skills/assessment-scoring-change/SKILL.md`.
2. JANGAN mencatat raw assessment answers atau data pribadi ke log aplikasi (lihat PII Rule di bawah).
3. Setiap fitur wajib punya unit test; integration test bila menyentuh DB/API.
4. Gunakan komponen UI & pola aksesibilitas yang sudah ada (WCAG 2.2 AA) — jangan bikin
   komponen baru untuk kebutuhan yang sudah tercover.
5. Semua perubahan database lewat Drizzle migration (`drizzle-kit generate` + `drizzle-kit migrate`).
   JANGAN edit skema production secara manual.
6. Setiap endpoint API baru wajib punya authorization check di service/policy layer (server-side)
   dan audit classification. UI **bukan** security boundary.
7. Narasi yang dihasilkan AI wajib developmental, bukan diagnostik — ikuti
   `docs/ai/prompts/narrative-engine.v1.md`.
8. Jalankan lint, typecheck, test, dan security check (secret scan, dependency audit) sebelum membuka PR.
9. Setiap PR wajib menyertakan ringkasan risiko, migration (jika ada), dan rollback plan.
10. Satu task/agent tidak mengubah folder domain yang sedang dikerjakan task/agent lain
    tanpa koordinasi eksplisit.
11. Scoring engine, auth, dan consent flow TIDAK BOLEH di-merge tanpa human review eksplisit —
    automated checks lulus saja tidak cukup.
12. Domain lain hanya berkomunikasi lewat service interface publik atau domain events.
    Tidak ada akses langsung ke tabel domain lain.
13. Komunikasi agent WAJIB pakai skill `caveman`/`cavecrew`: chat ke user pakai mode `caveman`
    (compressed), dan delegasi ke subagent pakai `cavecrew-investigator`/`cavecrew-builder`/
    `cavecrew-reviewer` (bukan `Explore`/`general-purpose` polos) supaya hasil subagent ringkas.
    Batas: artefak yang dipersist untuk manusia lain — komentar kode, commit message, dokumentasi,
    isi issue/PR/ticket, file memory — TETAP prosa normal, bukan caveman-compressed. Kalau hasil
    subagent langsung ditampilkan ke manusia, parafrase dulu ke prosa normal.

## 2. PII Rule {#pii-rule}

Berlaku di semua log, trace, metric, dan analytics. Referensi ID: `PII-RULE`.

| Signal | Contoh | Aturan |
|---|---|---|
| Metrics | request latency, submit rate, scoring failures | No PII |
| Logs | request id, error code, service action | No raw responses |
| Traces | service spans, DB timing | No answer payload |
| Audit | siapa mengakses/mengubah resource sensitif | User id boleh, content diminimalkan |
| Product analytics | journey completion, feature usage | Pseudonymized bila memungkinkan |

`responses.answer_value` TIDAK PERNAH masuk application log, trace, atau metric.

## 3. Skills tersedia

`skills/<nama>/SKILL.md` — masing-masing berisi langkah kerja, dokumen referensi,
command yang harus dijalankan, dan definition of done.

`assessment-scoring-change` · `new-dashboard-widget` · `secure-api-endpoint` ·
`database-migration` · `simulation-scenario` · `accessibility-review` · `release-readiness`

## 4. Definition of Done (semua task)

- Acceptance criteria terpenuhi.
- Unit/integration/e2e test relevan lulus.
- Tidak ada critical/high security finding yang belum resolved.
- Accessibility check untuk UI.
- Migration punya rollback/forward strategy.
- Dokumentasi diperbarui.
- Audit event ditambahkan bila perlu.
- PR sudah direview manusia.

## Agent skills

### Issue tracker

Issues live in GitHub Issues at `afif-hh/fia-leadership` (uses the `gh` CLI, repo auto-detected from the git remote). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context, but following this repo's own Tier-0 rules rather than the generic layout — no fresh `CONTEXT.md`/`docs/adr/` created. See `docs/agents/domain.md`.
