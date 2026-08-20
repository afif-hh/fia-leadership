---
id: simulation
title: Simulation Center
audience: both
load_when: "bekerja pada scenario, branch node, decision, rubric, debrief, atau adaptive simulation"
covers: [FR-013]
---

# Simulation Center

Schema: `simulation` (`scenarios`, `scenario_nodes`, `attempts`, `decisions`, `rubric_scores`).

Skenario: negosiasi · konflik · krisis · dilema etis · perubahan organisasi ·
lintas budaya · transformasi digital.

Setiap skenario wajib punya: learning objective, competency map, branch logic,
scoring rubric, evidence, debrief.

## Objek & Field Kunci

| Object | Field Kunci |
|---|---|
| Scenario | `title, context, difficulty, competency_tags, estimated_time` |
| Role | `role_name, goals, constraints, private_info` |
| Node | `prompt, available_choices, condition` |
| Decision | `choice, rationale, timestamp` |
| Rubric | `criterion, level, descriptor, weight` |
| Feedback | `what_worked, risk, alternative_action` |
| Reflection | `prompt, learner_response` |
| Debrief | `theory_link, discussion_guide` |

`private_info` pada Role tidak boleh terkirim ke client peserta yang tidak memegang role itu.

Prosedur menambah skenario: `skills/simulation-scenario/SKILL.md`.

## AI-Adaptive Simulation (Phase 6)

Runtime AI dapat berperan sebagai stakeholder simulatif, **tanpa** akses langsung ke seluruh
data pengguna — context dibatasi ke profil kompetensi minimum yang diperlukan.

Mitigasi wajib: prompt injection · data leakage · model drift · inconsistent scoring.

**Skor utama tetap memakai rubric evaluator yang testable**, atau human review untuk
high-stakes. Lihat [ai/governance.md](../ai/governance.md).
