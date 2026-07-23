# Implementation Roadmap

**Version:** 1.1.0  
**Model:** 12 bounded implementation prompts after architecture Prompt 0, plus Prompt 1.5 specification resolution before the data model

Every prompt follows the [Implementation Constitution](IMPLEMENTATION_CONSTITUTION.md), references the canonical specifications, runs required tests, completes the [Architecture Review Checklist](16_ARCHITECTURE_REVIEW_CHECKLIST.md), updates evidence in the [Exit Contract](../13-exit-contract/PHASE_1_EXIT_CONTRACT.md), and emits a handoff report.

| Prompt | Objective | Depends on | Principal deliverables | Exit evidence |
|---:|---|---|---|---|
| 0 | Specification freeze | source material | this documentation repository, conflict/gap log, decisions | canonical docs internally consistent |
| 1 | Engineering foundation | 0 | monorepo, web/API/worker shells, config, errors, logs, auth/audit/job/test scaffolds, ADRs | install/build/lint/typecheck/test/start/health |
| 1.5 | Pre-database specification resolution | 0 (1 ADRs when present) | Resolve CONF-005/009; Operational State and Consent Model; coordinated canonical updates | conflicts resolved; Prompt 2 entry unblocked for those topics |
| 2 | Canonical data model | 1, 1.5 | schemas, migrations, repositories, organizations/contacts/users/territories/tasks/audit, parallel-state columns, consent tables, seeds | migration and CRUD/invariant tests |
| 3 | Variables, evidence, provenance | 2 | definitions/values/sources/observations, review lifecycle, confidence, admin seams | unknown/provenance/conflict/version tests |
| 4 | Collection and identity resolution | 2–3 | manual entry, CSV mapping/dry-run/commit/report/revert, normalization, duplicate review/merge | mixed import fixture end to end |
| 5 | Completeness and scoring | 3–4 | purpose completeness, all score families, configuration/versioning, explanations, recalculation | golden/property/version replay tests |
| 6 | Qualification and workflow | 5 | review queue/workspace, decisions/disqualifiers/overrides, prospect state machine, tasks | guard and authorization matrix |
| 7 | Discovery | 6 | templates/questions, agenda, session/answers/mapping confirmation, score deltas | discovery-to-value-to-rescore integration |
| 8 | Outreach tracking | 6–7 | templates/sequences/approvals, activities/responses/next actions, restrictions | no-send and response-routing tests |
| 9 | Opportunities | 6–8 | opportunity creation, stage rules/history, value/probability/risk/outcomes | stage and audit tests |
| 10 | Dashboard backend/reporting | 2–9 | permission-scoped queries, metric definitions, saved views, CSV/asynchronous exports | fixture parity and performance tests |
| 11 | Web UX and all dashboards | 4–10 | UI catalog screens, eight dashboards, drilldowns, accessible states | component/accessibility/e2e tests |
| 12 | Hardening and Phase 1 acceptance | 1–11 | security/performance/recovery review, full regression, docs/runbooks, exit report | all release gates and E2E scenario pass |

## Prompt packet template

```text
Context: Phase 1, Prompt N; prerequisites and next dependency.
Authority: list exact canonical documents and applicable ADRs.
Objective: one bounded outcome.
Inspect first: repository, git diff, public contracts, migrations, tests.
In scope / Out of scope: explicit lists.
Contracts and invariants: required inputs, outputs, side effects, errors.
Implementation: planned responsibilities/files, not speculative files.
Acceptance: automated tests and observable user scenario.
Required commands: install/build/lint/typecheck/unit/integration/e2e as applicable.
Documentation: blueprint/status, ADRs, runbooks, exit evidence.
Architecture review: result, findings, remediation evidence, deferred risks.
Handoff: changes, results, deviations, limitations, rollback, next readiness.
```

## Critical path

`Foundation → (spec resolution 1.5) → database → evidence/variables → collection → scoring → qualification → discovery → outreach/opportunity → reporting → UI → acceptance`

Reporting contracts may be designed earlier, but metric implementation waits until source semantics exist. UI vertical slices may accompany each prompt for operability, while Prompt 11 completes coherence and dashboards; business logic remains in services.

## Release discipline

Prompt completion is not a production deployment. Phase 1 release occurs only after Prompt 12, exit-contract sign-off, security/privacy review, approved score versions, production configuration validation, restore rehearsal, and named business owner acceptance.

## Phase 1.2 pointer

After Phase 1.1 population/collection pilot work, **Phase 1.2** adds fixture-safe research-run orchestration (Start Research Run UI + gated draft adapters). It does not replace Prompt 12 exit gates and does not close RB-014–017. See `docs/release/PHASE_1_2_RESEARCH_RUN_COMPLETION.md`.

