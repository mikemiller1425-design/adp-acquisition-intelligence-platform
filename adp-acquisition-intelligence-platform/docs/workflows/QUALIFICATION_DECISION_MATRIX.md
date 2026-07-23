# Qualification Decision Matrix

**Executable source:** `packages/qualification/src/domain/qualification.ts`

`conditionally_qualified` remains a qualification outcome, not a `prospect_stage`. It routes to `prospect_stage=qualified`, creates blocking `qualification_conditions`, and preserves computed score recommendations separately from reviewer outcomes.

| Outcome | Target `prospect_stage` | Roles | Required data | Side effects |
|---|---|---|---|---|
| `qualified` | `qualified` | reviewer, admin | assignment + territory validation | decision history, operational transition |
| `conditionally_qualified` | `qualified` | reviewer, admin | blocking conditions with owner and due date; assignment + territory validation | blocking tasks, condition rows, decision history, operational transition |
| `research_required` | `research_required` | reviewer, admin | required gaps and gap tasks | blocking research tasks, decision history, operational transition |
| `nurture` | `nurture` | reviewer, admin | structured reason | decision history, prior intelligence retained |
| `disqualified` | `disqualified` | reviewer, admin | active controlled disqualification reason | decision history, prior intelligence retained |
| `duplicate` | `duplicate` | reviewer, admin | structured reason | decision history, identity disposition retained |
| `existing_relationship` | `existing_relationship` | reviewer, admin | structured reason | decision history, relationship evidence retained |
| `out_of_territory` | `out_of_territory` | reviewer, admin | territory validation and structured reason | decision history, territory route retained |

## Invariants

1. Decisions are append-only rows in `qualification_decisions`; supersession creates a new row with `supersedes_decision_id`.
2. Review lifecycle is stored on `qualification_reviews` for queue/workspace filtering.
3. Score results are linked, never mutated, by qualification decisions.
4. Reviewer recommendation overrides are stored in `qualification_recommendation_overrides` and on the review summary; computed score results remain unchanged.
5. Prospect-stage changes go through `OperationalStateService` via `QualificationTransitionCoordinator`.
6. Consent restrictions are carried as indicators and guards for later outreach; they do not change fit scores.
7. Discovery/outreach after conditional qualification remains blocked until all blocking conditions are resolved or waived.

## Re-entry

Routed-state re-entry is defined by [REENTRY_POLICY.md](REENTRY_POLICY.md) and executable TypeScript in `packages/qualification/src/domain/reentry-policy.ts`. Direct re-entry to discovery, outreach, or opportunity states remains blocked.
