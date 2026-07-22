# Repository Blueprint

**Version:** 1.1.0  
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

