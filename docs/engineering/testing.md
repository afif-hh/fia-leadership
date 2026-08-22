---
id: testing
title: Test Strategy
audience: agent
load_when: 'menentukan jenis test yang dibutuhkan sebuah perubahan'
---

# Test Strategy

| Test Type      | Contoh                                                     |
| -------------- | ---------------------------------------------------------- |
| Unit           | Normalization formula, dominant style tie, grid conversion |
| Property-based | Score selalu 0–100; grid selalu 1–9                        |
| Golden         | Known responses → known expected report values             |
| Integration    | Submit → score → profile snapshot                          |
| Authorization  | Student tidak dapat membaca profile orang lain             |
| E2E            | Login → assessment → result → development goal             |
| Performance    | Concurrent assessment submissions                          |
| Security       | Injection, access control, session, upload                 |
| AI Eval        | Narrative tidak mengarang skor / membuka PII               |
| UAT            | Academic & operational acceptance                          |

**Scoring engine mendapat unit-test density tertinggi** — kesalahan formula dapat merusak
seluruh report. Matriks acceptance test scoring:
[assessment/golden-tests.md](../assessment/golden-tests.md).

## Integration Test & Database

Vitest punya dua project dalam satu `vitest.config.ts`:

- `app` — jsdom, `app/tests/**`.
- `server` — node, `server/tests/**`.

`pnpm test` menjalankan keduanya; `pnpm test:server` hanya suite database.

Integration test berjalan di Node terhadap file SQLite nyata — schema, migration, dan kode
repository yang sama dengan Worker; hanya import `createClient` yang berbeda, di balik
`createDb()`. Tanpa Docker, tanpa Miniflare, tanpa Workers test pool. (PRD §2 menyebut
"test-container Postgres"; itu tidak berlaku lagi.)

- `globalSetup` menjalankan migration **sekali** ke sebuah template `.db`.
- Setiap test menyalin template itu (`freshDb()`), bukan membersihkan tabel — `audit_logs` tidak
  bisa di-truncate karena trigger `BEFORE DELETE`-nya membatalkan penghapusan.
- Suite dimulai dari migration, bukan snapshot, supaya trigger dan `CHECK` ikut teruji.
- `pnpm db:reset` menyiapkan database lokal untuk `nuxt dev`.

**Yang tidak tercakup**: isolasi token per-domain. Tidak ada authorization layer terhadap file
lokal maupun `turso dev`, jadi jaminan itu hanya bisa diuji terhadap Turso sungguhan.

## Aturan

- Setiap fitur: unit test wajib; integration test bila menyentuh DB/API.
- Setiap sensitive endpoint: authorization test wajib (bukan opsional).
- Bug fix: failing test dulu, baru fix.
- Test data sintetis, tanpa data pribadi nyata — `tests/fixtures/`.
