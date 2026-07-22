# Implementation Decision Register

**Version:** 1.1.0  
**Status:** DEC-001–012 resolved by Prompt 1 ADRs  
**Created:** 2026-07-22T18:33:53Z  
**Updated:** 2026-07-22 (Prompt 1)

Decisions resolved during Prompt 1. Business weights and unrelated CONF-* items remain outside this register’s ADR set.

Status: `open` | `decided` | `deferred`

---

## DEC-001 — Technology stack versions

| Field | Value |
|---|---|
| Status | **decided** |
| ADR | [ADR-001](../adr/ADR-001-technology-stack-versions.md) |
| Decision | Node 24 LTS, TypeScript 5.9, Next.js 16 App Router, React 19, Fastify 5 |

## DEC-002 — Monorepo tooling

| Field | Value |
|---|---|
| Status | **decided** |
| ADR | [ADR-002](../adr/ADR-002-monorepo-tooling.md) |
| Decision | pnpm 11 workspaces + Turborepo 2 with dependency-cruiser enforcement |

## DEC-003 — Single-tenant versus multi-tenant

| Field | Value |
|---|---|
| Status | **decided** |
| ADR | [ADR-003](../adr/ADR-003-single-tenant-deployment.md) |
| Decision | Phase 1 is **single-tenant**. Territories/ownership are authz scopes, not tenants. No speculative `tenant_id` in Prompt 2. |

## DEC-004 — Identity provider

| Field | Value |
|---|---|
| Status | **decided** |
| ADR | [ADR-004](../adr/ADR-004-identity-provider.md) |
| Decision | Microsoft Entra ID via OIDC behind auth ports |

## DEC-005 — Database ORM / query layer

| Field | Value |
|---|---|
| Status | **decided** |
| ADR | [ADR-005](../adr/ADR-005-database-orm.md) |
| Decision | PostgreSQL 17 + Drizzle beginning Prompt 2; Prompt 1 connection seam only |

## DEC-006 — Job queue

| Field | Value |
|---|---|
| Status | **decided** |
| ADR | [ADR-006](../adr/ADR-006-job-queue.md) |
| Decision | PostgreSQL-backed pg-boss with outbox compatibility; Prompt 1 port + in-memory scaffold |

## DEC-007 — Object storage

| Field | Value |
|---|---|
| Status | **decided** |
| ADR | [ADR-007](../adr/ADR-007-object-storage.md) |
| Decision | Private Amazon S3 in production; S3-compatible adapter in development |

## DEC-008 — Observability

| Field | Value |
|---|---|
| Status | **decided** |
| ADR | [ADR-008](../adr/ADR-008-observability.md) |
| Decision | Pino structured redacted logging + OpenTelemetry-compatible telemetry |

## DEC-009 — Hosting environment

| Field | Value |
|---|---|
| Status | **decided** |
| ADR | [ADR-009](../adr/ADR-009-hosting-environment.md) |
| Decision | AWS ECS Fargate, RDS Multi-AZ, S3, Secrets Manager |

## DEC-010 — Deployment model

| Field | Value |
|---|---|
| Status | **decided** |
| ADR | [ADR-010](../adr/ADR-010-deployment-model.md) |
| Decision | GitHub Actions, immutable images, forward migrations, health-gated rolling deploy |

## DEC-011 — Backup and recovery objectives

| Field | Value |
|---|---|
| Status | **decided** |
| ADR | [ADR-011](../adr/ADR-011-backup-recovery-objectives.md) |
| Decision | RPO ≤ 15 minutes; RTO ≤ 4 hours; quarterly restore rehearsal |

## DEC-012 — Data-retention policy

| Field | Value |
|---|---|
| Status | **decided** |
| ADR | [ADR-012](../adr/ADR-012-data-retention-policy.md) |
| Decision | Central defaults (exports 24h; imports/logs/jobs 30d; business/audit 7y) requiring legal/privacy validation before production; no legal-compliance claim |

---

## Related decisions still outside Prompt 1 ADR set

| ID | Topic | Owner | Earliest safe prompt |
|---|---|---|---|
| BUS-001 | Score weights/rubrics approval | business_scoring_owner | 5 |
| BUS-002 | Completeness purpose weights | business_scoring_owner | 5 |
| BUS-003 | CONF-002 conditionally_qualified | product_owner | before 6 |
| ENG-001 | CONF-005 parallel state persistence | product + engineering | Prompt 1.5 |
| ENG-002 | CONF-009 opt-out entity | product + security | Prompt 1.5 |
