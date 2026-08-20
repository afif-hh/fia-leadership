---
id: feedback360
title: 360-Degree Feedback
audience: both
load_when: "bekerja pada campaign, rater, anonimitas, atau gap analysis 360"
covers: [FR-016]
---

# 360-Degree Feedback

Schema: `feedback360` (`campaigns`, `raters`, `responses`, `aggregates`).

Aktif **hanya** ketika peserta memiliki konteks perilaku yang dapat diamati rater.
Sistem membedakan rater group: **self · peer · lecturer/coach · supervisor/other**.

## Kontrol Wajib

| Kontrol | Implementasi |
|---|---|
| Rater anonymity | Group-level aggregation; **minimum-n threshold** di `feedback360.aggregates` |
| Invitation security | Signed token + expiry |
| No rater disclosure | Individual peer response **tidak pernah** ditampilkan ke subjek |
| Gap analysis | Self vs others per dimension |
| Narrative | Fokus ke pattern, tidak pernah menyebut rater |
| Coaching integration | Report diikuti reflection + development goal |

Bila jumlah responden dalam satu group di bawah minimum-n, group tersebut **tidak ditampilkan
sama sekali** — bukan ditampilkan dengan peringatan. Data class: `Restricted`
(lihat [rbac](../security/rbac.md)).

## Event

`Feedback360Closed` memicu generasi aggregate dan notifikasi.
Aggregate dihitung setelah campaign ditutup, bukan real-time, agar rater tidak dapat
disimpulkan dari perubahan angka.
