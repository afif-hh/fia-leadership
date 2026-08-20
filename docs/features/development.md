---
id: development
title: Development Plan & Coaching
audience: both
load_when: "bekerja pada development goal, action, evidence, atau workflow coaching"
covers: [FR-014, FR-015]
---

# Development & Coaching

Schema: `development` (`plans`, `goals`, `actions`, `evidence`, `coaching_sessions`).

## Development Plan (FR-014)

Mengelola baseline, goal, target, action, evidence, status.

- Baseline diambil dari leadership profile terakhir — tautkan `profile_snapshot_id`
  agar goal tetap bermakna setelah re-assessment.
- Goal dibuat dari development priority di report (STU-03: minimal 3 rekomendasi,
  prioritas dapat dipilih menjadi goal).
- Evidence dapat berupa file (metadata di `platform.files`) atau teks refleksi.

## Coaching (FR-015)

Mengelola assignment, session, note, action item, **visibility control**.

| Kontrol | Aturan |
|---|---|
| Assignment | Coach hanya melihat mentee yang ditugaskan kepadanya (`R*` di [rbac](../security/rbac.md)) |
| Session note | Default privat antara coach dan mentee |
| Visibility | Setiap note punya visibility eksplisit; tidak ada default "terlihat semua staf" |
| Next review date | Wajib pada setiap sesi yang ditutup |

Acceptance criteria COACH-01: goal, action, evidence, note, next review date, visibility control.

## Event

`DevelopmentGoalCreated` dan `CoachingSessionCompleted` —
lihat [architecture/domain-events.md](../architecture/domain-events.md).
