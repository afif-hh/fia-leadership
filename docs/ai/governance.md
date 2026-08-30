---
id: ai-governance
title: AI Runtime & Governance
audience: agent
load_when: 'menyentuh fitur AI apa pun — narrative, coach, rekomendasi, adaptive simulation'
covers: [NFR-12]
---

# AI Runtime & Governance

## AI Gateway (wajib)

Aplikasi **tidak boleh** memanggil model AI dari banyak lokasi tanpa kontrol terpusat.
Semua fitur AI melewati `server/services/ai-gateway/`.

```
App Feature → AI Gateway → Policy Check → Context Builder → Model
     → Output Validator → Safety/PII Check → Response
                              │
                              └─→ ai_runs audit metadata (no secrets, minimized content)
```

Gateway bertanggung jawab atas: model policy, prompt version, PII filtering, rate limit,
tracing, fallback, evaluation, human escalation.

## Kelas Risiko Fitur AI

| Kelas          | Contoh                                    | Kontrol                             |
| -------------- | ----------------------------------------- | ----------------------------------- |
| A — Low        | Draft text, summary non-sensitif          | Automated review + logging          |
| B — Moderate   | Personalized learning recommendation      | Explainability + user control       |
| C — High       | Interpretasi profile sensitif             | Rule constraints + human escalation |
| D — Prohibited | Automatic decision kelayakan kepemimpinan | **Tidak diizinkan**                 |

Kelas C wajib punya opsi **"review by coach"**.

## Prompt & Model Governance

- Setiap prompt production punya `prompt_id` + `version`, disimpan di
  [`docs/ai/prompts/`](./prompts/) dan direferensikan dari kode — **tidak hard-coded tersebar**.
- Perubahan prompt sensitif butuh eval regression.
- Model upgrade **tidak** langsung menggantikan production tanpa test set.
- Output memakai structured output (JSON schema) bila tersedia.
- PII/sensitive context diminimalkan sebelum dikirim ke model.
- User-facing AI content diberi disclosure sesuai konteks.

## Batas Keras

- LLM **tidak pernah** menghitung skor otoritatif
  (lihat [assessment/scoring-spec.md](../assessment/scoring-spec.md)).
- AI tidak mengakses seluruh data pengguna — context dibatasi ke minimum yang diperlukan
  untuk fitur tersebut.
- Skor simulasi utama tetap memakai rubric evaluator yang testable atau human review
  untuk high-stakes.

## Evaluation Set (wajib sebelum production)

Kasus yang harus tercakup: profil normal · skor ekstrem · tie dominant style ·
incomplete data · multilingual response · adversarial prompt · request diagnosis ·
request membuka data orang lain.

Metric: factual grounding terhadap score payload · tone developmental ·
absence of prohibited labels · completeness · refusal correctness · consistency.

Eval regression adalah CI gate — lihat [engineering/devsecops.md](../engineering/devsecops.md).

## Risiko Keamanan AI/LLM (OWASP GenAI Top 10)

| Risiko                   | Contoh di FIA Leadership Lab                                  | Mitigasi                                               |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------ |
| Prompt Injection         | User mencoba membuat AI Coach membuka system instruction/data | Context isolation, allow-list tools, output validation |
| Sensitive Disclosure     | AI mengulang data peserta lain                                | Tenant/user scoping, minimal context, DLP checks       |
| Supply Chain             | Dependency/plugin berbahaya                                   | Lockfile, SCA, provenance, review                      |
| Excessive Agency         | Agent mengubah data tanpa approval                            | Tool permissions, confirmation, least privilege        |
| Insecure Output Handling | AI output dirender sebagai HTML berbahaya                     | Escape/sanitize output                                 |
| Model/Prompt Drift       | Perubahan hasil setelah model update                          | Pin/version policy + eval gate                         |
