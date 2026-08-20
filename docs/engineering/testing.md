---
id: testing
title: Test Strategy
audience: agent
load_when: "menentukan jenis test yang dibutuhkan sebuah perubahan"
---

# Test Strategy

| Test Type | Contoh |
|---|---|
| Unit | Normalization formula, dominant style tie, grid conversion |
| Property-based | Score selalu 0–100; grid selalu 1–9 |
| Golden | Known responses → known expected report values |
| Integration | Submit → score → profile snapshot |
| Authorization | Student tidak dapat membaca profile orang lain |
| E2E | Login → assessment → result → development goal |
| Performance | Concurrent assessment submissions |
| Security | Injection, access control, session, upload |
| AI Eval | Narrative tidak mengarang skor / membuka PII |
| UAT | Academic & operational acceptance |

**Scoring engine mendapat unit-test density tertinggi** — kesalahan formula dapat merusak
seluruh report. Matriks acceptance test scoring:
[assessment/golden-tests.md](../assessment/golden-tests.md).

## Aturan

- Setiap fitur: unit test wajib; integration test bila menyentuh DB/API.
- Setiap sensitive endpoint: authorization test wajib (bukan opsional).
- Bug fix: failing test dulu, baru fix.
- Test data sintetis, tanpa data pribadi nyata — `tests/fixtures/`.
