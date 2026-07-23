# Prompt 2: Canonical Data Model

**Status:** Implemented with Prompt 2 completion tests  
**Branch:** `cursor/prompt-2-canonical-data-model-dd2b`  
**Baseline inspected:** `9720dcce337e2c8b5bfc1cb9ba20aeee2b7d9922`

## Implemented scope

Prompt 2 establishes the canonical persistence and domain-service foundation for Phase 1:

- `@adp/database`
  - Drizzle/Postgres schema modules for identity, organizations, contacts, territories, assignments, operational state transitions, consent/suppression, work objects, audit events, and outbox events.
  - Forward migrations:
    - `0000_parched_electro.sql` creates Prompt 2 canonical tables, enums, constraints, foreign keys, and indexes.
    - `0001_integrity_guards.sql` adds database safeguards for forbidden hard deletes, append-only audit/transition rows, and immutable consent material fields.
  - Seed script for synthetic users, organizations, permissions, and pending outbox rows.
  - Test DB helpers for migration/reset/client creation and advisory locking across package integration suites.
- `@adp/organizations`
  - Organization/contact/territory/work repository ports and Postgres adapters.
  - Application services for create/update/archive behavior and service-level business-rule enforcement.
- `@adp/consent`
  - Permission, organization restriction, and suppression domain semantics.
  - Consent application service with precedence: global suppression, organization restriction, channel suppression, contact permission, unknown.
  - Postgres adapter with supersession-based correction handling.
- `@adp/qualification`
  - Operational parallel-state transition rules and application service.
  - Postgres adapters for organization state updates and append-only transition history.
- `apps/api`
  - `/ready` contract test proving readiness depends on database ping.

## Migration tables

The Prompt 2 migration creates these public tables:

`account_assignments`, `audit_events`, `outbox_events`, `contact_channel_permissions`, `organization_communication_restrictions`, `suppression_entries`, `permissions`, `role_permissions`, `roles`, `user_roles`, `users`, `operational_state_transitions`, `contact_roles`, `contacts`, `organization_aliases`, `organization_locations`, `organization_roles`, `organizations`, `territories`, `notes`, `taggings`, `tags`, `tasks`.

## Gap analysis against required tests

| Required verification | Evidence added or confirmed |
|---|---|
| Core repositories create/read/update/archive | `packages/organizations/src/__tests__/organizations.integration.test.ts` covers Postgres organization/contact repositories through services. |
| Forbidden hard deletion rejected | `packages/database/src/__tests__/database.integration.test.ts` verifies the hard-delete trigger on canonical rows. |
| State update + transition history atomic | `packages/qualification/src/__tests__/operational-state.integration.test.ts` wraps state, transition, audit, and outbox writes in one transaction and verifies committed rows. |
| Failed transition rolls back | `operational-state.integration.test.ts` forces transition insert failure and proves organization state/version remain unchanged. |
| Permission records immutable; corrections via supersession | `packages/consent/src/__tests__/consent.integration.test.ts` verifies supersession and blocks material rewrites. |
| Global suppression overrides allowed contact permission | `consent.integration.test.ts`. |
| Org restriction overrides contact permission | `consent.integration.test.ts`. |
| Expired permission inactive | `consent.integration.test.ts`. |
| Conflicting records resolve restrictively | `consent.integration.test.ts`. |
| Unauthorized repository access cannot bypass application service enforcement | `organizations.integration.test.ts` documents that persistence adapters do not authorize and proves the service rejects contact creation on archived organizations. |
| Audit append-only | `database.integration.test.ts` verifies audit update/delete rejection. |
| Outbox shares business transaction | `operational-state.integration.test.ts` forces an outbox failure after insert and proves state, transition, audit, and outbox rollback together. |
| Repository port behavior | `organizations.integration.test.ts`, existing unit tests, and Postgres adapter tests. |
| Database-error translation | Existing `database.integration.test.ts` constraint translation coverage retained. |
| Transaction behavior | `database.integration.test.ts` verifies commit/rollback semantics. |
| Health/readiness response (DB ping) | `database.integration.test.ts` covers `checkDatabaseHealth`; `apps/api/src/app.test.ts` covers `/ready`. |

## Boundaries and non-goals

- Prompt 3+ evidence, variables, scoring, discovery, outreach, opportunity, dashboard, and UI workflows were not implemented.
- Repository adapters remain persistence ports. They do not perform authorization or full business-rule enforcement; application services enforce Prompt 2 business behavior, and future API/job composition must call services.
- Phase 1 remains single-tenant. No `tenant_id` or referral-partner workflow was introduced.
