# Implementation Decision Register

**Version:** 1.0.0  
**Status:** Open — Prompt 1 ADR backlog  
**Created:** 2026-07-22T18:33:53Z  

Decisions that must be resolved before or during Prompt 1.  
**Rule:** Do not invent business behavior. Stack choices may proceed via ADR when evidence from the implementation environment exists. Business weights, motion policy, and qualification semantics require product/scoring owners (see conflict register).

Status: `open` | `decided` | `deferred` (only if an authoritative doc allows deferral past Prompt 1)

---

## DEC-001 — Technology stack versions

| Field | Value |
|---|---|
| Topic | Next.js / React / Node.js / TypeScript versions |
| Why Prompt 1 | Foundation scaffolds, CI, and typecheck require pinned versions |
| Evidence in specs | Tech Arch reference stack; versions deferred to Prompt 1 ADR |
| Options (illustrative, not chosen) | Current LTS Node; Next App Router vs Pages; React 18/19 |
| Constraint | Must not alter business semantics |
| Required approver | engineering_owner |
| Deadline | Prompt 1 |
| Status | open |
| ADR required | yes |

---

## DEC-002 — Monorepo tooling

| Field | Value |
|---|---|
| Topic | Package manager + task runner + workspace layout |
| Why Prompt 1 | Blueprint assumes apps/packages workspaces |
| Evidence | Repository Blueprint tree; Tech Arch monorepo |
| Options | pnpm+turbo, npm workspaces, yarn+nx, etc. |
| Constraint | Enforce dependency-direction lint (Constitution) |
| Required approver | engineering_owner |
| Deadline | Prompt 1 |
| Status | open |
| ADR required | yes |

---

## DEC-003 — Single-tenant versus multi-tenant

| Field | Value |
|---|---|
| Topic | Tenant isolation model for Phase 1 |
| Why Prompt 1 | Database Arch: decision cannot be postponed beyond first schema migration; Prompt 1 must record it |
| Evidence | Database Arch “Tenant and scope decision”; Entity Catalog “tenant/scope”; Tech Arch logs “actor/tenant when safe” |
| Options | (A) Single-tenant deployment per customer; (B) Multi-tenant with `tenant_id` on all business tables |
| Constraint | If (B): composite uniqueness, RLS/tests, job tenant scope |
| Business impact | Organization uniqueness invariant; authz design |
| Required approver | engineering_owner + product_owner |
| Deadline | **Before Prompt 2 migrations** (decide in Prompt 1) |
| Status | open |
| ADR required | yes — **blocking for Prompt 2** |

---

## DEC-004 — Identity provider

| Field | Value |
|---|---|
| Topic | Authentication IdP / session mechanism |
| Why Prompt 1 | Auth scaffold and security baseline |
| Evidence | Tech Arch deferred decisions; Vision roles |
| Options | OIDC provider (Auth0, Cognito, Azure AD, Keycloak), Magical links, enterprise SSO-only, etc. |
| Constraint | Server-side sessions/JWT validation; CSRF where applicable; no secrets in repo |
| Required approver | engineering_owner + security_privacy_owner |
| Deadline | Prompt 1 (provider); full role matrix enforced by Prompt 2–6 |
| Status | open |
| ADR required | yes |

---

## DEC-005 — Database ORM / query layer

| Field | Value |
|---|---|
| Topic | Prisma or equivalent migrations + repository implementation |
| Why Prompt 1 | Tooling and package boundaries; Prompt 2 uses it heavily |
| Evidence | Tech Arch “Prisma or equivalent” |
| Options | Prisma, Drizzle, Knex+SQL, raw `pg` |
| Constraint | Forward-only prod migrations; repositories behind ports |
| Required approver | engineering_owner |
| Deadline | Prompt 1 |
| Status | open |
| ADR required | yes |

---

## DEC-006 — Job queue

| Field | Value |
|---|---|
| Topic | Durable async job backend |
| Why Prompt 1 | Worker scaffold; imports/recalc/exports later |
| Evidence | Tech Arch job dispatcher; Database `job_runs` / outbox |
| Options | Postgres-backed queue, Redis/BullMQ, SQS, Cloud Tasks |
| Constraint | Idempotent consumers; transactional outbox compatibility |
| Required approver | engineering_owner |
| Deadline | Prompt 1 |
| Status | open |
| ADR required | yes |

---

## DEC-007 — Object storage

| Field | Value |
|---|---|
| Topic | Authorized import artifact / export artifact storage |
| Why Prompt 1 | Platform config + security seams |
| Evidence | Tech Arch object storage for import artifacts; ExportService |
| Options | S3-compatible, GCS, Azure Blob, local filesystem (dev only) |
| Constraint | Authz on upload/download; malware scanning seam; no public buckets by default |
| Required approver | engineering_owner + security_privacy_owner |
| Deadline | Prompt 1 |
| Status | open |
| ADR required | yes |

---

## DEC-008 — Observability

| Field | Value |
|---|---|
| Topic | Logs/metrics/traces vendor and OpenTelemetry wiring |
| Why Prompt 1 | Central logging/telemetry scaffolds |
| Evidence | Tech Arch OpenTelemetry-compatible telemetry |
| Options | OTel Collector + vendor; cloud-native APM only; self-hosted |
| Constraint | PII/secret redaction; correlation IDs |
| Required approver | engineering_owner |
| Deadline | Prompt 1 |
| Status | open |
| ADR required | yes |

---

## DEC-009 — Hosting environment

| Field | Value |
|---|---|
| Topic | Where web/API/worker/Postgres run |
| Why Prompt 1 | Health checks, networking, secrets, deploy scripts |
| Evidence | Tech Arch deferred hosting provider |
| Options | Container platform, PaaS, VM, hybrid |
| Constraint | Separate non-prod/prod; encrypted data at rest |
| Required approver | engineering_owner |
| Deadline | Prompt 1 (target env); prod harden Prompt 12 |
| Status | open |
| ADR required | yes |

---

## DEC-010 — Deployment model

| Field | Value |
|---|---|
| Topic | CI/CD, migration apply order, blue/green or rolling |
| Why Prompt 1 | Repo tooling + release path evidence FND-* |
| Evidence | Testing Plan migration/recovery; Constitution change control |
| Options | GitHub Actions + containers; etc. |
| Constraint | App rollback without assuming schema rollback; concurrent deploy compatibility |
| Required approver | engineering_owner |
| Deadline | Prompt 1 baseline; Prompt 12 production path |
| Status | open |
| ADR required | yes |

---

## DEC-011 — Backup and recovery objectives

| Field | Value |
|---|---|
| Topic | RPO / RTO, backup encryption, restore rehearsal cadence |
| Why Prompt 1 | Operational assumptions affect platform runbooks and env design; Exit DAT-005 |
| Evidence | Database Arch backup section; Testing restore; Tech Arch reliability |
| Options | Numeric RPO/RTO set by ops (e.g., evidence-based from hosting) |
| Constraint | Production release blocked until restore rehearsed (Prompt 12) |
| Required approver | engineering_owner + security_privacy_owner |
| Deadline | Objectives in Prompt 1; rehearsal Prompt 12 |
| Status | open |
| ADR required | yes |

---

## DEC-012 — Data-retention policy

| Field | Value |
|---|---|
| Topic | Retention windows for PII, evidence excerpts, exports, audit, import files; hard-delete process |
| Why Prompt 1 | Security/privacy baseline; export expiry; Constitution minimization |
| Evidence | Functional §4 archive-default; Tech Arch retention; Database hard deletion; Dashboard export expiry |
| Options | Policy durations must come from legal/privacy owners—not invented by engineering |
| Constraint | Export expiry TTL; audit append-only vs privacy deletion conflict needs explicit procedure |
| Required approver | security_privacy_owner + product_owner |
| Deadline | Policy baselines Prompt 1; enforcement tests by relevant prompts; full proof Prompt 12 |
| Status | open |
| ADR required | yes (may reference external policy doc) |

---

## Related decisions explicitly NOT for silent Prompt 1 resolution

| ID | Topic | Owner | Earliest safe prompt |
|---|---|---|---|
| BUS-001 | Score weights/rubrics approval | business_scoring_owner | 5 (activation), evidence SCR-002 |
| BUS-002 | Completeness purpose weights | business_scoring_owner | 5 |
| BUS-003 | CONF-002 conditionally_qualified | product_owner | before 6 |
| BUS-004 | Opportunity stage final labels | product_owner | before 9 |
| BUS-005 | Secondary motion proximity threshold | business_scoring_owner | 5 |
| BUS-006 | Confidence aggregation formula parameters | business_scoring_owner | 3–5 |
| ENG-001 | CONF-005 parallel state persistence design | engineering + product | before 2 |
| ENG-002 | CONF-009 opt-out entity | product + security | before 2 preferred / before 8 hard |

---

## Decision log template (for Prompt 1 ADRs)

```markdown
# ADR-XXX: Title
- Status: proposed|accepted|superseded
- Date: UTC
- Decides: DEC-00N
- Context: …
- Decision: …
- Alternatives considered: …
- Consequences: schema, authz, ops, tests
- Spec updates required: list canonical docs (same change set)
```
