# Completeness Policy

**Version:** 0.1.0-draft
**Status:** Pre-implementation decision-gate draft
**Approval status:** `draft_unapproved`
**Production status:** inactive; completeness weights require BUS-002 approval before production use

Completeness measures whether enough usable information exists for a purpose. It is not a fit score, confidence score, or substitute for human review.

## Global draft behavior

| Value state | Draft completeness behavior | approval_status |
|---|---|---|
| `known` | Counts complete when value type validates, required evidence exists, confidence is acceptable for the purpose, and freshness passes. | draft_unapproved |
| `unknown` | Counts incomplete. Unknown is never treated as zero, false, or a low ordinal value. | draft_unapproved |
| `not_applicable` | Excluded from denominator only when the purpose and variable definition permit N/A; otherwise incomplete pending review. | draft_unapproved |
| `withheld` | Counts incomplete and should be visible as withheld rather than unknown. | draft_unapproved |
| `contradicted` | Counts incomplete and should create or preserve a research gap. | draft_unapproved |
| `stale` | Counts incomplete for readiness; may be shown separately from unknown to drive refresh tasks. | draft_unapproved |

Draft formula:

```text
applicable_weight = sum(weights for variables applicable to the subject and purpose)
usable_weight = sum(weights for applicable variables with usable known values)
completeness = usable_weight / applicable_weight
```

No score should impute zero for missing values. Minimum completeness thresholds are score-definition hypotheses until approved.

## Purpose drafts

Weights below are draft criticality weights. They are not approved and must not be activated in production.

### overall

| criticality | variable keys | draft weight |
|---|---|---:|
| required | `firm_type`, `employee_count`, `payroll_offered`, `payroll_delivery_model`, `geographic_coverage` | 0.35 |
| high-impact | `estimated_client_count`, `payroll_client_count`, `recurring_service_model`, `client_decision_influence`, `executive_access`, `growth_stage`, `current_payroll_provider` | 0.45 |
| contextual | `estimated_revenue`, `average_payroll_size`, `typical_client_employee_count`, `technology_maturity`, `process_standardization`, `competitive_openness`, `provider_satisfaction` | 0.20 |

### acquisition_score_readiness

| criticality | variable keys | draft weight |
|---|---|---:|
| required | `payroll_client_count`, `operational_burden`, `process_standardization` | 0.55 |
| high-impact | `ownership_type`, `succession_risk`, `acquisition_interest`, `margin_pressure` | 0.35 |
| contextual | `payroll_offered`, `payroll_delivery_model`, `client_concentration_risk`, `competitive_openness` | 0.10 |

### wholesale_score_readiness

| criticality | variable keys | draft weight |
|---|---|---:|
| required | `recurring_service_model`, `payroll_client_count` | 0.40 |
| high-impact | `client_decision_influence`, `operational_burden`, `growth_intent`, `competitive_openness` | 0.45 |
| contextual | `technology_maturity`, `payroll_delivery_model`, `typical_client_employee_count` | 0.15 |

### cas_score_readiness

| criticality | variable keys | draft weight |
|---|---|---:|
| required | `cas_offered`, `cas_revenue_share` | 0.35 |
| high-impact | `recurring_service_model`, `client_interaction_frequency`, `technology_maturity`, `process_standardization`, `executive_access` | 0.45 |
| contextual | `bookkeeping_offered`, `fractional_cfo_offered`, `technology_consulting_offered`, `trusted_advisor_status` | 0.20 |

### direct_payroll_score_readiness

| criticality | variable keys | draft weight |
|---|---|---:|
| required | `firm_type`, `employee_count` | 0.30 |
| high-impact | `growth_stage`, `rapid_hiring`, `geographic_coverage`, `multi_state_growth`, `provider_satisfaction`, `known_provider_issue`, `contract_renewal_date`, `executive_access` | 0.55 |
| contextual | `current_payroll_provider`, `office_count`, `technology_dissatisfaction`, `competitive_openness` | 0.15 |

### discovery_readiness

Discovery readiness prioritizes inputs that select questions and protect answer mapping. Confirmed discovery mappings still require user confirmation before changing values.

| criticality | variable keys | draft weight |
|---|---|---:|
| required | `firm_type`, `payroll_offered`, `payroll_delivery_model`, `current_payroll_provider` | 0.35 |
| high-impact | `payroll_client_count`, `estimated_client_count`, `cas_offered`, `recurring_service_model`, `provider_satisfaction`, `known_provider_issue`, `contract_renewal_date`, `executive_access` | 0.50 |
| contextual | `industry_concentration`, `typical_client_employee_count`, `average_payroll_size`, `growth_stage`, `competitive_openness` | 0.15 |

### outreach_readiness

Outreach readiness does not replace consent enforcement. Channel permission, opt-out, suppression, territory, and existing-relationship checks remain operational gates outside scoring variables.

| criticality | variable keys | draft weight |
|---|---|---:|
| required | `firm_type`, `executive_access`, `recommendation_authority` | 0.35 |
| high-impact | `client_interaction_frequency`, `trusted_advisor_status`, `provider_satisfaction`, `known_provider_issue`, `contract_renewal_date`, `competitive_openness` | 0.45 |
| contextual | `growth_stage`, `rapid_hiring`, `technology_dissatisfaction`, `service_expansion`, `multi_state_growth` | 0.20 |

## Activation block

Production activation is blocked until:

1. BUS-002 approves purpose variables and criticality weights.
2. `business_scoring_owner` approves any score-readiness thresholds consumed by scoring.
3. Golden fixtures cover known, unknown, false, zero, N/A, withheld, contradicted, and stale values.
4. The engine rejects draft policies for active score definitions.
