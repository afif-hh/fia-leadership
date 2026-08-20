---
id: validity-log
title: Instrument Validity Log
audience: human
load_when: "mencatat atau memeriksa status validasi psikometrik sebuah versi instrumen"
owner: Academic Lead
---

# Validity Log

Satu baris per `assessment_version`. Diisi oleh Academic Lead, bukan oleh agent.
Instrumen **tidak boleh** dipakai untuk keputusan formal atau riset sampai kolom
"Status" bernilai `approved`.

| Assessment Version | Expert Review | Pilot/Cognitive | Item Analysis | Internal Consistency | EFA/CFA | Invariance | Criterion Evidence | Status | Tanggal | Catatan |
|---|---|---|---|---|---|---|---|---|---|---|
| KDPGK v1 (draft) | – | – | – | – | – | – | – | `draft` | – | Item bank belum tersedia |

Legenda status: `draft` · `in-validation` · `approved` · `retired`

## Aturan

- Perubahan status wajib disertai ADR assessment.
- Threshold readiness tidak boleh dipresentasikan sebagai norma populasi selama status
  belum `approved` dan data normatif belum memadai.
- Bukti validasi (laporan, dataset analisis) disimpan terpisah dengan governance riset —
  lihat [features/research.md](../features/research.md).
