---
id: adr-template
title: ADR Template
audience: both
load_when: "membuat keputusan arsitektur atau perubahan scoring/instrumen"
---

```
ADR-XXX: <judul keputusan>
Status: Proposed | Accepted | Superseded by ADR-YYY
Date: YYYY-MM-DD
Type: architecture | assessment        # assessment butuh approval Academic Lead
Context: <masalah dan constraint yang relevan>
Decision: <keputusan, cukup spesifik untuk diimplementasikan>
Consequences: <konsekuensi positif dan negatif, termasuk beban operasional>
Rollback: <bagaimana keputusan ini dibatalkan bila salah>
```

Perubahan bertipe `assessment` (formula, threshold, item mapping, readiness band)
**wajib** disetujui Academic Lead sebelum merge. Lihat
`skills/assessment-scoring-change/SKILL.md`.
