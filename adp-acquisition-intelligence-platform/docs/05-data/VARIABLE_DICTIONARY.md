# Variable Dictionary

**Version:** 1.0.0  
**Status:** Baseline taxonomy; weights remain versioned in score configuration

## Definition contract

Every variable definition MUST specify: stable key, label, description, subject type, data type, unit, allowed values/range, null/status semantics, collection methods, evidence requirements, confidence policy, freshness/expiry, validation, sensitivity, applicable scores/workflows, display help, and version. Definitions are configuration, never UI constants.

Statuses: `known`, `unknown`, `not_applicable`, `withheld`, `contradicted`, `stale`. Evidence types: `verified_fact`, `source_derived_fact`, `user_entered_fact`, `calculated`, `ai_inference`, `unknown`.

## Canonical organization variables

| Key | Type / allowed values | Collection and evidence | Used by |
|---|---|---|---|
| `firm_type` | enum: CPA, CAS, bookkeeping, payroll_bureau, fractional_CFO, employer, other | site/direct/import; current evidence | motion scores, discovery |
| `employee_count` | integer ≥0 | reliable directory/site/direct; 12-month freshness | revenue, capacity |
| `estimated_revenue` | currency range | sourced estimate or direct; range allowed | revenue potential |
| `office_count` | integer ≥1 | organization/location records | complexity, territory |
| `geographic_coverage` | list of regions/states | locations/direct | accessibility, direct payroll |
| `years_in_business` | integer ≥0 | formation/site/direct | stability context |
| `ownership_type` | enum | verified/source/direct | acquisition fit |
| `growth_stage` | enum: contracting, stable, growing, rapid_growth, unknown | multi-source/direct | urgency, revenue |

## Client-base variables

| Key | Type | Notes | Used by |
|---|---|---|---|
| `estimated_client_count` | integer range | never force point estimate | influence, revenue |
| `typical_client_employee_count` | integer range | target population size | direct/wholesale |
| `industry_concentration` | categorized percentages | totals must not exceed 100% | risk, messaging |
| `payroll_client_count` | integer range | discovery preferred | acquisition/wholesale |
| `average_payroll_size` | integer range | employee count per payroll | revenue |
| `multi_state_client_share` | percentage | source/direct | complexity/urgency |
| `client_concentration_risk` | ordinal 1–5 | rubric required | acquisition/risk |

## Service and delivery variables

| Key | Type | Values / evidence | Used by |
|---|---|---|---|
| `payroll_offered` | boolean | service page/direct | acquisition/wholesale |
| `payroll_delivery_model` | enum | internal, reseller, referral, outsourced, none, mixed | acquisition/wholesale |
| `bookkeeping_offered` | boolean | source/direct | CAS context |
| `cas_offered` | boolean | source/direct | CAS maturity |
| `cas_revenue_share` | percentage/range | discovery/direct evidence | CAS maturity |
| `fractional_cfo_offered` | boolean | source/direct | influence/CAS |
| `hr_advisory_offered` | boolean | source/direct | influence |
| `benefits_advisory_offered` | boolean | source/direct | influence |
| `technology_consulting_offered` | boolean | source/direct | CAS maturity |
| `recurring_service_model` | ordinal 0–4 | documented rubric | wholesale/CAS |

## Operational variables

All ordinal variables use an attached 0–4 rubric and confidence; absence of evidence is unknown, not 0.

| Key | Meaning | Used by |
|---|---|---|
| `staffing_pressure` | hiring/retention/capacity strain | acquisition, urgency |
| `technology_maturity` | integration, workflow, data maturity | wholesale, CAS |
| `process_standardization` | repeatability and documentation | acquisition, wholesale |
| `margin_pressure` | margin compression and cost concern | acquisition, urgency |
| `service_capacity` | ability to absorb/support growth | qualification |
| `succession_risk` | leadership continuity/retirement signal | acquisition, urgency |
| `acquisition_interest` | expressed openness to transaction | acquisition |
| `growth_intent` | stated expansion appetite | wholesale, direct |
| `operational_burden` | pain of current payroll operation | acquisition, wholesale |

## Influence variables

| Key | Type | Definition |
|---|---|---|
| `client_decision_influence` | ordinal 0–4 | ability to shape client vendor choice |
| `client_interaction_frequency` | enum | annual, quarterly, monthly, weekly, embedded |
| `trusted_advisor_status` | ordinal 0–4 | depth of reliance, rubric-based |
| `workforce_data_access` | ordinal 0–4 | legitimate access/visibility, not data entitlement |
| `recommendation_authority` | ordinal 0–4 | advisory authority over payroll/HR selection |
| `executive_access` | ordinal 0–4 | access to decision-makers |

These support Phase 1 prioritization. They MUST NOT activate the Phase 2 referral ecosystem.

## Buying triggers

Boolean or dated-event variables: `rapid_hiring`, `new_office`, `acquisition_event`, `compliance_event`, `leadership_transition`, `technology_dissatisfaction`, `service_expansion`, `succession_event`, `margin_compression`, `multi_state_growth`. Each has event date/range, source, confidence, expiry, and severity. Old triggers become stale rather than remaining permanently true.

## Competitive context

| Key | Type | Notes |
|---|---|---|
| `current_payroll_provider` | controlled string/entity | unknown allowed |
| `provider_satisfaction` | ordinal 0–4 | direct evidence preferred |
| `contract_renewal_date` | date/range | sensitivity controlled |
| `known_provider_issue` | controlled multi-select + note | source and date required |
| `switching_friction` | ordinal 0–4 | rubric |
| `competitive_openness` | ordinal 0–4 | direct/discovery evidence |

## Contact, assignment, and outcome variables

Contact role, decision authority, channel permissions, accessibility, verified channel, and last verified date are contact-scoped. Territory, owner, existing ADP relationship, stage, last activity, and next action are operational fields rather than scoring variables unless explicitly versioned. Outcomes include contacted, responded, meeting booked, discovery completed, qualified, opportunity created, won/lost, nurture, no response, and disqualified.

## Confidence calculation inputs

Evidence confidence is derived from source reliability, specificity, recency, cross-source agreement, and extraction certainty. Manual verification may increase confidence but requires actor/time. Conflicts reduce confidence and create a research task. Confidence is never inferred solely from the number of sources.

## Completeness priority

Each score version defines input criticality: required, high-impact optional, or contextual. Purpose completeness is the weighted proportion of usable (known and sufficiently confident/fresh) inputs. `not_applicable` is excluded from the denominator only where the definition permits it; withheld and contradicted remain incomplete.

See [Scoring Specification](../08-scoring/SCORING_ENGINE_SPECIFICATION.md) and [Discovery behavior](../02-functional/PHASE_1_FUNCTIONAL_SPECIFICATION.md#37-discovery).

