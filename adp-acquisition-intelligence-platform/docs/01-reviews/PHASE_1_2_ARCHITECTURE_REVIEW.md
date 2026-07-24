# Phase 1.2 — Architecture Review

**Date:** 2026-07-24  
**Review level:** Prompt / milestone (Phase 1.2 research-run orchestration)  
**Checklist:** `docs/11-implementation/16_ARCHITECTURE_REVIEW_CHECKLIST.md`  
**Branch:** `cursor/phase-1-2-live-research-orchestration-fb9d`

## Verdict

**Acceptable for fixture pilot** of Start Research Run orchestration.  
**No unaccepted high-severity engineering finding** for fixture-only operation.  
**Not acceptable** to claim controlled-external or production live research readiness while RB-015 (and related) remain OPEN and `ADP_LIVE_RESEARCH_ENABLED` defaults false.

## Scope reviewed

- Research run domain (modes, transitions, estimates, gates, circuit breakers)
- Application service + job handler `research.run.execute`
- Preferred collection order + approvals/metrics persistence
- Web composition (deferred execute dispatcher for pause/resume interleaving)
- UI routes under `/research/runs*`
- Draft archive/live adapters fail-closed with DNS/IP validation before transport
- Documentation maturity labels

## Findings

```yaml
id: AR-P12-001
review_scope: phase-1-2
severity: medium
category: architecture
status: accepted_risk
requirement_source: docs/research/LIVE_RESEARCH_RUN_ARCHITECTURE.md
affected_files:
  - apps/web/src/lib/research-runtime.ts
finding: Web memory runtime defers research.run.execute for UI pause/resume; durable worker uses Postgres SKIP LOCKED when ADP_JOB_QUEUE=durable.
impact: Behavior differs slightly between web memory UI and inline unit dispatcher, but checkpoints keep both correct.
required_action: Documented in operator guide / test report.
verification: Playwright orchestration E2E + checkpoint recovery unit test
owner: research_eng
```

```yaml
id: AR-P12-002
review_scope: phase-1-2
severity: high
category: security
status: open
requirement_source: docs/release/PHASE1_RELEASE_BLOCKERS.md#RB-015
affected_files:
  - packages/research/src/infrastructure/adapters/archive-and-live.ts
finding: Live/archive adapters exist but must not be enabled without owner approvals.
impact: Premature enablement would violate Phase 1 release gates.
required_action: Keep ADP_LIVE_RESEARCH_ENABLED false; leave RB-015 OPEN.
verification: Default env + launch gates block live/archive modes
owner: legal_privacy_security
```

```yaml
id: AR-P12-003
review_scope: phase-1-2
severity: medium
category: testing
status: accepted_risk
requirement_source: docs/research/RESEARCH_RUN_TEST_REPORT.md
finding: Full postgres research-run durable-queue process-restart E2E is not yet a dedicated Playwright suite.
impact: Restart safety is covered by unit checkpoint recovery + Phase 1.1 postgres persistence E2E for related tables.
required_action: Follow-up PG research-run orchestration E2E when promoting beyond fixture pilot.
verification: research-run.unit.test.ts worker restart checkpoint case
owner: research_eng
```

## Checklist highlights

- [x] Phase 1 non-goals preserved (no unrestricted crawl, no auto-accept)
- [x] Live egress default disabled
- [x] UI avoids scrape/scraper labeling
- [x] Blockers RB-014–017 not closed by this change
- [x] Preferred collection order enforced in orchestrator
- [x] Dual gates enforced server-side and again before network access
- [ ] Independent security/privacy sign-off (RB-001/002) — out of scope / still OPEN

## Recommendation

```yaml
recommendation: READY_FOR_FIXTURE_PILOT
live_egress: NOT_READY
blocking_engineering_findings: 0
unaccepted_high_severity: 0
```
