# Workflow State Machine

**Version:** 1.0.0

## Prospect lifecycle

```text
RAW → NORMALIZATION → RESEARCH → SCORED → REVIEW
                                      ↘ RESEARCH_REQUIRED ↗
REVIEW → QUALIFIED → DISCOVERY_SCHEDULED → DISCOVERY_COMPLETED
      ↘ NURTURE                         → OUTREACH_READY → OUTREACH_ACTIVE
      ↘ DISQUALIFIED                                      → OPPORTUNITY
      ↘ DUPLICATE / EXISTING_RELATIONSHIP / OUT_OF_TERRITORY
```

`NURTURE`, `DISQUALIFIED`, `DUPLICATE`, `EXISTING_RELATIONSHIP`, and `OUT_OF_TERRITORY` are routed states, not destructive deletion. Re-entry requires an authorized reason and creates stage history.

## Canonical transitions

| From → To | Entry/exit guard | Required output / actor |
|---|---|---|
| Raw → Normalization | identity fields present | normalized candidate; importer/researcher |
| Normalization → Research | validation passes; duplicate disposition complete | canonical organization, owner/territory check |
| Research → Scored | applicable minimum inputs attempted; evidence attached | completeness and score run |
| Scored → Review | results persisted and explainable | review task |
| Review → Research Required | critical unknown/conflict | prioritized research gaps and due task |
| Review → Qualified | reviewer accepts motion and no blocking policy flag | primary motion, next action |
| Review → Nurture | plausible but timing/readiness inadequate | revisit date/reason |
| Review → terminal route | structured reason and authorization | audit + closed tasks |
| Qualified → Discovery Scheduled | contact, owner, date, agenda | session and participants |
| Discovery Scheduled → Completed | session held; answers saved; mappings reviewed | confirmed values, score deltas |
| Discovery Completed → Outreach Ready | qualification remains valid; contact/channel permitted | sequence/template selection |
| Outreach Ready → Active | draft approved and first activity recorded | next follow-up |
| Outreach Active → Opportunity | positive validated commercial interest | opportunity, value band, owner |

## Opportunity stages

`OPEN → DISCOVERY/VALIDATION → SOLUTION_ALIGNMENT → COMMERCIAL_REVIEW → WON | LOST | NURTURE`. Exact labels may be adapted via ADR to the operating team, but stages need entry/exit criteria, required next action, probability policy, and maximum-age alert. Stage probability is configured; users cannot imply certainty by free-form percent without override reason.

## Blocked transitions

- Any active pursuit when organization is unresolved duplicate, unauthorized territory, restricted, or an incompatible existing relationship.
- Outreach when opt-out/channel restriction applies, no recipient exists, or content lacks required human approval.
- Opportunity creation from insufficient-data scoring without explicit reviewer exception.
- Discovery completion while required session metadata or answer confirmation is incomplete.
- Score activation when configuration validation or golden tests fail.

## Transition contract

Every transition records subject, prior/new state, actor, UTC timestamp, command correlation ID, reason code/note, validation results, score/review references, and authorized exception. Entry actions are idempotent. Failure leaves the prior state intact.

## Parallel states

Research status, outreach status, opportunity stage, and data freshness are separate dimensions. They MUST NOT be compressed into a single overloaded status column. Example: an organization can have `prospect_stage=OUTREACH_ACTIVE`, `research_status=GAPS_OPEN`, and an open opportunity. Dashboards display the appropriate dimension.

## Service-level alerts

Configuration defines reminders for overdue research, discovery follow-up, next outreach, and time in opportunity stage. Alerts create tasks; they do not autonomously advance stages.

## Phase 2 seam

Phase 1 may assign a dormant organization role indicating potential advisor influence, but it cannot transition into partner identified, enablement, introduction requested/received, or referral converted. Those belong to Phase 2.

