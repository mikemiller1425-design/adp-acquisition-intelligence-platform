# Prospect Re-entry Policy

**Version:** 1.0.0
**Status:** Active Phase 1 baseline
**Approval:** repository owner (mikemiller1425-design) via Prompt 6 unblock instruction 2026-07-22

This policy resolves CONF-015 for Phase 1. Routed states are not destructive deletion; they pause or redirect active pursuit until an authorized actor records a structured reason. Every re-entry command writes `operational_state_transitions` and an audit event.

## Common command requirements

All re-entry commands require:

- subject organization ID,
- current `prospect_stage`,
- target `prospect_stage`,
- actor ID and role,
- structured `reason_code`,
- reason note when the code is `other_authorized`,
- owner for reopened work,
- due date for the next blocking or follow-up task,
- validation result snapshot,
- score/review references when re-entry is based on changed qualification evidence.

## Allowed re-entry routes

| From state | Allowed target | Roles | Required reason codes | Side effects |
|---|---|---|---|---|
| `nurture` | `qualified` | reviewer, admin | `timing_window_opened`, `new_buying_signal`, `owner_approved_exception` | Create qualification follow-up task; require owner and due date; preserve prior nurture reason; do not clear research gaps. |
| `nurture` | `research` | researcher, reviewer, admin | `new_source_available`, `stale_data_refresh`, `owner_approved_exception` | Reopen or create research task; set `research_status=gaps_open`; invalidate stale score result by queuing recalculation after research updates. |
| `nurture` | `review` | reviewer, admin | `review_requested`, `score_changed`, `owner_approved_exception` | Create review task; require current score/completeness snapshot; preserve computed recommendation separately from reviewer outcome. |
| `disqualified` | `review` | reviewer, admin | `disqualification_reversed`, `new_evidence`, `policy_exception_approved` | Preserve original disqualification reason; create review task with owner and due date; require reviewer note. |
| `disqualified` | `research` | reviewer, admin | `new_evidence`, `data_correction`, `policy_exception_approved` | Reopen research task; set `research_status=gaps_open`; queue scoring recalculation after corrected values are confirmed. |
| `duplicate` | `research` | researcher, admin | `false_duplicate`, `merge_reversed`, `identity_correction` | Preserve duplicate disposition history; create identity-resolution task; require duplicate candidate reference when available. |
| `duplicate` | `review` | reviewer, admin | `false_duplicate`, `merge_reversed`, `owner_approved_exception` | Create review task after identity correction; require owner and due date; do not resurrect absorbed child records without merge-reversal process. |
| `existing_relationship` | `review` | reviewer, admin | `relationship_ended`, `relationship_scope_changed`, `owner_approved_exception` | Preserve relationship evidence; create relationship verification task; require territory/owner validation before any outreach path. |
| `existing_relationship` | `qualified` | reviewer, admin | `relationship_waived`, `approved_cross_sell_exception` | Require explicit authorized exception; create next action with owner/due date; outreach remains blocked until consent and relationship checks pass. |
| `out_of_territory` | `research` | researcher, reviewer, admin | `territory_corrected`, `assignment_changed`, `owner_approved_exception` | Re-run territory/assignment validation; create research/assignment task; preserve prior territory route. |
| `out_of_territory` | `review` | reviewer, admin | `territory_corrected`, `assignment_changed`, `owner_approved_exception` | Create review task; require active owner and territory before qualification route. |
| `out_of_territory` | `qualified` | reviewer, admin | `territory_corrected`, `assignment_changed` | Allowed only when assignment validation passes; create next action with owner and due date. |

Blank routes are blocked. Re-entry directly to `discovery_scheduled`, `outreach_ready`, `outreach_active`, or `opportunity` is blocked; the organization must pass `review` or `qualified` guards first.

## Reason-code definitions

| Code | Meaning |
|---|---|
| `timing_window_opened` | A prior timing blocker is no longer valid. |
| `new_buying_signal` | New evidence indicates current commercial interest. |
| `new_source_available` | A source can fill prior research gaps. |
| `stale_data_refresh` | Data age requires renewed research before review. |
| `review_requested` | Authorized reviewer requests renewed human review. |
| `score_changed` | Recalculation materially changed score, tier, or recommendation. |
| `disqualification_reversed` | Prior disqualification was explicitly reversed. |
| `new_evidence` | New evidence challenges the prior terminal/routed outcome. |
| `data_correction` | Prior data was corrected or superseded. |
| `policy_exception_approved` | Authorized exception permits renewed evaluation. |
| `false_duplicate` | Duplicate disposition was incorrect. |
| `merge_reversed` | Merge reversal restored a candidate for pursuit. |
| `identity_correction` | Identity evidence changed enough to resume workflow. |
| `relationship_ended` | Existing relationship no longer blocks pursuit. |
| `relationship_scope_changed` | Relationship scope no longer conflicts with the motion. |
| `relationship_waived` | Authorized owner waived the relationship block. |
| `approved_cross_sell_exception` | Authorized exception allows pursuit despite relationship context. |
| `territory_corrected` | Territory data was corrected. |
| `assignment_changed` | Owner or territory assignment changed. |
| `owner_approved_exception` | Repository/product owner approved an exception for Phase 1. |
| `other_authorized` | Admin-only fallback; reason note required. |

## Research-required return path

`research_required` is an active review outcome represented as `prospect_stage=research_required`. Its canonical return path is:

```text
review -> research_required -> research -> scored -> review
```

Required side effects:

1. `review -> research_required` creates blocking research tasks for every required gap, with owner and due date.
2. `research_required -> research` assigns or resumes research work and sets `research_status=in_progress` or `gaps_open`.
3. `research -> scored` requires evidence/value updates or a documented no-new-data outcome, then queues score recalculation.
4. `scored -> review` creates a new review task and preserves the prior computed recommendation separately from any reviewer outcome.
