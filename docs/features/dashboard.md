---
id: dashboard
title: Dashboard & Leadership Intelligence
audience: both
load_when: 'membuat/mengubah widget dashboard, agregat, atau KPI executive'
depends_on: [rbac]
covers: [FR-019]
---

# Dashboard & Leadership Intelligence

Prinsip UX wajib: **progressive disclosure**.
Prosedur menambah widget: `skills/new-dashboard-widget/SKILL.md`.

## Student Dashboard

| Widget            | Isi                                   | Action              |
| ----------------- | ------------------------------------- | ------------------- |
| Leadership Score  | Overall + tanggal assessment terakhir | Open profile        |
| Style Snapshot    | Dominant + secondary                  | View 10 styles      |
| Radar             | Visualisasi 10 style/domain           | Compare over time   |
| Blake-Mouton      | Titik saat ini                        | Read interpretation |
| Development Goals | Goal aktif + progress                 | Update evidence     |
| Recommended Next  | Module/simulation                     | Start activity      |
| Journey Progress  | Milestone                             | Resume program      |
| Notifications     | Assessment due, coaching, feedback    | Open task           |

Ringkasan dulu → detail domain/visual/teori/rekomendasi lewat drill-down eksplisit.
Setiap chart wajib punya padanan teks ([accessibility](../security/accessibility.md)).

## Lecturer/Coach Dashboard

Default view = **cohort-level**: completion, average domain profile, distribution,
flagged development needs (akademik), progress.

Drill-down ke individual **hanya** bila dosen ditugaskan sebagai pembimbing atau punya
kewenangan program. Minimum group size berlaku untuk statistik sensitif.

## Lab Admin Dashboard

Ditambahkan bersama shell `/dashboard` (issue #22, #25). Sebelumnya dokumen ini tidak punya
bagian Lab Admin sama sekali, sehingga navigasinya harus diturunkan dari matriks di
[security/rbac.md](../security/rbac.md).

Sidebar adalah **proyeksi dari matriks akses**, bukan daftar kedua: setiap item mendeklarasikan
resource dan action-nya, lalu server memfilter lewat matriks yang sama yang ia tegakkan. Peran baru
karena itu berbiaya satu baris matriks, bukan satu daftar navigasi baru — dan sebuah item tidak bisa
hidup lebih lama dari izin yang membenarkannya.

**Menyembunyikan item adalah kenyamanan, bukan penegakan.** UI bukan security boundary. Karena
`requireSession` membaca role dari cookie cache dengan kebasian hingga 60 detik, pengguna yang baru
diturunkan perannya bisa sesaat masih melihat sebuah item; mengkliknya menghasilkan 403 atau 404
dari server, dan itulah satu-satunya jaminan yang nyata. Item dengan sel `scoped` **tetap terlihat**,
karena klien tidak bisa menyelesaikannya — predikatnya butuh baca database dan baris target.

| Grup      | Item                     | Route              | Resource / action                 | Status |
| --------- | ------------------------ | ------------------ | --------------------------------- | ------ |
| Operate   | Overview                 | `/dashboard`       | `Own Profile` / read              | Ada    |
| Operate   | Users                    | `/dashboard/users` | `User Administration` / read      | Ada    |
| Operate   | Audit log                | `/dashboard/audit` | `Audit Log` / read                | Ada    |
| Configure | Assessment configuration | —                  | `Assessment Configuration` / read | Nanti  |
| Configure | Scoring rules            | —                  | `Scoring Rules` / draft           | Nanti  |
| Insight   | Assigned students        | —                  | `Assigned Student Detail` / read  | Nanti  |
| Insight   | Aggregate dashboard      | —                  | `Aggregate Dashboard` / read      | Nanti  |
| Insight   | Research exports         | —                  | `Research Export` / approve       | Nanti  |

Own Profile dan Own Assessment **tidak** ada di rail — keduanya catatan milik admin sendiri, bukan
permukaan administratif, jadi tempatnya di dropdown pengguna di kaki sidebar.

Item yang domainnya belum dibangun tampil **terlihat namun disabled**, dengan `aria-disabled` dan
alasan berupa teks — bukan warna saja, karena warna tunggal gagal WCAG 2.2 AA. Navigasi karena itu
sudah berbentuk seperti produk akhir sejak awal, dan bertumbuh dengan diisi, bukan dengan didesain
ulang.

**Landing view `/dashboard` adalah ringkasan nyata**, bukan placeholder: jumlah akun, distribusi
role, dan audit event terakhir — semuanya dari tabel yang sudah ada. Ini memenuhi prinsip
progressive disclosure dengan query nyata, dan merupakan satu-satunya permukaan yang menguji
`definePolicyHandler` dari ujung ke ujung. Distribusi role disajikan sebagai **tabel**, yang
sekaligus menjadi padanan teks yang diwajibkan; bar di tiap baris dekoratif dan `aria-hidden`.

Small-group suppression **tidak** berlaku di sini — aturan itu mengatur statistik mahasiswa, bukan
hitungan akun administratif.

## Faculty Leadership Intelligence (Executive)

Mengukur **efektivitas program**, bukan mengawasi individu.
**Small-group suppression wajib** — kelompok kecil tidak boleh dapat diidentifikasi.
TIDAK PERNAH menampilkan daftar skor personal sebagai default view.

| KPI Layer   | Contoh                                       |
| ----------- | -------------------------------------------- |
| Reach       | Registered, active, cohort coverage          |
| Assessment  | Completion, average profile, distribution    |
| Learning    | Completion, time, mastery                    |
| Simulation  | Participation, rubric outcomes               |
| Development | Goal completion, reassessment                |
| Impact      | Pre-post change, program feedback            |
| Research    | Approved project, publication, dataset usage |
