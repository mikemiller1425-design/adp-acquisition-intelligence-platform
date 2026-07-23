# Phase 1 Exit Contract

**Version:** 1.0.0  
**Status:** Release definition of done

The machine-readable authority is [phase_1_exit_contract.yaml](phase_1_exit_contract.yaml). This document explains governance and sign-off. An item is complete only when its required automated and/or manual evidence is linked in the implementation repository; “implemented” without passing evidence is not complete.

## Release gates

1. **Foundation:** deterministic setup, validated configuration, web/API/worker health, central logging/errors/auth/audit/jobs, CI checks.
2. **Data integrity:** migrations, constraints, archive/audit behavior, organization/contact separation, ownership/territory, restore rehearsal.
3. **Collection:** manual entry and reversible traceable CSV pipeline with normalization and human duplicate review.
4. **Intelligence:** evidence/provenance, semantic missing states, confidence, purpose completeness, gap prioritization.
5. **Scoring:** all required score families, versioning, explanations, input snapshots, deterministic replay, human recommendation override.
6. **Operations:** qualification, guarded workflow, discovery mapping/recalculation, human-approved outreach tracking, opportunities/stage history, next actions.
7. **Visualization:** eight dashboards, drilldowns, saved views, permission-scoped CSV exports, metric reconciliation.
8. **Quality:** required test layers, prompt-level and final architecture reviews, security/privacy review, accessibility, target-volume performance, runbooks and end-to-end acceptance.
9. **Scope:** Phase 2 referral workflow and autonomous sending are absent.

## Evidence standard

Evidence records the check ID, artifact or CI URL/path, commit, environment, command/test case, execution time, result, and approver where manual. Screenshots alone do not prove calculations; use fixture reconciliation. Manual evidence is reserved for usability, operational rehearsal, stakeholder acceptance, and controls not reasonably automated.

## Exceptions

Exceptions require owner, rationale, risk, compensating control, expiration, and approval. Critical security, data-loss, score-reproducibility, authorization, audit, backup/restore, or end-to-end failures cannot be waived for Phase 1 release.

## Sign-off roles

- Product owner: scope, workflows, dashboard usefulness, Phase 2 boundary.
- Business/scoring owner: definitions, rubrics, active score versions, explanations.
- Engineering owner: architecture, operations, performance, migration/recovery.
- Security/privacy owner: data policy, authorization, export and logging controls.
- QA/release owner: test evidence, defect status, E2E and checklist completeness.

## Completion rule

All YAML items marked `required: true` must be `passed`, all blocking defects and architecture findings closed, required sign-offs recorded, and the reference end-to-end scenario completed without direct database intervention. Otherwise Phase 1 is not complete. Review procedure and severity rules are defined in the [Architecture Review Checklist](../11-implementation/16_ARCHITECTURE_REVIEW_CHECKLIST.md).

## Prompt 6 evidence update

Prompt 6 contributes partial automated evidence for release gate 6 (Operations):

- qualification review persistence and decision history,
- conditional qualification blocking conditions and tasks,
- score-result preservation during reviewer overrides,
- routed-state re-entry policy enforcement,
- qualification audit/outbox event adapters,
- PG17 integration tests and contract tests.

This does **not** complete release gate 6. Discovery mapping/recalculation, outreach tracking, opportunities/stage history, UI workflows, E2E evidence, and release sign-offs remain pending in later prompts.
