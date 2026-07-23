# Qualification Exception Runbook

## Purpose

Use this runbook when a reviewer/admin needs to handle conditional qualification, disqualification correction, routed-state re-entry, or recommendation override exceptions.

## Conditional qualification

1. Confirm the review outcome is `conditionally_qualified`.
2. Verify each blocking condition has:
   - owner,
   - due date,
   - title/key,
   - linked task.
3. Discovery/outreach must remain blocked until every blocking condition is `resolved` or `waived`.
4. Waivers require reviewer/admin role, reason code, and waiver note when policy requires one.

## Recommendation overrides

1. Review the computed recommendation and linked score result IDs.
2. Record reviewer recommendation separately with reason code.
3. Do not mutate `score_results`; computed score history is the audit source.
4. Check `qualification_recommendation_overrides` for override evidence.

## Disqualification and routed outcomes

1. Use active keys from `disqualification_reasons`.
2. Confirm the decision row exists in `qualification_decisions`.
3. Preserve review scores, evidence, and review summary.
4. Do not hard-delete qualification rows. The database rejects deletes on Prompt 6 tables.

## Re-entry from routed states

1. Check [REENTRY_POLICY.md](../workflows/REENTRY_POLICY.md) for allowed from/to route, roles, and reason codes.
2. Require owner and due date for reopened work.
3. Run transition through `ReentryService`; it delegates state movement to `OperationalStateService`.
4. Direct re-entry to discovery, outreach, or opportunity is not allowed.

## Incident checks

If a transition appears partially applied:

1. Query `qualification_decisions` by `review_id`.
2. Query `operational_state_transitions` by `subject_id` and `related_review_id`.
3. Query `audit_events` and `outbox_events` for the command correlation ID.
4. If the command was run outside a transaction, create a corrective review/decision rather than editing history rows.

## Escalation

Escalate to engineering owner if:

- delete protection is bypassed,
- score results were mutated by a qualification path,
- a conditionally qualified organization advanced to discovery/outreach with pending blocking conditions,
- a re-entry route violates `REENTRY_POLICY.md`,
- outbox/audit events are missing for a committed decision.
