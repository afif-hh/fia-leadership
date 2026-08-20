---
id: personas
title: Persona & Experience Principle
audience: human
load_when: "diskusi produk/UX. Agent tidak perlu memuat ini untuk task implementasi."
---

# Persona & Experience Principle

| Persona | Tujuan | Risiko yang harus dicegah |
|---|---|---|
| Mahasiswa | Memahami diri, berkembang, melihat progress | Merasa dilabeli; bingung oleh skor; kehilangan privasi |
| Dosen/Coach | Mengarahkan pembelajaran & mentoring | Over-surveillance; data overload; bias interpretasi |
| Admin Lab | Mengoperasikan program & instrumen | Salah konfigurasi; akses terlalu luas |
| Academic Lead | Menjaga validitas akademik | Perubahan scoring tanpa version control |
| Researcher | Menganalisis data secara sah | Re-identification; secondary use tanpa otorisasi |
| Faculty Executive | Melihat dampak program | Mengakses data individual yang tidak diperlukan |
| External Partner | Menjalankan program tertentu | Cross-tenant data leakage |

## Progressive Disclosure (prinsip UX wajib)

- **Mahasiswa**: ringkasan dulu → detail domain/visual/teori/rekomendasi lewat drill-down eksplisit.
- **Dosen**: cohort pattern dulu → individual detail HANYA untuk mahasiswa yang diampu.
- **Pimpinan**: outcome & trend agregat, TIDAK PERNAH daftar skor personal sebagai default view.

Implementasi konkret: [features/dashboard.md](../../features/dashboard.md).
