---
id: observability
title: Observability, SLO & Incident Management
audience: agent
load_when: 'menambah logging/metric/trace, atau menangani insiden'
covers: [NFR-08, NFR-09]
---

# Observability & Operations

Stack: OpenTelemetry (traces + metrics) + structured logs (pino/JSON).
Aturan PII di semua signal: [/CLAUDE.md](../../CLAUDE.md#pii-rule).

## SLO Awal

- Assessment submit success ≥ 99.5%.
- Scoring job success ≥ 99.9% (excluding invalid input).
- **Tidak ada loss of submitted responses.**
- Critical profile page load P95 sesuai performance budget (NFR-01: ≤ 800 ms API read).
- Backup restore diuji sesuai jadwal.

## Incident Management

| Severity | Contoh                                            | Respons                                                        |
| -------- | ------------------------------------------------- | -------------------------------------------------------------- |
| SEV-1    | Data breach, sistem unavailable saat event kritis | Incident commander segera, containment, stakeholder escalation |
| SEV-2    | Scoring salah untuk satu cohort, isu auth major   | Stop fitur terdampak, investigasi, controlled re-score         |
| SEV-3    | Fitur non-kritis gagal                            | Fix di siklus normal/expedited                                 |
| SEV-4    | Kosmetik/minor                                    | Backlog                                                        |

## Prosedur Khusus: Scoring Incident {#incident-scoring}

1. **Freeze** scoring version terdampak.
2. Identifikasi sesi terdampak.
3. Validasi koreksi dengan **Academic Lead**.
4. Buat `score_run` **baru** — jangan overwrite silent.
5. Regenerate report.
6. Notifikasi user terdampak bila relevan.
7. Simpan audit trail lengkap.

Spesifikasi engine: [assessment/scoring-spec.md](../assessment/scoring-spec.md).
