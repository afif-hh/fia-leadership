---
id: golden-tests
title: Scoring Acceptance Tests (SC-01 … SC-08)
audience: agent
load_when: "menulis/mengubah test scoring, atau memverifikasi definition of done scoring engine"
depends_on: [scoring-spec]
---

# Minimum Acceptance Tests — Scoring Engine

Scoring engine **tidak dianggap selesai** sebelum seluruh test di bawah lulus.

| ID | Input/Condition | Expected |
|---|---|---|
| SC-01 | Semua jawaban minimum | Score tepat lower bound |
| SC-02 | Semua jawaban maksimum | Score tepat upper bound |
| SC-03 | Mixed known vector | Cocok dengan golden expected values |
| SC-04 | Dominant tie | Hybrid/tie rule deterministik |
| SC-05 | Task/People extremes | Grid tetap dalam rentang 1–9 |
| SC-06 | Incomplete required item | Submit ditolak dengan field error |
| SC-07 | Repeated submit | Idempotent — tidak ada duplicate authoritative score |
| SC-08 | New scoring version | Historical report tidak berubah |

## Property-based invariant

Selain golden vectors di atas, wajib ada property test:

- Score normalized selalu berada di rentang 0–100.
- Grid coordinate selalu berada di rentang 1–9 × 1–9.
- `score(v, sv, responses)` dipanggil dua kali dengan input identik → output identik.

## Fixture policy

Golden vector disimpan di `tests/fixtures/scoring/`. **Sintetis, tanpa data pribadi nyata.**
Setiap fixture wajib mencantumkan `assessment_version` dan `scoring_version` yang dipakai
saat vector dibuat, agar SC-08 dapat diverifikasi lintas versi.
