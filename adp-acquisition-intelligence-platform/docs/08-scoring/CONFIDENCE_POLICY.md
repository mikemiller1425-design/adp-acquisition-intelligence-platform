# Confidence Policy

**Version:** 1.0.0
**Status:** Active Phase 1 baseline
**Approval status:** `approved`
**Production status:** active for Prompt 6 qualification entry under owner-approved Phase 1 baseline.

Prompt 3 stores confidence components. This document approves the Phase 1 aggregate confidence policy for active scoring definitions. The approval is the repository-owner Prompt 6 unblock approval recorded in the conflict register and exit contract.

## Inputs from Prompt 3

Each component is nullable or a number in `[0, 1]`.

| Component | Meaning | Required for aggregate? | approval_status |
|---|---|---:|---|
| `sourceReliability` | Reliability of the source behind the claim or evidence. | yes | approved |
| `specificity` | How specifically the evidence supports the claimed value. | yes | approved |
| `recency` | Whether the evidence is recent enough for the purpose. | yes | approved |
| `crossSourceAgreement` | Degree of agreement across available sources. | yes | approved |
| `extractionCertainty` | Confidence that extraction or interpretation captured the evidence correctly. | yes | approved |

## Approved Phase 1 baseline aggregation formula

This formula is approved as the Phase 1 baseline. Later calibration must publish a superseding version rather than mutating `1.0.0`.

Let:

- `C = {sourceReliability, specificity, recency, crossSourceAgreement, extractionCertainty}`
- `present(C)` be all components with numeric values in `[0, 1]`
- `required(C)` be all five components
- `conflict_penalty` be `0.15` when the value or evidence is contradicted; otherwise `0`
- `staleness_penalty` be `0.10` when the value or evidence is stale; otherwise `0`

Approved aggregate:

```text
if any required component is missing:
  aggregate_score = null
  aggregate_status = "unassessed"
else:
  base = mean(present(C))
  aggregate_score = clamp(base - conflict_penalty - staleness_penalty, 0, 1)
  aggregate_status = "assessed"
```

The equal-weight mean is deliberately simple for reviewability and is approved for Phase 1 baseline use.

## Required missing component behavior

If any required component is missing:

- `aggregate_score` remains `null`
- confidence status is `unassessed`
- no fabricated precision is displayed
- downstream score confidence must not substitute `0`, `0.5`, or another default
- the result must list the missing confidence component

## Conflict and staleness behavior

| Condition | Approved Phase 1 baseline behavior | approval_status |
|---|---|---|
| Contradicted evidence/value | Apply `conflict_penalty = 0.15`; create or preserve research gap. | approved |
| Stale evidence/value | Apply `staleness_penalty = 0.10`; score result may become provisional when required input is stale. | approved |
| Contradicted and stale | Apply both penalties; clamp final aggregate to `[0, 1]`. | approved |
| No freshness policy | Do not penalize solely for age; report `no_policy` staleness status. | approved |

## Activation guard

The engine must refuse production activation when:

- `approval_status` is not approved
- replay/golden tests for the approved formula are missing
- any score definition attempts to persist aggregate confidence from an unapproved policy as final production confidence

## Relationship to Data Confidence score

The `data_confidence` score family references this approved policy. It uses confidence assessment components rather than inventing Variable Dictionary keys for evidence quality, agreement, recency, or verification.
