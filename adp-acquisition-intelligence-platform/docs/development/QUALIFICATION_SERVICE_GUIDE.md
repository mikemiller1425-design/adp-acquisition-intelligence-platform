# Qualification Service Guide

## Package

Prompt 6 extends `packages/qualification` alongside the existing Prompt 2 `OperationalStateService`.

## Primary services

- `QualificationReviewService`
  - `request` creates pending reviews and links immutable score results.
  - `start` moves a pending review to `in_review` with optimistic concurrency.
  - `decide` validates the executable decision matrix, inserts append-only decision history, creates blocking conditions/tasks when required, and delegates prospect-stage movement to `QualificationTransitionCoordinator`.
- `QualificationConditionService`
  - Resolves or waives condition rows. Waivers require reviewer/admin role and structured reason metadata.
- `RecommendationOverrideService`
  - Stores reviewer recommendation overrides without modifying computed score results.
- `DisqualificationReasonCatalogService`
  - Reads the seeded, versioned reason catalog.
- `ReentryService`
  - Enforces `REENTRY_POLICY.md`, creates follow-up work, and calls `OperationalStateService`.
- `ReviewWorkspaceQuery`
  - Aggregates review, linked scores, conditions, gaps, consent indicators, latest decision, and allowed decisions.

## Transaction boundary

Decision commands must run inside a database transaction when using Postgres adapters. Tests cover rollback when review-version checks or operational transitions fail.

Recommended composition:

```ts
await database.withTransaction(async (tx) => {
  return buildQualificationReviewService(tx).decide(command);
});
```

## Authorization and guards

Services enforce role capabilities directly:

- researcher/sales/reviewer/admin can request review.
- reviewer/admin can start and decide reviews.
- researcher/reviewer/admin can resolve conditions.
- reviewer/admin can waive conditions and override recommendations.

Territory and assignment validation are injected through `QualificationGuardPort`; do not bypass these ports in route handlers.

## Events

Qualification services emit audit/outbox events for:

- `qualification.review_requested`
- `qualification.review_started`
- `qualification.decision_recorded`
- `qualification.condition_created`
- `qualification.condition_resolved`
- `qualification.condition_waived`
- `qualification.recommendation_overridden`
- `qualification.reentry_requested`
- `prospect.stage_transitioned`
- `prospect.transition_denied`

## Deferred composition

Fastify routes and Next pages should remain thin wrappers around the Zod contracts and services. Do not add discovery, outreach, campaign, opportunity, dashboard, ML, or autonomous progression behavior in the qualification package.
