# Prompt 9 Specification Decisions

**Date:** 2026-07-23  
**Branch:** `cursor/prompt-9-opportunity-dd2b`

## Decisions

### 1. Opportunity stages

Use canonical Phase 1 keys from `opportunity_stage` enum and operational-state docs:

`open` → `discovery_validation` → `solution_alignment` → `commercial_review` → `won` | `lost` | `nurture`

Stage definitions are versioned in `config/opportunities/stage-definitions.v1.yaml` and seeded to `opportunity_stage_definitions`.

### 2. Multiple simultaneous opportunities

- Allow multiple **closed** opportunities (`won` / `lost`) per organization and motion.
- Enforce at most one **active** opportunity per `organization_id + primary_motion` via partial unique index where `opportunity_stage NOT IN ('won', 'lost')`.
- `nurture` counts as active for uniqueness (parked but not closed).

### 3. Commercial motion immutability

`opportunities.primary_motion` is immutable after create for Phase 1. Secondary motions are deferred; no `opportunity_motions` table in Phase 1.

### 4. Value semantics

- `opportunity_values.amount` nullable.
- `currency` required when `amount` is present (DB check + service validation).
- Effective-dated history via `effective_from` / `effective_to`.

### 5. Probability semantics

- Sources limited to `manual` and `stage_default` only.
- Probability nullable; no predictive ML.
- Manual overrides require `reason_note`.
- Stage transitions may apply configured `default_probability` from stage definitions.

### 6. Close / reopen / nurture rules

| Action | Target stage | Requirements |
|---|---|---|
| Close won | `won` | From `commercial_review` via stage matrix; records `opportunity_outcomes` |
| Close lost | `lost` | Active loss reason required; records outcome |
| Nurture | `nurture` | Structured `reason_code` required |
| Reopen | `open` | Reviewer/admin only; `exceptionAuthorized`; prior outcome superseded, history retained |

Terminal `won`/`lost` cannot advance except authorized reopen to `open`.

### 7. Loss-reason catalog

Seeded from `config/opportunities/loss-reasons.v1.yaml` into `opportunity_loss_reasons` (10 Phase 1 reasons).

### 8. Eligibility criteria

Documented in [OPPORTUNITY_MODEL.md](../05-data/OPPORTUNITY_MODEL.md). Summary:

- Organization `record_status=active`
- `prospect_stage` in `discovery_completed`, `outreach_ready`, `outreach_active`, or `opportunity`
- No `existing_relationship_flag`
- Assigned account owner present
- Non-empty `primary_motion`
- Human confirmation flag required on create
- Positive commercial interest assumed when creator confirms (no autonomous creation)

## Persistence notes

- `opportunity_stage` current state on `opportunities.opportunity_stage`
- Domain history in `opportunity_stage_transitions`
- Canonical dimension history in `operational_state_transitions` (`subject_type=opportunity`, `dimension=opportunity_stage`)
- General field changes in `opportunity_history`
- Outcomes append-only with supersession for reopen
