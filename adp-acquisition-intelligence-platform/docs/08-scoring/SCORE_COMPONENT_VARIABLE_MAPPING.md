# Score Component Variable Mapping

**Version:** 0.1.0-draft
**Status:** Pre-implementation decision-gate draft
**Approval status:** `draft_unapproved`
**Business status:** `business_scoring_owner` approval is not available. SCR-002, BUS-001, and BUS-002 remain pending.
**Production status:** No production score definition is active. All mappings and weights below are hypotheses derived from the Variable Dictionary keys and Scoring Engine Specification narrative.

This document narrows CONF-007 by publishing a draft component-to-variable mapping. It does **not** resolve CONF-007 because the mappings, transforms, weights, completeness thresholds, tiers, and aggregation behavior remain unapproved by `business_scoring_owner`.

## Decision-gate rules

- Use only exact keys already present in the Variable Dictionary.
- Do not create a scoring input from operational fields unless the dictionary explicitly versions it as a scoring variable.
- If a narrative component cannot map cleanly to dictionary keys, record `mapping_gap: true` and exclude it from executable draft score components.
- `unknown`, missing, withheld, contradicted, and stale values are distinct. Unknown is never treated as zero.
- Required missing data blocks final scoring when minimum completeness is not met.
- Required low-confidence or stale values produce provisional status once minimum completeness is met.
- All rows use `approval_status=draft_unapproved` and `version=0.1.0-draft`.

## Open decisions

1. **Influence subject:** Phase 1 draft uses organization-primary influence variables. Contact-level aggregation is deferred pending approval.
2. **Secondary-motion proximity threshold:** Draft threshold is `0.10` (10 points on a 0-100 scale). This is unapproved.
3. **Revenue bands / currency:** Revenue potential uses USD minor units where currency values are present. Draft band labels are TBD and unapproved.
4. **Provisional vs insufficient:** Draft rule: completeness below minimum produces `insufficient_data`; otherwise any required low-confidence or stale input produces `provisional`. This is unapproved.
5. **Tiers:** Draft thresholds are high >= 75, medium >= 50, low >= 0, based on the Scoring Engine Specification hypothesis. These are unapproved for all families.

## Common defaults

| Field | Draft value |
|---|---|
| Missing-data behavior | Required unknown/withheld/contradicted/stale input is incomplete; optional unavailable input is omitted without imputing zero. |
| Confidence behavior | Low confidence reduces score confidence; required low-confidence or stale input makes a score provisional when completeness passes. |
| Freshness requirement | Use the variable definition freshness policy where present; otherwise require current supporting evidence and flag old evidence for review. |
| Approval status | `draft_unapproved` |
| Version | `0.1.0-draft` |

## Acquisition Fit

| score_key | component_key | variable_key | subject | transform | weight | required/optional | missing-data behavior | confidence behavior | freshness requirement | direction | explanation language | approval_status | version |
|---|---|---|---|---|---:|---|---|---|---|---|---|---|---|
| acquisition_fit | payroll_book_potential | payroll_client_count | organization | capped_band | 0.20 | required | Missing blocks final scoring below minimum completeness. | Low confidence makes the result provisional. | Discovery/direct evidence preferred; use variable policy. | + | Larger supported payroll client book increases acquisition fit. | draft_unapproved | 0.1.0-draft |
| acquisition_fit | ownership_succession_ownership | ownership_type | organization | enum_rubric | 0.10 | optional | Unknown ownership lowers completeness only. | Low confidence lowers score confidence. | Current verified/source/direct evidence. | + | Ownership context may support transaction plausibility. | draft_unapproved | 0.1.0-draft |
| acquisition_fit | ownership_succession_risk | succession_risk | organization | ordinal_linear | 0.15 | optional | Unknown succession signal is not scored as low risk. | Low confidence lowers score confidence. | Current evidence; stale retirement signals require review. | + | Higher succession risk may increase acquisition relevance. | draft_unapproved | 0.1.0-draft |
| acquisition_fit | operational_burden | operational_burden | organization | ordinal_linear | 0.20 | required | Missing blocks final scoring below minimum completeness. | Low confidence makes the result provisional. | Current discovery/source evidence. | + | Higher payroll operating burden increases acquisition fit. | draft_unapproved | 0.1.0-draft |
| acquisition_fit | process_quality | process_standardization | organization | ordinal_linear | 0.15 | required | Missing blocks final scoring below minimum completeness. | Low confidence makes the result provisional. | Current rubric evidence. | + | More standardized processes improve integration plausibility. | draft_unapproved | 0.1.0-draft |
| acquisition_fit | economics | margin_pressure | organization | ordinal_linear | 0.10 | optional | Unknown margin pressure is omitted without zero imputation. | Low confidence lowers score confidence. | Current source/direct evidence. | + | Higher margin pressure may increase interest in transaction economics. | draft_unapproved | 0.1.0-draft |
| acquisition_fit | openness | acquisition_interest | organization | ordinal_linear | 0.10 | optional | Unknown interest is omitted without assuming disinterest. | Low confidence lowers score confidence. | Current expressed or source-supported signal. | + | Expressed acquisition interest increases acquisition fit. | draft_unapproved | 0.1.0-draft |

## Wholesale Fit

Wholesale uses the Scoring Engine Specification example as the starting hypothesis; it remains unapproved.

| score_key | component_key | variable_key | subject | transform | weight | required/optional | missing-data behavior | confidence behavior | freshness requirement | direction | explanation language | approval_status | version |
|---|---|---|---|---|---:|---|---|---|---|---|---|---|---|
| wholesale_fit | recurring_service_model | recurring_service_model | organization | ordinal_linear | 0.20 | required | Missing blocks final scoring below minimum completeness. | Low confidence makes the result provisional. | Discovery/direct rubric evidence. | + | More recurring delivery increases wholesale fit. | draft_unapproved | 0.1.0-draft |
| wholesale_fit | payroll_potential | payroll_client_count | organization | capped_band | 0.20 | required | Missing blocks final scoring below minimum completeness. | Low confidence makes the result provisional. | Discovery/direct evidence preferred. | + | More payroll clients increase wholesale potential. | draft_unapproved | 0.1.0-draft |
| wholesale_fit | technology_maturity | technology_maturity | organization | ordinal_linear | 0.10 | optional | Unknown maturity is omitted without zero imputation. | Low confidence lowers score confidence. | Current rubric evidence. | + | Better technology maturity supports wholesale operations. | draft_unapproved | 0.1.0-draft |
| wholesale_fit | advisory_influence | client_decision_influence | organization | ordinal_linear | 0.15 | optional | Unknown influence is omitted without zero imputation. | Low confidence lowers score confidence. | Current rubric evidence. | + | Greater client decision influence supports wholesale adoption. | draft_unapproved | 0.1.0-draft |
| wholesale_fit | operational_burden | operational_burden | organization | ordinal_linear | 0.15 | optional | Unknown burden is omitted without zero imputation. | Low confidence lowers score confidence. | Current discovery/source evidence. | + | Payroll operating burden may motivate wholesale support. | draft_unapproved | 0.1.0-draft |
| wholesale_fit | growth_intent | growth_intent | organization | ordinal_linear | 0.10 | optional | Unknown intent is omitted without zero imputation. | Low confidence lowers score confidence. | Current stated expansion appetite. | + | Growth intent supports wholesale scale potential. | draft_unapproved | 0.1.0-draft |
| wholesale_fit | competitive_openness | competitive_openness | organization | ordinal_linear | 0.10 | optional | Unknown openness is omitted without zero imputation. | Low confidence lowers score confidence. | Current discovery/source evidence. | + | Openness to alternatives supports wholesale fit. | draft_unapproved | 0.1.0-draft |

## CAS Maturity

| score_key | component_key | variable_key | subject | transform | weight | required/optional | missing-data behavior | confidence behavior | freshness requirement | direction | explanation language | approval_status | version |
|---|---|---|---|---|---:|---|---|---|---|---|---|---|---|
| cas_maturity | recurring_share | cas_revenue_share | organization | capped_band | 0.25 | required | Missing blocks final scoring below minimum completeness. | Low confidence makes the result provisional. | Discovery/direct evidence preferred. | + | Higher CAS revenue share increases CAS maturity. | draft_unapproved | 0.1.0-draft |
| cas_maturity | service_breadth_cas | cas_offered | organization | boolean_gate | 0.10 | required | Missing blocks final scoring below minimum completeness. | Low confidence makes the result provisional. | Current service page or direct evidence. | + | Confirmed CAS offering supports service breadth. | draft_unapproved | 0.1.0-draft |
| cas_maturity | service_breadth_bookkeeping | bookkeeping_offered | organization | boolean_gate | 0.05 | optional | Unknown is omitted without assuming false. | Low confidence lowers score confidence. | Current service page or direct evidence. | + | Bookkeeping expands advisory delivery context. | draft_unapproved | 0.1.0-draft |
| cas_maturity | service_breadth_fractional_cfo | fractional_cfo_offered | organization | boolean_gate | 0.05 | optional | Unknown is omitted without assuming false. | Low confidence lowers score confidence. | Current service page or direct evidence. | + | Fractional CFO services increase advisory breadth. | draft_unapproved | 0.1.0-draft |
| cas_maturity | service_breadth_technology | technology_consulting_offered | organization | boolean_gate | 0.05 | optional | Unknown is omitted without assuming false. | Low confidence lowers score confidence. | Current service page or direct evidence. | + | Technology consulting increases advisory breadth. | draft_unapproved | 0.1.0-draft |
| cas_maturity | cadence | client_interaction_frequency | organization | enum_rubric | 0.15 | optional | Unknown cadence is omitted without zero imputation. | Low confidence lowers score confidence. | Discovery/direct evidence preferred. | + | More frequent client interaction increases embedded maturity. | draft_unapproved | 0.1.0-draft |
| cas_maturity | technology_maturity | technology_maturity | organization | ordinal_linear | 0.15 | optional | Unknown maturity is omitted without zero imputation. | Low confidence lowers score confidence. | Current rubric evidence. | + | Better technology maturity supports CAS delivery. | draft_unapproved | 0.1.0-draft |
| cas_maturity | process_maturity | process_standardization | organization | ordinal_linear | 0.10 | optional | Unknown standardization is omitted without zero imputation. | Low confidence lowers score confidence. | Current rubric evidence. | + | Standardized processes increase CAS maturity. | draft_unapproved | 0.1.0-draft |
| cas_maturity | executive_access | executive_access | organization | ordinal_linear | 0.10 | optional | Unknown access is omitted without zero imputation. | Low confidence lowers score confidence. | Current rubric evidence. | + | Executive access supports embedded advisory delivery. | draft_unapproved | 0.1.0-draft |

## Direct Payroll Opportunity

| score_key | component_key | variable_key | subject | transform | weight | required/optional | missing-data behavior | confidence behavior | freshness requirement | direction | explanation language | approval_status | version |
|---|---|---|---|---|---:|---|---|---|---|---|---|---|---|
| direct_payroll_opportunity | employer_size_fit_type | firm_type | organization | enum_rubric | 0.05 | required | Missing blocks final scoring below minimum completeness. | Low confidence makes the result provisional. | Current source/direct/import evidence. | + | Employer firm type supports direct payroll fit. | draft_unapproved | 0.1.0-draft |
| direct_payroll_opportunity | employer_size_fit_employee_count | employee_count | organization | capped_band | 0.20 | required | Missing blocks final scoring below minimum completeness. | Low confidence makes the result provisional. | 12-month freshness. | + | Employee count frames direct payroll opportunity size. | draft_unapproved | 0.1.0-draft |
| direct_payroll_opportunity | growth_stage | growth_stage | organization | enum_rubric | 0.10 | optional | Unknown growth is omitted without zero imputation. | Low confidence lowers score confidence. | Current multi-source/direct evidence. | + | Growth increases direct payroll opportunity. | draft_unapproved | 0.1.0-draft |
| direct_payroll_opportunity | rapid_hiring | rapid_hiring | organization | dated_trigger_decay | 0.10 | optional | Missing trigger is not treated as false without evidence. | Low confidence lowers score confidence. | Event-date expiry; stale triggers excluded. | + | Recent rapid hiring increases direct payroll timing. | draft_unapproved | 0.1.0-draft |
| direct_payroll_opportunity | multi_state_complexity_coverage | geographic_coverage | organization | coverage_complexity | 0.10 | optional | Unknown geography is omitted without zero imputation. | Low confidence lowers score confidence. | Current location/service-area evidence. | + | Broader geography can increase payroll complexity. | draft_unapproved | 0.1.0-draft |
| direct_payroll_opportunity | multi_state_growth | multi_state_growth | organization | dated_trigger_decay | 0.10 | optional | Missing trigger is not treated as false without evidence. | Low confidence lowers score confidence. | Event-date expiry; stale triggers excluded. | + | Recent multi-state growth increases direct payroll urgency. | draft_unapproved | 0.1.0-draft |
| direct_payroll_opportunity | provider_pain_satisfaction | provider_satisfaction | organization | inverse_ordinal_linear | 0.10 | optional | Unknown satisfaction is omitted without assuming pain. | Low confidence lowers score confidence. | Current discovery/source evidence. | - | Lower current-provider satisfaction increases opportunity. | draft_unapproved | 0.1.0-draft |
| direct_payroll_opportunity | provider_pain_issue | known_provider_issue | organization | issue_presence | 0.10 | optional | Unknown issue is omitted without assuming no pain. | Low confidence lowers score confidence. | Source and date required. | + | Known provider issues increase opportunity. | draft_unapproved | 0.1.0-draft |
| direct_payroll_opportunity | timing | contract_renewal_date | organization | renewal_window | 0.10 | optional | Unknown renewal timing is omitted without zero imputation. | Low confidence lowers score confidence. | Direct evidence preferred; date/range must be current. | + | Nearer renewal window increases direct payroll timing. | draft_unapproved | 0.1.0-draft |
| direct_payroll_opportunity | access | executive_access | organization | ordinal_linear | 0.05 | optional | Unknown access is omitted without zero imputation. | Low confidence lowers score confidence. | Current rubric evidence. | + | Executive access increases direct payroll actionability. | draft_unapproved | 0.1.0-draft |

## Influence

Phase 1 uses organization-primary influence inputs. Contact-level aggregation remains deferred.

| score_key | component_key | variable_key | subject | transform | weight | required/optional | missing-data behavior | confidence behavior | freshness requirement | direction | explanation language | approval_status | version |
|---|---|---|---|---|---:|---|---|---|---|---|---|---|---|
| influence | decision_influence | client_decision_influence | organization | ordinal_linear | 0.25 | required | Missing blocks final scoring below minimum completeness. | Low confidence makes the result provisional. | Current rubric evidence. | + | Higher decision influence increases ability to shape payroll choices. | draft_unapproved | 0.1.0-draft |
| influence | interaction_frequency | client_interaction_frequency | organization | enum_rubric | 0.15 | optional | Unknown frequency is omitted without zero imputation. | Low confidence lowers score confidence. | Discovery/direct evidence preferred. | + | More frequent client interaction increases influence. | draft_unapproved | 0.1.0-draft |
| influence | trust | trusted_advisor_status | organization | ordinal_linear | 0.20 | optional | Unknown trust is omitted without zero imputation. | Low confidence lowers score confidence. | Current rubric evidence. | + | Higher trusted-advisor status increases influence. | draft_unapproved | 0.1.0-draft |
| influence | recommendation_authority | recommendation_authority | organization | ordinal_linear | 0.25 | required | Missing blocks final scoring below minimum completeness. | Low confidence makes the result provisional. | Current rubric evidence. | + | Recommendation authority increases decision influence. | draft_unapproved | 0.1.0-draft |
| influence | executive_access | executive_access | organization | ordinal_linear | 0.15 | optional | Unknown access is omitted without zero imputation. | Low confidence lowers score confidence. | Current rubric evidence. | + | Executive access increases influence. | draft_unapproved | 0.1.0-draft |

## Urgency

| score_key | component_key | variable_key | subject | transform | weight | required/optional | missing-data behavior | confidence behavior | freshness requirement | direction | explanation language | approval_status | version |
|---|---|---|---|---|---:|---|---|---|---|---|---|---|---|
| urgency | dated_trigger_rapid_hiring | rapid_hiring | organization | dated_trigger_decay | 0.08 | optional | Missing trigger is not treated as false without evidence. | Low confidence lowers score confidence. | Trigger expiry; stale triggers excluded. | + | Recent rapid hiring increases urgency. | draft_unapproved | 0.1.0-draft |
| urgency | dated_trigger_new_office | new_office | organization | dated_trigger_decay | 0.06 | optional | Missing trigger is not treated as false without evidence. | Low confidence lowers score confidence. | Trigger expiry; stale triggers excluded. | + | Recent office expansion increases urgency. | draft_unapproved | 0.1.0-draft |
| urgency | dated_trigger_acquisition_event | acquisition_event | organization | dated_trigger_decay | 0.07 | optional | Missing trigger is not treated as false without evidence. | Low confidence lowers score confidence. | Trigger expiry; stale triggers excluded. | + | Recent acquisition event increases urgency. | draft_unapproved | 0.1.0-draft |
| urgency | dated_trigger_compliance_event | compliance_event | organization | dated_trigger_decay | 0.08 | optional | Missing trigger is not treated as false without evidence. | Low confidence lowers score confidence. | Trigger expiry; stale triggers excluded. | + | Recent compliance event increases urgency. | draft_unapproved | 0.1.0-draft |
| urgency | leadership_event | leadership_transition | organization | dated_trigger_decay | 0.08 | optional | Missing trigger is not treated as false without evidence. | Low confidence lowers score confidence. | Trigger expiry; stale triggers excluded. | + | Leadership transition increases urgency. | draft_unapproved | 0.1.0-draft |
| urgency | provider_pain_technology | technology_dissatisfaction | organization | dated_trigger_decay | 0.10 | optional | Missing trigger is not treated as false without evidence. | Low confidence lowers score confidence. | Trigger expiry; stale triggers excluded. | + | Recent technology dissatisfaction increases urgency. | draft_unapproved | 0.1.0-draft |
| urgency | growth_event_service_expansion | service_expansion | organization | dated_trigger_decay | 0.06 | optional | Missing trigger is not treated as false without evidence. | Low confidence lowers score confidence. | Trigger expiry; stale triggers excluded. | + | Service expansion increases urgency. | draft_unapproved | 0.1.0-draft |
| urgency | succession_event | succession_event | organization | dated_trigger_decay | 0.07 | optional | Missing trigger is not treated as false without evidence. | Low confidence lowers score confidence. | Trigger expiry; stale triggers excluded. | + | Succession event increases urgency. | draft_unapproved | 0.1.0-draft |
| urgency | pain_margin_compression | margin_compression | organization | dated_trigger_decay | 0.08 | optional | Missing trigger is not treated as false without evidence. | Low confidence lowers score confidence. | Trigger expiry; stale triggers excluded. | + | Margin compression increases urgency. | draft_unapproved | 0.1.0-draft |
| urgency | growth_event_multi_state | multi_state_growth | organization | dated_trigger_decay | 0.07 | optional | Missing trigger is not treated as false without evidence. | Low confidence lowers score confidence. | Trigger expiry; stale triggers excluded. | + | Multi-state growth increases urgency. | draft_unapproved | 0.1.0-draft |
| urgency | contract_timing | contract_renewal_date | organization | renewal_window | 0.15 | optional | Unknown renewal timing is omitted without zero imputation. | Low confidence lowers score confidence. | Direct evidence preferred; date/range must be current. | + | Near renewal timing increases urgency. | draft_unapproved | 0.1.0-draft |
| urgency | provider_pain_satisfaction | provider_satisfaction | organization | inverse_ordinal_linear | 0.10 | optional | Unknown satisfaction is omitted without assuming pain. | Low confidence lowers score confidence. | Current discovery/source evidence. | - | Lower provider satisfaction increases urgency. | draft_unapproved | 0.1.0-draft |

## Revenue Potential

| score_key | component_key | variable_key | subject | transform | weight | required/optional | missing-data behavior | confidence behavior | freshness requirement | direction | explanation language | approval_status | version |
|---|---|---|---|---|---:|---|---|---|---|---|---|---|---|
| revenue_potential | payroll_volume | payroll_client_count | organization | capped_band | 0.25 | optional | Unknown payroll volume is omitted without zero imputation. | Low confidence lowers score confidence. | Discovery/direct evidence preferred. | + | More payroll clients increase revenue potential. | draft_unapproved | 0.1.0-draft |
| revenue_potential | average_payroll_size | average_payroll_size | organization | capped_band | 0.20 | optional | Unknown size is omitted without zero imputation. | Low confidence lowers score confidence. | Discovery/direct evidence preferred. | + | Larger average payroll size increases revenue potential. | draft_unapproved | 0.1.0-draft |
| revenue_potential | client_volume | estimated_client_count | organization | capped_band | 0.15 | optional | Unknown client volume is omitted without zero imputation. | Low confidence lowers score confidence. | Source/discovery range evidence. | + | Larger client base increases revenue potential. | draft_unapproved | 0.1.0-draft |
| revenue_potential | typical_client_size | typical_client_employee_count | organization | capped_band | 0.15 | optional | Unknown typical size is omitted without zero imputation. | Low confidence lowers score confidence. | Discovery/direct evidence preferred. | + | Larger typical client size increases revenue potential. | draft_unapproved | 0.1.0-draft |
| revenue_potential | direct_employer_size | employee_count | organization | capped_band | 0.10 | optional | Unknown employee count is omitted without zero imputation. | Low confidence lowers score confidence. | 12-month freshness. | + | Larger employer size increases direct-motion revenue potential. | draft_unapproved | 0.1.0-draft |
| revenue_potential | firm_revenue_context | estimated_revenue | organization | revenue_band | 0.15 | optional | Unknown revenue is omitted without zero imputation. | Low confidence lowers score confidence. | Sourced estimate/direct; range allowed. | + | Firm revenue context may indicate magnitude band. | draft_unapproved | 0.1.0-draft |

## Accessibility

| score_key | component_key | variable_key | subject | transform | weight | required/optional | missing-data behavior | confidence behavior | freshness requirement | direction | explanation language | approval_status | version |
|---|---|---|---|---|---:|---|---|---|---|---|---|---|---|
| accessibility | relationship_access_executive | executive_access | organization | ordinal_linear | 0.40 | required | Missing blocks final scoring below minimum completeness. | Low confidence makes the result provisional. | Current rubric evidence. | + | Executive access improves practical reach. | draft_unapproved | 0.1.0-draft |
| accessibility | relationship_access_frequency | client_interaction_frequency | organization | enum_rubric | 0.20 | optional | Unknown frequency is omitted without zero imputation. | Low confidence lowers score confidence. | Discovery/direct evidence preferred. | + | Frequent interaction improves practical reach. | draft_unapproved | 0.1.0-draft |
| accessibility | relationship_access_trust | trusted_advisor_status | organization | ordinal_linear | 0.20 | optional | Unknown trust is omitted without zero imputation. | Low confidence lowers score confidence. | Current rubric evidence. | + | Trusted-advisor status improves relationship access. | draft_unapproved | 0.1.0-draft |
| accessibility | relationship_access_recommendation | recommendation_authority | organization | ordinal_linear | 0.20 | optional | Unknown authority is omitted without zero imputation. | Low confidence lowers score confidence. | Current rubric evidence. | + | Recommendation authority improves practical access. | draft_unapproved | 0.1.0-draft |

## Data Confidence

Data Confidence narrative components do not map to Variable Dictionary keys. They map to Prompt 3 confidence assessment components (`sourceReliability`, `specificity`, `recency`, `crossSourceAgreement`, `extractionCertainty`) documented in [Confidence Policy](CONFIDENCE_POLICY.md). No dictionary variable key is invented here. The draft YAML remains inactive and delegates to the draft confidence policy; production activation is refused until policy approval.

## Mapping gaps excluded from executable variable-key score components

| score_key | narrative_component | mapping_gap | gap note | approval_status | version |
|---|---|---:|---|---|---|
| acquisition_fit | economics | true | `margin_pressure` is used as a narrow hypothesis, but full acquisition economics need approved rubric/bands before activation. | draft_unapproved | 0.1.0-draft |
| direct_payroll_opportunity | access | true | `executive_access` is used as an organization-primary proxy; contact-level access aggregation is deferred. | draft_unapproved | 0.1.0-draft |
| urgency | pain severity | true | Existing keys cover provider satisfaction and dated pain signals, but no approved pain-severity rubric exists. | draft_unapproved | 0.1.0-draft |
| revenue_potential | motion economics | true | `estimated_revenue` is a context proxy only; ADP motion economics, price, and margin variables are not defined. | draft_unapproved | 0.1.0-draft |
| revenue_potential | range confidence | true | Range confidence belongs to confidence policy, not a Variable Dictionary key. | draft_unapproved | 0.1.0-draft |
| accessibility | verified contact | true | Contact verification is described as an operational/profile field, not an exact Variable Dictionary scoring key. | draft_unapproved | 0.1.0-draft |
| accessibility | decision role | true | Contact role and decision authority are operational/profile fields unless explicitly versioned later. | draft_unapproved | 0.1.0-draft |
| accessibility | channel permission | true | Channel permission is consent/operational enforcement, not a scoring variable; outreach must still be server-side gated. | draft_unapproved | 0.1.0-draft |
| data_confidence | evidence quality | true | Uses Prompt 3 confidence components rather than Variable Dictionary keys. | draft_unapproved | 0.1.0-draft |
| data_confidence | agreement | true | Uses `crossSourceAgreement` confidence component rather than a Variable Dictionary key. | draft_unapproved | 0.1.0-draft |
| data_confidence | recency | true | Uses confidence/staleness metadata rather than a Variable Dictionary key. | draft_unapproved | 0.1.0-draft |
| data_confidence | verification | true | Uses review/verification evidence metadata rather than a Variable Dictionary key. | draft_unapproved | 0.1.0-draft |

## Activation block

The engine must reject activation of these draft mappings as production definitions until:

1. `business_scoring_owner` approves component mappings, transforms, weights, tiers, and completeness thresholds.
2. SCR-002, BUS-001, and BUS-002 are closed with approval evidence.
3. CONF-007 is explicitly resolved in the conflict register.
4. Golden fixtures and replay tests validate the approved version.
