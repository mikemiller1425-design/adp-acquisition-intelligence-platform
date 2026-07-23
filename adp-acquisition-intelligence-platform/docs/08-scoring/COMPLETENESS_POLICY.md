# Completeness Policy

**Version:** 1.0.0
**Status:** Active Phase 1 baseline
**Approval status:** `approved`
**Production status:** active for Prompt 6 qualification entry under owner-approved Phase 1 baseline.

Completeness measures whether enough usable information exists for a purpose. It is not a fit score, confidence score, or substitute for human review.

## Global approved Phase 1 baseline behavior

| Value state | Approved completeness behavior | approval_status |
|---|---|---|
| `known` | Counts complete when value type validates, required evidence exists, confidence is acceptable for the purpose, and freshness passes. | approved |
| `unknown` | Counts incomplete. Unknown is never treated as zero, false, or a low ordinal value. | approved |
| `not_applicable` | Excluded from denominator only when the purpose and variable definition permit N/A; otherwise incomplete pending review. | approved |
| `withheld` | Counts incomplete and should be visible as withheld rather than unknown. | approved |
| `contradicted` | Counts incomplete and should create or preserve a research gap. | approved |
| `stale` | Counts incomplete for readiness; may be shown separately from unknown to drive refresh tasks. | approved |

Approved formula:

```text
applicable_weight = sum(weights for variables applicable to the subject and purpose)
usable_weight = sum(weights for applicable variables with usable known values)
completeness = usable_weight / applicable_weight
```

No score should impute zero for missing values. Minimum completeness thresholds are approved for the Phase 1 baseline and may be superseded by later calibration.

## Purpose baselines

Weights below are approved Phase 1 baseline criticality weights.

### overall

| criticality | variable keys | approved weight |
|---|---|---:|
| required | `firm_type`, `employee_count`, `payroll_offered`, `payroll_delivery_model`, `geographic_coverage` | 0.35 |
| high-impact | `estimated_client_count`, `payroll_client_count`, `recurring_service_model`, `client_decision_influence`, `executive_access`, `growth_stage`, `current_payroll_provider` | 0.45 |
| contextual | `estimated_revenue`, `average_payroll_size`, `typical_client_employee_count`, `technology_maturity`, `process_standardization`, `competitive_openness`, `provider_satisfaction` | 0.20 |

### acquisition_score_readiness

| criticality | variable keys | approved weight |
|---|---|---:|
| required | `payroll_client_count`, `operational_burden`, `process_standardization` | 0.55 |
| high-impact | `ownership_type`, `succession_risk`, `acquisition_interest`, `margin_pressure` | 0.35 |
| contextual | `payroll_offered`, `payroll_delivery_model`, `client_concentration_risk`, `competitive_openness` | 0.10 |

### wholesale_score_readiness

| criticality | variable keys | approved weight |
|---|---|---:|
| required | `recurring_service_model`, `payroll_client_count` | 0.40 |
| high-impact | `client_decision_influence`, `operational_burden`, `growth_intent`, `competitive_openness` | 0.45 |
| contextual | `technology_maturity`, `payroll_delivery_model`, `typical_client_employee_count` | 0.15 |

### cas_score_readiness

| criticality | variable keys | approved weight |
|---|---|---:|
| required | `cas_offered`, `cas_revenue_share` | 0.35 |
| high-impact | `recurring_service_model`, `client_interaction_frequency`, `technology_maturity`, `process_standardization`, `executive_access` | 0.45 |
| contextual | `bookkeeping_offered`, `fractional_cfo_offered`, `technology_consulting_offered`, `trusted_advisor_status` | 0.20 |

### direct_payroll_score_readiness

| criticality | variable keys | approved weight |
|---|---|---:|
| required | `firm_type`, `employee_count` | 0.30 |
| high-impact | `growth_stage`, `rapid_hiring`, `geographic_coverage`, `multi_state_growth`, `provider_satisfaction`, `known_provider_issue`, `contract_renewal_date`, `executive_access` | 0.55 |
| contextual | `current_payroll_provider`, `office_count`, `technology_dissatisfaction`, `competitive_openness` | 0.15 |

### discovery_readiness

Discovery readiness prioritizes inputs that select questions and protect answer mapping. Confirmed discovery mappings still require user confirmation before changing values.

| criticality | variable keys | approved weight |
|---|---|---:|
| required | `firm_type`, `payroll_offered`, `payroll_delivery_model`, `current_payroll_provider` | 0.35 |
| high-impact | `payroll_client_count`, `estimated_client_count`, `cas_offered`, `recurring_service_model`, `provider_satisfaction`, `known_provider_issue`, `contract_renewal_date`, `executive_access` | 0.50 |
| contextual | `industry_concentration`, `typical_client_employee_count`, `average_payroll_size`, `growth_stage`, `competitive_openness` | 0.15 |

### outreach_readiness

Outreach readiness does not replace consent enforcement. Channel permission, opt-out, suppression, territory, and existing-relationship checks remain operational gates outside scoring variables.

| criticality | variable keys | approved weight |
|---|---|---:|
| required | `firm_type`, `executive_access`, `recommendation_authority` | 0.35 |
| high-impact | `client_interaction_frequency`, `trusted_advisor_status`, `provider_satisfaction`, `known_provider_issue`, `contract_renewal_date`, `competitive_openness` | 0.45 |
| contextual | `growth_stage`, `rapid_hiring`, `technology_dissatisfaction`, `service_expansion`, `multi_state_growth` | 0.20 |

## Activation evidence

Production activation is allowed for Prompt 6 qualification because:

1. Repository owner (mikemiller1425-design) approved the Phase 1 baseline via Prompt 6 unblock instruction 2026-07-22.
2. Purpose variables and criticality weights are versioned as `1.0.0` with `approval_status=approved`.
3. Golden fixtures cover known, unknown, false, zero, N/A, withheld, contradicted, and stale values.
4. The engine rejects unapproved policies for active score definitions.
