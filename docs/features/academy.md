---
id: academy
title: Leadership Academy & Credential
audience: both
load_when: "bekerja pada curriculum, module, lesson, quiz, reflection, progress, badge, sertifikat"
covers: [FR-012, FR-017]
---

# Leadership Academy

Schema: `learning` (`curricula`, `modules`, `lessons`, `enrollments`, `progress`,
`quiz_attempts`, `reflections`).

## 8 Level

| Level | Learning Design | Mapped Competency |
|---|---|---|
| 1 Leadership Foundation | Video, reading, quiz, reflection | Self-awareness, foundation |
| 2 Power & Influence | Negotiation, power mapping | Influence, negotiation |
| 3 Style & Traits | Assessment, observation | Style awareness |
| 4 Behavioral & Situational | Case, role-play | Adaptive leadership |
| 5 Transformational & Transactional | Case, debate | Vision/execution |
| 6 Ethical, Spiritual & Authentic | Ethical dilemma, values reflection | Integrity/authenticity |
| 7 Global & Change | Cross-cultural case, change blueprint | CQ/change |
| 8 Innovation & Digital | Digital case, innovation strategy | Digital/change leadership |

## Recommendation Engine v1

**Rule-based dan transparan.** Bila domain tertentu di bawah target, atau peserta memilih
goal tertentu → sarankan module/lesson/simulation dengan competency tag relevan.

AI recommendation (Phase 6) boleh ditambahkan, tapi wajib:
- tetap menjelaskan alasan rekomendasi,
- menghormati preference dan workload peserta,
- tunduk pada kelas risiko B di [ai/governance.md](../ai/governance.md).

## Certificate & Badge (FR-017)

- Diterbitkan dengan **verification code** yang dapat diverifikasi publik via
  `GET /api/v1/certificates/{id}/verify`.
- Endpoint verifikasi hanya mengembalikan status validitas + nama program + tanggal.
  **Tidak** mengembalikan skor, profil, atau data pribadi lain.
- Certificate PDF disimpan di object storage; metadata di `platform.files`.
