# Scoring Engine Specification

**Version:** 1.0.0

## Principles

Scores prioritize research and human decisions; they do not make binding decisions. The engine MUST be deterministic, configuration-driven, versioned, explainable, reproducible, tolerant of missing data, and separate fit from confidence/completeness.

## Required score families

| Score | Question answered | Representative components (initial hypothesis) |
|---|---|---|
| Acquisition Fit | Is acquiring/internalizing this payroll operation plausible and attractive? | payroll book potential, ownership/succession, operational burden, process quality, economics, openness |
| Wholesale Fit | Would a wholesale operating model fit? | recurring model, payroll potential, advisory influence, operational burden, growth intent, competitive openness |
| CAS Maturity | How embedded and recurring is advisory delivery? | recurring share, service breadth, cadence, technology/process maturity, executive access |
| Direct Payroll Opportunity | Is there a direct employer payroll opportunity? | employer size/fit, growth, multi-state complexity, provider pain, timing, access |
| Influence | Can this organization/contact shape payroll decisions? | decision influence, interaction frequency, trust, recommendation authority, executive access |
| Urgency | Is there a time-sensitive reason to act? | dated triggers, contract timing, pain severity, leadership/growth event |
| Revenue Potential | What is the opportunity magnitude band? | payroll/client volume, typical size, motion economics, range confidence |
| Accessibility | Can the right people be reached lawfully and practically? | verified contact, decision role, relationship access, channel permission |
| Data Confidence | How reliable is the intelligence? | evidence quality, agreement, recency, verification |

The first four are motion/domain scores. Influence, urgency, revenue, accessibility, and data confidence are supporting scores. A recommendation policy combines them but preserves each independent output.

## Configuration contract

```yaml
key: wholesale_fit
version: 1.0.0
status: active
range: [0, 100]
minimum_completeness: 0.55
components:
  recurring_service_model: {weight: 0.20, transform: ordinal_linear, required: true}
  payroll_client_count: {weight: 0.20, transform: capped_band, required: true}
  technology_maturity: {weight: 0.10, transform: ordinal_linear}
  client_decision_influence: {weight: 0.15, transform: ordinal_linear}
  operational_burden: {weight: 0.15, transform: ordinal_linear}
  growth_intent: {weight: 0.10, transform: ordinal_linear}
  competitive_openness: {weight: 0.10, transform: ordinal_linear}
tiers: {high: 75, medium: 50, low: 0}
```

Weights above are a starting hypothesis and MUST be confirmed by business owners before activation. Published configurations are immutable and sum to 1.0 after permitted applicability adjustments.

## Calculation

1. Resolve the requested active score version.
2. Select values effective at calculation time and capture their IDs/normalized representations.
3. Apply eligibility, freshness, applicability, and confidence rules.
4. Calculate weighted completeness over expected applicable inputs.
5. If below threshold, return `insufficient_data` or a visibly `provisional` result; never impute zero.
6. Transform each usable value into a 0–100 contribution according to the configured rubric.
7. Normalize weights only across optional usable/applicable components when the version permits; required missing components are never silently renormalized away.
8. Calculate raw score and tier.
9. Calculate score confidence from evidence confidence, component weight coverage, conflict penalty, and age penalty.
10. Persist the immutable input snapshot, factors, definition/version, and explanation.

## Output contract

```json
{
  "score_key": "wholesale_fit",
  "score_version": "1.0.0",
  "status": "final|provisional|insufficient_data",
  "score": 78,
  "tier": "high",
  "confidence": 0.71,
  "completeness": 0.82,
  "top_positive_factors": [],
  "top_negative_factors": [],
  "missing_high_impact_variables": [],
  "recommended_action": "Validate payroll delivery model in discovery",
  "calculated_at": "UTC timestamp",
  "input_snapshot_id": "uuid"
}
```

## Recommendation policy

Primary motion is the eligible motion with the strongest confidence-adjusted evidence, subject to minimum completeness and disqualifiers. Secondary motion requires a configured proximity threshold. Urgency changes ordering/next action, not fit. Revenue potential changes priority, not qualification. Existing relationship, territory, consent, reputational, or policy flags can block outreach even when fit is high.

Tie-break sequence: final over provisional; higher confidence; higher completeness; reviewer-configured strategic priority; then no recommendation and human review. Never fabricate precision.

## Overrides and recalculation

A user may override a recommendation or selected input only with role authorization and reason. The underlying computed result remains visible. New evidence, confirmed discovery mappings, staleness, or score activation queues recalculation. Historical results are retained and score movement explains which inputs/configuration changed.

## Calibration

Phase 1 collects outcomes by score tier, motion, message angle, and time. Weight changes require a documented analysis, stakeholder approval, a new semantic version, replay against a validation dataset, bias/quality review, and controlled activation. No automated weight learning is in Phase 1.

## Required tests

Golden fixtures, boundary values, unknown/not-applicable/contradicted/stale handling, weight validation, deterministic replay, version coexistence, confidence degradation, disqualifier behavior, explanation consistency, and property tests asserting score range and order-independent inputs. See [Testing Master Plan](../12-testing/TESTING_MASTER_PLAN.md).

