# Confidence Policy

**Version:** 0.1.0-draft
**Status:** Pre-implementation decision-gate draft
**Approval status:** `draft_unapproved`
**Production status:** inactive; engines must refuse production activation until approved

Prompt 3 stores confidence components but intentionally leaves aggregate confidence null because no approved aggregation policy exists. This document proposes a draft policy for Prompt 5 implementation planning only. It does not approve confidence aggregation for production.

## Inputs from Prompt 3

Each component is nullable or a number in `[0, 1]`.

| Component | Meaning | Required for aggregate? | approval_status |
|---|---|---:|---|
| `sourceReliability` | Reliability of the source behind the claim or evidence. | yes | draft_unapproved |
| `specificity` | How specifically the evidence supports the claimed value. | yes | draft_unapproved |
| `recency` | Whether the evidence is recent enough for the purpose. | yes | draft_unapproved |
| `crossSourceAgreement` | Degree of agreement across available sources. | yes | draft_unapproved |
| `extractionCertainty` | Confidence that extraction or interpretation captured the evidence correctly. | yes | draft_unapproved |

## Draft aggregation formula

This formula is a **DRAFT** and must not be used for active production definitions.

Let:

- `C = {sourceReliability, specificity, recency, crossSourceAgreement, extractionCertainty}`
- `present(C)` be all components with numeric values in `[0, 1]`
- `required(C)` be all five components
- `conflict_penalty` be `0.15` when the value or evidence is contradicted; otherwise `0`
- `staleness_penalty` be `0.10` when the value or evidence is stale; otherwise `0`

Draft aggregate:

```text
if any required component is missing:
  aggregate_score = null
  aggregate_status = "unassessed"
else:
  base = mean(present(C))
  aggregate_score = clamp(base - conflict_penalty - staleness_penalty, 0, 1)
  aggregate_status = "assessed"
```

The equal-weight mean is deliberately simple for reviewability. It is not a business-approved statement that every component has equal importance.

## Required missing component behavior

If any required component is missing:

- `aggregate_score` remains `null`
- confidence status is `unassessed`
- no fabricated precision is displayed
- downstream score confidence must not substitute `0`, `0.5`, or another default
- the result must list the missing confidence component

## Conflict and staleness behavior

| Condition | Draft behavior | approval_status |
|---|---|---|
| Contradicted evidence/value | Apply `conflict_penalty = 0.15`; create or preserve research gap. | draft_unapproved |
| Stale evidence/value | Apply `staleness_penalty = 0.10`; score result may become provisional when required input is stale. | draft_unapproved |
| Contradicted and stale | Apply both penalties; clamp final aggregate to `[0, 1]`. | draft_unapproved |
| No freshness policy | Do not penalize solely for age; report `no_policy` staleness status. | draft_unapproved |

## Activation guard

The engine must refuse production activation when:

- `approval_status` is not approved
- policy version is a draft
- replay/golden tests for the approved formula are missing
- any score definition attempts to persist aggregate confidence from this draft as final production confidence

## Relationship to Data Confidence score

The `data_confidence` score family may reference this draft policy in inactive draft configuration. The score family still has no approved Variable Dictionary key mapping for its narrative components, and production activation remains blocked until `business_scoring_owner` approval closes SCR-002/BUS-001/BUS-002 and CONF-007.
