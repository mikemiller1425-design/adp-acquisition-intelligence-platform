# ADR-003: Single-tenant Phase 1 deployment

- Status: Accepted
- Date: 2026-07-22
- Decides: DEC-003

## Context
Database Architecture requires a tenant decision before the first business schema migration.

## Decision
Phase 1 is a **single-tenant internal deployment**. Territories and account ownership are authorization scopes, not tenants. Prompt 2 MUST NOT add speculative `tenant_id` columns. A future multi-tenant conversion requires a new ADR and migration plan.

## Consequences
Uniqueness and authorization are scoped by deployment instance plus territory/ownership rules. Multi-tenant row isolation is out of Phase 1 scope.
