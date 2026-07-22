# Implementation Constitution

**Version:** 1.0.0  
**Applies to:** Every implementation prompt and repository change

## Authority

Read the canonical documents before changing code. If requested work conflicts with them, stop that conflicting portion, describe the conflict and impact, and propose an ADR/spec update. Never silently invent business behavior. Security defects and data-loss risks may be fixed immediately within scope and documented.

## Universal lifecycle

`Understand → inspect → verify specification → analyze dependencies → plan → implement bounded scope → self-audit → test → repair → document → handoff`

The implementer MUST inspect the actual repository and current tests before planning. Plans identify files, contracts, migrations, tests, risks, and rollback/compatibility. Implementation does not reach into later prompts merely for convenience.

## Dependency law

UI depends on contracts; applications depend on domain ports; infrastructure implements ports; domains depend only on shared primitives. Cross-context access uses public interfaces. No UI business logic, direct persistence from routes/components, circular imports, cross-domain repository calls, or shared “misc utilities” dumping ground.

## Data and behavior rules

- Unknown never equals zero or false.
- Published definitions, evidence snapshots, score results, and audit history are immutable.
- Migrations are versioned and production-safe; destructive migration requires explicit approval and recovery plan.
- Business values reside in validated versioned configuration.
- Consequential writes are authorized, validated, transactional, and audited.
- Retryable commands are idempotent.
- PII, secrets, source excerpts, and exports follow minimization and retention policy.
- Phase 1 outbound content requires human approval and no autonomous send integration.

## Engineering rules

Always use typed public interfaces, centralized configuration/logging/errors, stable error codes, accessible UI patterns, structured telemetry, and test fixtures representative of unknown/conflicted/stale data. Reuse a sound abstraction only when semantics match; do not over-generalize unrelated domains.

Never duplicate business logic, hardcode environment or score values, bypass services/authorization, weaken tests to obtain green status, swallow errors, log secrets, commit generated credentials, add speculative Phase 2 behavior, or claim completion with failing required checks.

## Change control

Public API/schema changes include compatibility analysis. Score changes create a new version and golden replay. Workflow changes update state-machine tests. Database changes update schema docs/migrations and backup considerations. Architecture changes create an ADR. Behavior changes update the functional spec and exit contract if acceptance changes.

## Universal prompt header

Each implementation prompt states current phase/prompt, completed prerequisites, objective, authoritative documents, in/out of scope, dependencies, acceptance tests, and next prompt. It instructs the implementer to inspect first and report conflicts.

## Universal exit checklist

Before declaring a prompt complete, run the evidence-based [Architecture Review Checklist](16_ARCHITECTURE_REVIEW_CHECKLIST.md) against the actual diff and affected dependency graph. Critical and high findings block completion; deferred medium and low findings require an owner, rationale, and target.

### Architecture

- Structure and public boundaries comply; no circular dependency or forbidden import.
- New interfaces document inputs, outputs, side effects, failures, authorization, and consumers.

### Quality and configuration

- No duplicated/dead code or hardcoded business/environment values.
- Formatting, lint, typecheck, dependency checks, and build pass.

### Data/security

- Migrations apply to empty and prior schema; integrity and auditability remain.
- Authorization, validation, redaction, retention, and concurrency are tested where relevant.

### Tests

- New unit/integration/contract/e2e tests cover happy, boundary, error, unknown, permission, and retry paths as relevant.
- Existing required suites stay green and coverage does not regress without approved rationale.

### Scope/docs/handoff

- Only current scope is implemented; deferrals are explicit.
- Canonical docs, ADRs, repository inventory, and exit checklist evidence are updated.
- Report added/modified/removed files, migrations, commands/results, limitations, deviations, and next-prompt readiness.

## Completion language

Use `complete` only when every prompt-specific required acceptance criterion passes. Otherwise use `partially complete` or `blocked` and name the failed evidence. A clean working tree is desirable but unrelated user changes must never be discarded.
