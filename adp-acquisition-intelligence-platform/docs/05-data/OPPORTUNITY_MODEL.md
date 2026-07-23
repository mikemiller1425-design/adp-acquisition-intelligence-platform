# Opportunity Model (Prompt 9)

## Purpose

Opportunity management tracks commercial pursuit after validated interest from outreach or qualified context. Phase 1 covers creation, stage progression, value/probability history, contacts, risk flags, outcomes, and pipeline queries. It does **not** include proposals, contracts, billing, dashboards UI, referrals, CRM sync, or ML forecasts.

## Blueprint naming map

| Blueprint / catalog name | Implemented table |
|---|---|
| `opportunities` | `opportunities` (`primary_motion` column; no secondary motion table in Phase 1) |
| opportunity contacts / roles | `opportunity_contacts` (`role` enum) |
| stage definitions | `opportunity_stage_definitions` |
| stage history | `opportunity_stage_transitions` + `operational_state_transitions` |
| value / probability history | `opportunity_values`, `opportunity_probabilities` |
| next actions / risk | `opportunity_next_actions`, `opportunity_risk_flags` |
| outcomes / loss reasons | `opportunity_outcomes`, `opportunity_loss_reasons` |
| general history | `opportunity_history` |
| eligibility assessments | `opportunity_eligibility_assessments` |
| context links | `opportunity_context_links` |

## Lifecycle separation

- Organization `prospect_stage` transitions to `opportunity` on first opportunity create via `OperationalStateService`.
- `opportunity_stage` moves independently on the opportunity aggregate.
- Research gaps and outreach status are **not** cleared by opportunity creation or stage changes.

## Canonical stages

`open` → `discovery_validation` → `solution_alignment` → `commercial_review` → `won` | `lost` | `nurture`

Matrix and restricted transitions (`R`) align with [Operational State and Consent Model](OPERATIONAL_STATE_AND_CONSENT_MODEL.md) §3.5.

## Eligibility (Phase 1)

An organization is eligible when all are true:

1. `record_status = active`
2. `existing_relationship_flag = false`
3. `prospect_stage` ∈ `{discovery_completed, outreach_ready, outreach_active, opportunity}`
4. Active account owner assignment exists
5. `primary_motion` is non-empty (typically a score family key such as `direct_payroll_opportunity`)
6. Creating user sets `humanConfirmation = true` (explicit human confirmation flag)

Assessments are persisted to `opportunity_eligibility_assessments` with structured reason codes.

## Cardinality

At most one active opportunity per organization per `primary_motion` (partial unique index excluding `won` and `lost`). Multiple closed opportunities are allowed.

## Value and probability

| Field | Rule |
|---|---|
| Value amount | Nullable |
| Currency | Required when amount present |
| Probability | Nullable; `manual` or `stage_default` only |
| Manual probability | Requires `reason_note` |
| Stage default probability | Applied on create (`open`) and on stage advance when configured |

No predictive probabilities or ML forecasts in Phase 1.

## Risk and stage guards

- Open risk flags block stage advancement unless `exceptionAuthorized`.
- Invalid matrix transitions are rejected.
- Close lost requires active loss reason from seeded catalog.
- Reopen requires reviewer/admin and preserves prior outcome via `superseded_at`.

## Configuration

- Stage definitions: `config/opportunities/stage-definitions.v1.yaml`
- Loss reasons: `config/opportunities/loss-reasons.v1.yaml`
- Seeded by `packages/database/seeds/opportunities.ts`

## Events

Audit/outbox events use `opportunity.*` names with `aggregateType = opportunity` (or `organization` for eligibility assessments).
