# Phase 1 Technical Architecture

**Version:** 1.0.0  
**Status:** Canonical engineering architecture

## Architecture style

Use a modular monolith in a TypeScript monorepo for Phase 1: a web application, API, and background worker sharing versioned packages and one relational database. This minimizes distributed-system overhead while enforcing domain boundaries that can later be extracted. The stack MAY be adjusted by ADR, but the contracts and dependency rules remain binding.

Reference stack: Next.js/React web, Node.js API/worker, PostgreSQL, Prisma or equivalent migrations, Zod or equivalent runtime schemas, a durable job queue, object storage for authorized import artifacts, and OpenTelemetry-compatible telemetry.

## Runtime topology

```text
Browser → Web/BFF → API application services → domain services → repositories → PostgreSQL
                              ↓                  ↓
                         job dispatcher → Worker → exports/recalculation/import jobs
```

No UI component accesses persistence. Background jobs invoke the same application services as synchronous requests and are idempotent.

## Bounded contexts

- Identity & Access
- Organizations & Contacts
- Collection & Identity Resolution
- Evidence & Research
- Variables & Completeness
- Scoring
- Qualification & Workflow
- Discovery
- Outreach
- Opportunities
- Reporting & Exports
- Audit & Shared Platform

Each context exposes public types and application commands/queries. Internal models and repositories are not imported by another context.

## Dependency direction

```text
apps/web → API client/contracts
apps/api, apps/worker → application services
application services → domain ports
domain → shared primitives only
infrastructure → implements domain ports
```

Forbidden: domain-to-framework imports, UI-to-database calls, repository-to-service calls, cross-context table mutation, cyclic package imports, and business values embedded in components.

## APIs and contracts

Use resource-oriented endpoints or an equivalently typed RPC layer. Commands are explicit for merges, transitions, answer confirmation, recalculation, and import commit. List endpoints support cursor pagination, validated filtering/sorting, field allowlists, and stable response envelopes. Mutations accept idempotency keys where retries are plausible and concurrency versions for contested records.

Representative services:

| Service | Inputs | Outputs | Side effects / failures |
|---|---|---|---|
| ImportService | file, mapping, actor, dry-run flag | validation preview or committed batch | creates normalized records on commit; row errors, policy rejection |
| IdentityResolutionService | organization candidate | ranked duplicate candidates | no merge side effect; ambiguous result |
| EvidenceService | claim, source, context | evidence/observation | audit write; invalid locator/policy |
| VariableService | typed proposal + evidence | current/superseded values | affected-score event; conflict/validation |
| CompletenessService | subject + purpose/version | breakdown and gaps | pure calculation |
| ScoringService | subject + score version | immutable result/explanation | snapshot persistence; insufficient data |
| QualificationService | evidence, scores, decision | review and transition | task/audit; transition denied |
| DiscoveryService | context/session/answers | agenda, mappings, deltas | variable updates after confirmation |
| OutreachService | sequence/recipient/activity | draft/activity/response | task and metric events; opt-out denial |
| OpportunityService | qualified subject + motion | opportunity/stage | stage history; ownership conflict |
| ExportService | view/query + format | job and artifact | authorization snapshot; size failure |

## Cross-cutting systems

- Central configuration with schema validation at startup; secrets only through secret management.
- Structured logs with correlation ID, actor/tenant when safe, event name, severity, and redaction.
- Append-only audit records for consequential reads/exports and all writes.
- Transactional outbox for domain events that drive jobs; at-least-once consumers must be idempotent.
- Health/readiness endpoints distinguish process health, database, migrations, and job dependency status.
- Feature flags default off for incomplete capabilities.

## Security and data governance

Apply least privilege, server-side authorization, territory scoping, secure session handling, CSRF protections where applicable, rate limits, parameterized queries, file type/size validation, malware scanning integration seam, encryption in transit/at rest, PII minimization, retention policy, export authorization, and secrets redaction. Record consent/opt-out constraints used by outreach. Threat modeling is required before release.

## Reliability and performance targets

- Transactional writes either fully commit or fail.
- Import/recalculation/export jobs are resumable or safely restartable.
- Standard tables target p95 under 2 seconds for supported filters at agreed data volume; long work is asynchronous.
- Dashboard freshness is displayed; cached aggregates MUST identify their as-of time.
- Backups and restore rehearsal are operational release requirements.

## Decisions deferred to Prompt 1

Exact framework versions, hosting provider, identity provider, queue implementation, object store, monorepo tooling, and observability vendor require ADRs based on the implementation environment. They MUST not alter business semantics.

See [Repository Blueprint](../06-repository/REPOSITORY_BLUEPRINT.md), [Database Architecture](../05-data/DATABASE_ARCHITECTURE.md), and [Implementation Constitution](../11-implementation/IMPLEMENTATION_CONSTITUTION.md).

