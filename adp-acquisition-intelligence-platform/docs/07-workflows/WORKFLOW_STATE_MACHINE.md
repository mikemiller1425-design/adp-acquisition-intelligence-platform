# Workflow State Machine

**Version:** 1.1.0

Canonical storage keys are `snake_case`. Diagrams may show Title Case labels. Parallel dimensions, matrices, consent precedence, and persistence rules are authoritative in [Operational State and Consent Model](../05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md).

## Prospect lifecycle (`prospect_stage`)

```text
raw → normalization → research → scored → review
                                      ↘ research_required ↗ research
review → qualified → discovery_scheduled → discovery_completed
      ↘ conditionally_qualified outcome routes to qualified with blocking conditions
      ↘ nurture                         → outreach_ready → outreach_active
      ↘ disqualified                                      → opportunity
      ↘ duplicate / existing_relationship / out_of_territory
```

`conditionally_qualified` is a qualification-review outcome, not a `prospect_stage`. It stores blocking `qualification_conditions`, routes to `prospect_stage=qualified`, creates blocking tasks, and blocks discovery/outreach until every condition is satisfied or waived.

`nurture`, `disqualified`, `duplicate`, `existing_relationship`, and `out_of_territory` are routed states, not destructive deletion. Re-entry requires an authorized reason and creates an `operational_state_transitions` row. Detailed from/to rules, roles, reason codes, and side effects are in [Prospect Re-entry Policy](../workflows/REENTRY_POLICY.md).

## Canonical `prospect_stage` transitions

| From → To | Entry/exit guard | Required output / actor |
|---|---|---|
| raw → normalization | identity fields present | normalized candidate; importer/researcher |
| normalization → research | validation passes; duplicate disposition complete | canonical organization, owner/territory check |
| research → scored | applicable minimum inputs attempted; evidence attached | completeness and score run |
| scored → review | results persisted and explainable | review task |
| review → research_required | critical unknown/conflict | prioritized research gaps and due task |
| research_required → research | gaps assigned / work resumed | research task; return path is `research → scored → review` |
| review → qualified | reviewer accepts motion and no blocking policy flag | primary motion, next action |
| review → qualified via `conditionally_qualified` outcome | reviewer accepts motion but requires blocking conditions | `qualification_conditions` with owner and due date, blocking tasks, computed recommendation preserved |
| review → nurture | plausible but timing/readiness inadequate | revisit date/reason |
| review → terminal route | structured reason and authorization | audit + closed tasks |
| qualified → discovery_scheduled | contact, owner, date, agenda | session and participants |
| discovery_scheduled → discovery_completed | session held; answers saved; mappings reviewed | confirmed values, score deltas |
| discovery_completed → outreach_ready | qualification remains valid; intended channel effective permission evaluable | sequence/template selection |
| outreach_ready → outreach_active | draft approved, channel permission `allowed`, first activity recorded | next follow-up |
| outreach_active → opportunity | positive validated commercial interest | opportunity (`opportunity_stage=open`), value band, owner; set `prospect_stage=opportunity` |

## Parallel operational dimensions

These MUST be persisted and queried as separate fields. They MUST NOT be compressed into `organizations.record_status` or any single overloaded status column.

| Dimension | Subject | Example coexistence |
|---|---|---|
| `prospect_stage` | Organization | `outreach_active` or `opportunity` |
| `research_status` | Organization | `gaps_open` while outreach proceeds |
| `outreach_status` | Organization | `blocked_restriction` without changing fit scores |
| `data_freshness_status` | Organization | `stale` drives research gaps |
| `opportunity_stage` | Opportunity | moves independently after creation |

Allowed values, initial/terminal values, matrices, actors, and side effects: [Operational State and Consent Model](../05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md).

## Opportunity stages (`opportunity_stage`)

`open → discovery_validation → solution_alignment → commercial_review → won | lost | nurture`. Exact display labels may be adapted via ADR, but storage keys above are canonical for Phase 1. Stages need entry/exit criteria, required next action, probability policy, and maximum-age alert. Stage probability is configured; users cannot imply certainty by free-form percent without override reason.

## Consent-aware outreach blocks

- Outreach activity completion on a channel requires effective permission `allowed` for that contact/organization/channel.
- Opt-out, restriction, global suppression, expired/revoked permission, or `unknown` permission blocks the attempt, audits the denial, and may set `outreach_status` to `blocked_restriction` or `do_not_contact` **without** changing score results or inventing qualification changes.
- UI hiding is not enforcement.

## Blocked transitions

- Any active pursuit when organization is unresolved duplicate, unauthorized territory, restricted, or an incompatible existing relationship.
- Discovery or outreach after `conditionally_qualified` until every blocking qualification condition is satisfied or waived by an authorized reviewer/admin.
- Outreach when opt-out/channel restriction/`unknown` permission applies, no recipient exists, or content lacks required human approval.
- Opportunity creation from insufficient-data scoring without explicit reviewer exception.
- Discovery completion while required session metadata or answer confirmation is incomplete.
- Score activation when configuration validation or golden tests fail.
- Illegal parallel-dimension transitions per the Operational State matrices.

## Transition contract

Every transition records subject, dimension, prior/new state, actor (user or system), UTC timestamp, command correlation ID, reason code/note, validation results, score/review references, and authorized exception into `operational_state_transitions` plus audit events. Entry actions are idempotent. Failure leaves the prior state intact.

## Service-level alerts

Configuration defines reminders for overdue research, discovery follow-up, next outreach, and time in opportunity stage. Alerts create tasks; they do not autonomously advance stages.

## Phase 2 seam

Phase 1 may assign a dormant organization role indicating potential advisor influence, but it cannot transition into partner identified, enablement, introduction requested/received, or referral converted. Those belong to Phase 2.
