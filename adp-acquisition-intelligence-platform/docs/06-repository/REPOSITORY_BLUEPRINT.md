# Repository Blueprint

**Version:** 1.2.0
**Status:** Planned production repository contract

## Proposed production tree

```text
adp-acquisition-platform/
├── apps/
│   ├── web/src/{app,components,features,lib}
│   ├── api/src/{routes,middleware,composition}
│   └── worker/src/{jobs,consumers,scheduler}
├── packages/
│   ├── contracts/src/
│   ├── database/{schema,migrations,seeds,src}
│   ├── platform/{config,errors,logging,audit,auth,jobs}
│   ├── organizations/src/
│   ├── collection/src/
│   ├── evidence/src/
│   ├── variables/src/
│   ├── scoring/src/
│   ├── qualification/src/
│   ├── discovery/src/
│   ├── outreach/src/
│   ├── consent/src/
│   ├── opportunities/src/
│   ├── reporting/src/
│   └── ui/src/
├── config/{variables,scoring,workflows,discovery,outreach,consent}
├── data/{seed,fixtures,imports,exports}
├── docs/{adr,architecture,operations,user}
├── scripts/{setup,seed,import,validation,maintenance}
├── tests/{unit,integration,e2e,contract,performance,security,fixtures}
└── tooling/{eslint,typescript,test,dependency-rules}
```

## Folder rules

Each domain package contains `domain/`, `application/`, `infrastructure/`, `index.ts`, and colocated unit tests as appropriate. Only `index.ts` exports are public. Domain folders forbid framework/database/UI imports. Infrastructure implements ports. Web feature folders may compose presentation components and API hooks but contain no scoring, workflow, or data-normalization logic. Configuration folders contain versioned validated data, never secrets.

## File responsibility catalog

The exact filenames may change by ADR, but every responsibility and owner below MUST exist once its prompt is complete.

| Planned file | Responsibility / public output | Dependencies | Owner | Create prompt |
|---|---|---|---|---:|
| `apps/web/src/app/layout.tsx` | authenticated application shell | UI, auth client | Web | 1 |
| `apps/api/src/composition/container.ts` | dependency composition only | all public domain ports | API | 1 |
| `apps/worker/src/consumers/index.ts` | idempotent job registration | platform jobs, services | Worker | 1 |
| `packages/platform/config/index.ts` | validated typed runtime config | schema library | Platform | 1 |
| `packages/platform/errors/index.ts` | error taxonomy/envelope | shared primitives | Platform | 1 |
| `packages/platform/logging/index.ts` | structured redacted logger | config | Platform | 1 |
| `packages/platform/auth/authorize.ts` | server-side capability/territory check | identity ports | Platform | 1/3 |
| `packages/platform/audit/audit-service.ts` | append-only audit port/service | database port | Platform | 1/3 |
| `packages/database/schema/*` | canonical persistence schema | DB tooling | Database | 2 |
| `packages/database/migrations/*` | forward schema history | schema | Database | 2+ |
| `packages/contracts/src/*.ts` | versioned API schemas | shared validation | Contracts | 2+ |
| `packages/organizations/domain/organization.ts` | organization invariants | primitives | Organizations | 2 |
| `packages/organizations/application/organization-service.ts` | organization commands/queries | repository/audit ports | Organizations | 2 |
| `packages/collection/application/import-service.ts` | dry-run/commit/revert imports | org, contracts, jobs | Collection | 4 |
| `packages/collection/domain/normalizers.ts` | pure canonical normalization | contracts | Collection | 4 |
| `packages/collection/domain/duplicate-matcher.ts` | ranked explainable candidates | organizations | Collection | 4 |
| `packages/evidence/domain/evidence.ts` | evidence invariants | primitives | Evidence | 3 |
| `packages/evidence/application/evidence-service.ts` | observation/evidence lifecycle | source repo, audit | Evidence | 3 |
| `packages/variables/domain/definition.ts` | variable definition contract | contracts | Variables | 3 |
| `packages/variables/application/value-service.ts` | propose/confirm/supersede value | evidence, audit | Variables | 3 |
| `packages/variables/application/completeness-service.ts` | purpose-weighted completeness/gaps | variable query port | Variables | 5 |
| `packages/scoring/domain/score-engine.ts` | pure deterministic calculation | score config/types | Scoring | 5 |
| `packages/scoring/application/scoring-service.ts` | snapshot, persist, explain, recalc | variables, evidence | Scoring | 5 |
| `config/scoring/*.yaml` | versioned formulas/rubrics | config schema | Scoring config | 5 |
| `packages/qualification/application/review-service.ts` | decisions, overrides, next actions | scores, workflow | Qualification | 6 |
| `packages/qualification/application/operational-state-service.ts` | parallel-dimension transitions + history | workflow config, audit, tasks | Qualification / Workflow | 2/6 |
| `config/workflows/prospect.yaml` | prospect_stage transition/guard declaration | workflow schema | Qualification | 6 |
| `config/workflows/parallel_states.yaml` | research/outreach/freshness vocabularies + guards | workflow schema | Qualification | 2/6 |
| `packages/consent/domain/permission.ts` | permission/suppression invariants + precedence | primitives | Consent | 2 |
| `packages/consent/application/consent-permission-service.ts` | assert/supersede/evaluate effective permission | evidence, audit | Consent | 2/8 |
| `packages/discovery/application/agenda-service.ts` | context-sensitive question selection | variables, scores | Discovery | 7 |
| `packages/discovery/application/answer-mapping-service.ts` | confirm mappings and trigger recalc | variables, scoring | Discovery | 7 |
| `config/discovery/*.yaml` | templates/questions/mappings | config schema | Discovery config | 7 |
| `packages/outreach/application/outreach-service.ts` | drafts, approvals, activities/responses; consent gate | qualification, tasks, consent | Outreach | 8 |
| `config/outreach/*.yaml` | versioned templates/sequences/tags | config schema | Outreach config | 8 |
| `packages/opportunities/application/opportunity-service.ts` | opportunity/opportunity_stage commands | operational-state, audit | Opportunities | 9 |
| `packages/reporting/application/dashboard-query-service.ts` | permission-scoped metrics/tables | domain query ports | Reporting | 10 |
| `packages/reporting/application/export-service.ts` | reproducible async exports; channel masking | jobs, auth, consent | Reporting | 10 |
| `apps/web/src/features/{prospects,research,scoring,discovery,outreach,opportunities,consent,dashboards}/*` | screens in UI catalog | contracts/UI | Web | 4–11 |
| `tests/e2e/phase1-happy-path.spec.ts` | full exit scenario | deployed test stack | QA | 12 |
| `tests/fixtures/golden-scores/*` | score regression fixtures | active definitions | QA/Scoring | 5/12 |
| `tests/fixtures/consent-precedence/*` | permission ruling fixtures | consent definitions | QA/Consent | 2/8 |

## Module contract template

Every new module records: purpose, owned entities, public commands/queries/events, dependencies, consumers, failure modes, authorization, configuration, telemetry, tests, and deferred expansion. Every public service records inputs, outputs, validation, side effects, transaction boundary, idempotency, and errors.

## Prompt ownership map

Prompts 1–12 are defined in the [Roadmap](../11-implementation/IMPLEMENTATION_ROADMAP.md). Prompt 1.5 resolved CONF-005/CONF-009 specification gaps; Prompt 2 MUST implement the resulting schema without inventing alternate state or consent models. A prompt may modify earlier foundation files only when necessary and must report it. Future work must not create dormant referral packages during Phase 1.

## Blueprint status protocol

Implementation tracks planned file/responsibility status as `planned`, `created`, `verified`, `superseded`, or `deferred`, ideally in generated inventory data. Documentation is not updated to claim `verified` until tests pass. Generated lockfiles and migrations are cataloged by responsibility rather than predicted one-by-one.

## Prompt 2 implementation status

Prompt 2 verified these planned responsibilities:

- `packages/database/schema/*` — **verified** for Prompt 2 canonical identity, organization/contact, territory/assignment, consent/suppression, operational-state, work, audit, and outbox tables.
- `packages/database/migrations/*` — **verified** for empty-schema migration, Drizzle journal idempotency, seed compatibility, hard-delete guards, append-only audit/transition guards, and consent immutability guards.
- `packages/organizations/src/domain/*`, `application/*`, `infrastructure/*` — **verified** for organization/contact repository ports, Postgres adapters, and create/update/archive service behavior.
- `packages/consent/src/domain/*`, `application/*`, `infrastructure/*` — **verified** for consent precedence, supersession, and Postgres adapter behavior.
- `packages/qualification/src/application/operational-state-service.ts` and `infrastructure/postgres-operational-state.ts` — **verified** for Prompt 2 parallel-state transition rules, transition history, and transaction-compatible adapters.
- `apps/api/src/app.ts` readiness behavior — **verified** for database ping contract.

Prompt 2 intentionally leaves collection, evidence, variables, scoring, discovery, outreach, opportunities, reporting, and UI feature packages in `planned` status for later prompts.

## Prompt 3 implementation status

Prompt 3 verified these planned responsibilities:

- `packages/database/schema/*` — **verified** for Prompt 3 source, evidence, research observation, confidence assessment, variable definition/version/value, variable-value evidence, and permission-evidence link schema.
- `packages/database/migrations/*` — **verified** for Prompt 3 migration journal order, empty-schema migration, seed compatibility, evidence material immutability, active variable definition version material immutability, and current-value uniqueness constraints.
- `packages/database/seeds/variables.ts` — **verified** for the 56-definition variable dictionary seed and sample evidence/value provenance fixtures.
- `packages/evidence/src/domain/*`, `application/*`, `infrastructure/*` — **verified** for source, evidence, confidence component, staleness, research observation, permission evidence link, and Postgres adapter behavior.
- `packages/variables/src/domain/*`, `application/*`, `infrastructure/*` — **verified** for definition versioning, typed value validation, value confirmation/supersession, contradiction, manual override lineage, evidence links, and Postgres adapter behavior.
- `packages/consent/src/application/consent-permission-service.ts` and `infrastructure/postgres-permission-repository.ts` — **verified** for additive evidence-record link support without changing Prompt 2 consent precedence.

Prompt 3 intentionally leaves collection/import, scoring/completeness, discovery, outreach, opportunities, reporting, and UI feature packages in `planned` status for later prompts. Confidence aggregation weights remain unresolved by design.

## Prompt 4 implementation status

Prompt 4 verified these planned responsibilities:

- `packages/database/schema/collection.ts` and migration `0003_melted_inertia.sql` — **verified** for import batches, import rows, import entity links, duplicate candidates, merge events, constraints, indexes, and hard-delete protection on collection tables.
- `packages/collection/src/domain/*` — **verified** for 52-field registry validation, deterministic normalization, explainable duplicate matching, import lifecycle transitions, merge planning, authorization, CSV security, and reversal eligibility.
- `packages/collection/src/application/*` — **verified** for upload, mapping, validation, dry-run, duplicate review, commit, retry, report, import reversal, merge, and merge reversal service contracts.
- `packages/collection/src/infrastructure/postgres-repositories.ts` — **verified** for import batch/row persistence, duplicate review metadata persistence, organization creation/archival, duplicate candidate lookup, merge event persistence, and supported Postgres merge child reassignment.
- `packages/platform` storage and malware scan ports — **verified** as collection upload dependencies.

Prompt 4 intentionally leaves API route/UI composition, dedicated `import_entity_links` writing, and DB-backed merge reverse movement in deferred status for later composition prompts.

## Prompt 5 implementation status

Prompt 5 created and draft-verified these planned responsibilities:

- `packages/database/schema/scoring.ts` and migration `0004_prompt_5_scoring_engine.sql` — **verified for draft engine existence** with completeness definitions/results, score definitions/versions/components, input snapshots, score results, score factors, recalculation jobs, activation guards, and append-only protections.
- `packages/scoring/src/domain/*` — **verified for draft engine existence** with transforms, completeness, confidence-policy gating, deterministic scoring, recommendation tie handling, and weight validation.
- `packages/scoring/src/application/*` — **verified for draft engine existence** with draft definition services, scoring/completeness services, recommendation service, override path, and recalculation service.
- `packages/scoring/src/infrastructure/*` — **verified for draft engine existence** with draft config loaders and Postgres repositories.
- `config/scoring/*.yaml`, `config/completeness/*.yaml`, and `tests/fixtures/golden-scores/*` — **verified for active Phase 1 baseline scoring** with approved score, confidence, recommendation, completeness definitions, and golden fixtures for nine score families.

Prompt 6 unblock records repository-owner approval for the Prompt 5 Phase 1 baseline. Score/completeness definitions are active with `approval_status=approved`; unapproved future calibration must publish a new version and still satisfy activation guards.

## Prompt 6 implementation status

Prompt 6 verified these planned responsibilities:

- `packages/database/schema/qualification.ts` and migration `0005_prompt_6_qualification_workflow.sql` — **verified** for qualification reviews, review-score links, conditions, append-only decisions, disqualification reason catalog, recommendation overrides, indexes, constraints, and hard-delete protection.
- `packages/qualification/src/domain/*` — **verified** for executable qualification decision and re-entry matrices, role capabilities, outcomes, and condition state vocabularies.
- `packages/qualification/src/application/*` — **verified** for review request/start/decide, condition resolve/waive, recommendation override preservation, disqualification catalog reads, transition coordination through `OperationalStateService`, re-entry policy enforcement, and review workspace aggregation.
- `packages/qualification/src/infrastructure/*` — **verified** for Postgres repositories, task port adapter, audit adapter, and outbox adapter.
- `packages/contracts/src/index.ts` — **verified** for qualification queue/request/start/decide, condition, re-entry, and transition-preview Zod contracts.

Prompt 6 intentionally defers Fastify route wiring and Next review pages because the current apps are foundation shells and do not yet contain vertical qualification UI slices.

## Prompt 10 implementation status

Prompt 10 verified these planned responsibilities:

- `packages/database/schema/reporting.ts` and migration `0009_prompt_10_reporting.sql` — **verified** for `saved_views`, `export_jobs`, indexes, idempotency keys, expiry timestamps, and dashboard key constraints.
- `packages/reporting/src/application/dashboard-query-service.ts` — **verified** for permission-scoped D1–D8 aggregate queries, paginated table queries, and saved-view restore composition.
- `packages/reporting/src/application/export-service.ts` — **verified** for sync/async export lifecycle, channel redaction, metadata reproduction, and expiry.
- `packages/reporting/src/application/metric-catalog-service.ts` — **verified** for YAML metric catalog loading (D1–D8).
- `packages/reporting/src/application/saved-view-service.ts` — **verified** for saved view CRUD/restore with audit/outbox events.
- `config/reporting/metrics.v1.yaml` — **verified** for frozen Phase 1 metric definitions.

Prompt 10 intentionally defers dashboard UI screens, chart widgets, and global empty/loading/error UX to Prompt 11.

