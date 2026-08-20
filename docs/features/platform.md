---
id: platform
title: Platform Services — Notification, Files, Audit, Retention
audience: both
load_when: "bekerja pada notifikasi, file/object storage, retention, deaktivasi akun, atau export PDF"
covers: [FR-020, FR-022, FR-023, FR-024, FR-025]
---

# Platform Services

Schema: `platform` (`notifications`, `audit_logs`, `files`, `ai_runs`).

## Notification (FR-020)

- Channel: in-app dan email, sesuai konfigurasi.
- Dipicu oleh [domain events](../architecture/domain-events.md), bukan dipanggil langsung
  dari service domain.
- Isi notifikasi **tidak memuat skor atau data sensitif** — hanya pemicu dan tautan.
  Detail diambil setelah user terautentikasi.

## Files (`platform.files`)

- Metadata di Postgres, blob di S3-compatible object storage.
- Upload restriction: tipe, ukuran, scanning. Tidak dieksekusi dari domain aplikasi.
- Signed URL dengan expiry untuk akses; tidak ada bucket publik untuk file `Confidential`
  atau `Restricted`.

## Audit (FR-022)

Append-only. Detail tindakan yang wajib menghasilkan audit event:
[security/rbac.md](../security/rbac.md).

## Deaktivasi Akun (FR-023)

Menonaktifkan akun **tidak menghapus historical record**. Sesi dan skor tetap ada untuk
integritas riset dan audit. Yang berubah: status login, visibilitas di daftar aktif,
penghentian notifikasi.

## Retention & Archive (FR-024)

- Setiap data class punya periode retensi yang ditetapkan sebelum go-live.
- Archive memindahkan data dari tabel operasional ke penyimpanan dingin dengan
  provenance tetap terjaga — bukan DELETE.
- `audit_logs` tidak pernah dihapus dalam periode retensi kepatuhan.

## Export PDF (FR-025)

- Individual report ke PDF pada fase produksi.
- Dijalankan sebagai job async (Redis/BullMQ) bila melewati budget NFR-01.
- PDF mencantumkan `assessment_version`, `scoring_version`, tanggal, dan disclaimer
  non-diagnostik.
