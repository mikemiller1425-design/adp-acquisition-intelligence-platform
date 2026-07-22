# Prompt 5 — Completeness and Scoring

**Status:** Draft engine implemented and locally verifiable  
**Branch:** `cursor/prompt-5-completeness-scoring-dd2b`  
**Production activation:** Blocked; definitions are `draft_unapproved` and inactive

## Scope

Prompt 5 adds the draft completeness and scoring engine package surface needed for later qualification, discovery, reporting, and review composition:

- Purpose-specific completeness calculation that keeps `known`, `unknown`, `not_applicable`, `withheld`, `contradicted`, and `stale` distinct.
- Deterministic score calculation for the required draft families: acquisition fit, wholesale fit, CAS maturity, direct payroll opportunity, influence, urgency, revenue potential, accessibility, and data confidence.
- Draft transform functions for ordinal, boolean, banded numeric/currency/range, percentage, enum, recency, and identity inputs.
- Draft confidence aggregation behavior that returns `null` outside `allowDraft` mode when the policy is unapproved.
- Immutable score input snapshots, score results, score factors, override metadata, and recalculation job persistence.
- Draft YAML configuration and golden replay fixtures.

Prompt 5 does **not** approve score definitions, activate production scoring, or start Prompt 6 qualification/workflow behavior.

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
- `infrastructure/config-loaders.ts` — draft YAML loaders.
- `infrastructure/postgres-repositories.ts` — Postgres repositories for definitions, inputs, results, overrides, and recalculation jobs.

Supporting files:

- `config/scoring/*.yaml` — draft, inactive score, confidence, and recommendation definitions.
- `tests/fixtures/golden-scores/*.json` — replay fixtures for all nine score families.
- `packages/database/migrations/0004_prompt_5_scoring_engine.sql` — Prompt 5 scoring/completeness persistence.
- `packages/database/seeds/scoring.ts` — draft seed definitions; no active definitions are seeded.

## Draft-only activation boundary

All Prompt 5 score and completeness definitions remain `draft_unapproved`.

The implementation intentionally blocks active use until:

1. `business_scoring_owner` approves score mappings, transforms, weights, tiers, completeness thresholds, confidence aggregation, and recommendation policy.
2. SCR-002 is updated with approval evidence.
3. CONF-007 is resolved in the conflict register.
4. Approved definitions have replay/golden evidence for the approved version.

Until those steps happen, services may calculate drafts only with explicit `allowDraft` intent for engineering validation.

## Verification evidence

Prompt 5 automated coverage includes:

- Transform family boundaries, defaults, validation failures, and clamping.
- Completeness handling for explicit zero/false values vs unknown, N/A, withheld, contradicted, and stale values.
- Draft confidence policy behavior: `null` aggregate outside `allowDraft`.
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

