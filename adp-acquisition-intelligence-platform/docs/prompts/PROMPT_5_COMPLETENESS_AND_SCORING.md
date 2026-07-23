# Prompt 5 — Completeness and Scoring

**Status:** Engine implemented; Phase 1 baseline approved for Prompt 6 entry
**Branch:** `cursor/prompt-5-completeness-scoring-dd2b`
**Production activation:** Active Phase 1 baseline approved by repository owner via Prompt 6 unblock instruction 2026-07-22

## Scope

Prompt 5 adds the draft completeness and scoring engine package surface needed for later qualification, discovery, reporting, and review composition:

- Purpose-specific completeness calculation that keeps `known`, `unknown`, `not_applicable`, `withheld`, `contradicted`, and `stale` distinct.
- Deterministic score calculation for the required draft families: acquisition fit, wholesale fit, CAS maturity, direct payroll opportunity, influence, urgency, revenue potential, accessibility, and data confidence.
- Draft transform functions for ordinal, boolean, banded numeric/currency/range, percentage, enum, recency, and identity inputs.
- Confidence aggregation behavior that returns `null` outside `allowDraft` mode when a policy is unapproved; Phase 1 baseline policy is approved.
- Immutable score input snapshots, score results, score factors, override metadata, and recalculation job persistence.
- Active Phase 1 YAML configuration and golden replay fixtures.

Prompt 5 originally did **not** approve score definitions or start Prompt 6 qualification/workflow behavior. Prompt 6 unblock later recorded repository-owner Phase 1 baseline approval and activated the definitions for Prompt 6 entry.

## Implemented package surface

Primary package: `packages/scoring`.

Key modules:

- `domain/completeness.ts` — weighted completeness and gap classification without zero imputation.
- `domain/transforms.ts` — pure value-to-0-100 transforms.
- `domain/scoring-engine.ts` — deterministic score, tier, status, factor, confidence, completeness, and recommendation output.
- `domain/confidence-policy.ts` — draft confidence policy guard; aggregate is withheld unless the policy is approved or draft mode is explicit.
- `domain/recommendation-policy.ts` — deterministic recommendation and replay tie handling.
- `application/scoring-service.ts` — definition lookup, variable input loading, calculation, snapshots, persistence, and previous-result chaining.
- `application/definition-services.ts` — draft creation and explicit approval-metadata guard before publish.
- `application/recalculation-service.ts` — outbox-event-to-score-recalculation queue contract and worker handler registration.
- `infrastructure/config-loaders.ts` — YAML loaders that preserve draft or active lifecycle metadata.
- `infrastructure/postgres-repositories.ts` — Postgres repositories for definitions, inputs, results, overrides, and recalculation jobs.

Supporting files:

- `config/scoring/*.yaml` and `config/completeness/*.yaml` — active Phase 1 baseline score, confidence, recommendation, and completeness definitions.
- `tests/fixtures/golden-scores/*.json` — replay fixtures for all nine score families.
- `packages/database/migrations/0004_prompt_5_scoring_engine.sql` — Prompt 5 scoring/completeness persistence.
- `packages/database/seeds/scoring.ts` — seed definitions with active/approved lifecycle and approval metadata.

## Activation boundary

Prompt 6 unblock approves the Prompt 5 baseline for Phase 1 and activates score/completeness definitions as `approval_status=approved`.

The implementation still blocks active use of future versions until:

1. owner approval evidence exists for the new version,
2. SCR-002 is updated with approval evidence when applicable,
3. conflict-register impacts are resolved,
4. Approved definitions have replay/golden evidence for the approved version.

Unapproved draft definitions may calculate only with explicit `allowDraft` intent for engineering validation.

## Verification evidence

Prompt 5 automated coverage includes:

- Transform family boundaries, defaults, validation failures, and clamping.
- Completeness handling for explicit zero/false values vs unknown, N/A, withheld, contradicted, and stale values.
- Confidence policy behavior: `null` aggregate outside `allowDraft` for unapproved policies.
- Draft activation guards in service and PostgreSQL constraints.
- Golden replay across all nine required score families.
- Property-style checks for ordering, determinism, monotonic identity behavior, and 0-100 bounds.
- Recalculation job idempotency and append-only result/snapshot/factor persistence.
- Batch replay smoke test to preserve a future performance-baseline hook without claiming a production target-volume result.

## Deferred composition

The package exposes domain/application/infrastructure boundaries for later prompts. Prompt 5 intentionally defers:

- Prompt 6 qualification review screens, workflow transitions, review outcomes, and next tasks.
- Discovery answer mapping and rescoring UI.
- Outreach consent-gated actions.
- Dashboards and exports.
- Production score activation and business sign-off.

