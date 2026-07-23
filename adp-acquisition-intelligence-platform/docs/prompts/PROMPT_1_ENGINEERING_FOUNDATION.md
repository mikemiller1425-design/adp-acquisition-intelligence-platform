# Prompt 1 — Engineering Foundation

**Phase:** Phase 1  
**Prompt:** 1  
**Prerequisites:** Prompt 0 readiness artifacts  
**Next:** Prompt 1.5 (spec resolution) then Prompt 2 (canonical data model)

## Objective

Establish the modular-monolith engineering foundation: monorepo tooling, web/API/worker shells, platform ports, CI, local Postgres Compose, and accepted ADRs for DEC-001–012.

## Authoritative documents

- Technical Architecture
- Repository Blueprint
- Implementation Constitution
- Architecture Review Checklist
- Testing Master Plan
- Implementation Decision Register / ADRs

## In scope

- apps/web, apps/api, apps/worker
- packages/contracts, packages/database, packages/platform
- Tooling, CI, Compose, health endpoints, foundation tests
- ADR-001…ADR-012

## Out of scope

- Business schemas/migrations
- Scoring, discovery, outreach, opportunities, dashboards
- Referral / Phase 2 modules
- Autonomous outbound sending

## Acceptance

Frozen install, format, lint, typecheck, dependency checks, unit tests, production builds, health smokes, docs/YAML validation, architecture review without critical/high findings.
