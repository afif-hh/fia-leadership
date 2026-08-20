---
id: dashboard
title: Dashboard & Leadership Intelligence
audience: both
load_when: "membuat/mengubah widget dashboard, agregat, atau KPI executive"
depends_on: [rbac]
covers: [FR-019]
---

# Dashboard & Leadership Intelligence

Prinsip UX wajib: **progressive disclosure**.
Prosedur menambah widget: `skills/new-dashboard-widget/SKILL.md`.

## Student Dashboard

| Widget | Isi | Action |
|---|---|---|
| Leadership Score | Overall + tanggal assessment terakhir | Open profile |
| Style Snapshot | Dominant + secondary | View 10 styles |
| Radar | Visualisasi 10 style/domain | Compare over time |
| Blake-Mouton | Titik saat ini | Read interpretation |
| Development Goals | Goal aktif + progress | Update evidence |
| Recommended Next | Module/simulation | Start activity |
| Journey Progress | Milestone | Resume program |
| Notifications | Assessment due, coaching, feedback | Open task |

Ringkasan dulu → detail domain/visual/teori/rekomendasi lewat drill-down eksplisit.
Setiap chart wajib punya padanan teks ([accessibility](../security/accessibility.md)).

## Lecturer/Coach Dashboard

Default view = **cohort-level**: completion, average domain profile, distribution,
flagged development needs (akademik), progress.

Drill-down ke individual **hanya** bila dosen ditugaskan sebagai pembimbing atau punya
kewenangan program. Minimum group size berlaku untuk statistik sensitif.

## Faculty Leadership Intelligence (Executive)

Mengukur **efektivitas program**, bukan mengawasi individu.
**Small-group suppression wajib** — kelompok kecil tidak boleh dapat diidentifikasi.
TIDAK PERNAH menampilkan daftar skor personal sebagai default view.

| KPI Layer | Contoh |
|---|---|
| Reach | Registered, active, cohort coverage |
| Assessment | Completion, average profile, distribution |
| Learning | Completion, time, mastery |
| Simulation | Participation, rubric outcomes |
| Development | Goal completion, reassessment |
| Impact | Pre-post change, program feedback |
| Research | Approved project, publication, dataset usage |
