```
ADR-001: Use deterministic rule engine for leadership scoring
Status: Accepted
Type: assessment
Context: Leadership scores must be reproducible, auditable, and versioned.
Decision: Numeric scoring diimplementasikan di code/config dengan scoring_version
  eksplisit. LLM boleh menjelaskan skor tapi tidak boleh menghitung skor otoritatif.
Consequences: Lebih testable & auditable; perubahan scoring butuh academic
  approval dan deployment/version management.
Rollback: Tidak berlaku — ini adalah prinsip non-negotiable produk.
```

Implementasi: [assessment/scoring-spec.md](../../assessment/scoring-spec.md)
