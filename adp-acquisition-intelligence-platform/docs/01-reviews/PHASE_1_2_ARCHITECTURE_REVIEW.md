# Phase 1.2 — Architecture Review

**Date:** 2026-07-24  
**Review level:** Prompt / milestone (Phase 1.2 research-run orchestration)  
**Checklist:** `docs/11-implementation/16_ARCHITECTURE_REVIEW_CHECKLIST.md`  
**Integration gate:** **BLOCKED on PR #20** — [PHASE_1_2_INTEGRATION_GATE_BLOCKED.md](PHASE_1_2_INTEGRATION_GATE_BLOCKED.md)

## Verdict

**Acceptable for memory fixture UI only.**  
**Do not claim** durable PostgreSQL queue/worker boundary, restart recovery under separate worker, or approved-source registry integration until the integration-gate repair completes and the PostgreSQL durable E2E passes.  
**Not acceptable** to claim controlled-external or production live research readiness while RB-015 (and related) remain OPEN and `ADP_LIVE_RESEARCH_ENABLED` defaults false.

## Open high-severity engineering findings (integration gate)

```yaml
id: AR-P12-INT-001
review_scope: phase-1-2-integration-gate
severity: high
category: architecture
status: open
requirement_source: Phase 1.2 integration gate repair brief
affected_files:
  - apps/web/src/lib/research-runtime.ts
  - apps/web/src/lib/research-run-actions.ts
finding: Next.js launch path uses DeferredResearchExecuteDispatcher; not wired to PostgresDurableJobStore when ADP_RESEARCH_PROVIDER=postgres and ADP_JOB_QUEUE=durable.
impact: Web process can execute collection work; Next restart can lose deferred in-memory jobs; durable queue claim is not proven.
required_action: After PR #20 merge, compose DurableJobDispatcher for that configuration and fail closed if durable mode cannot initialize.
verification: Separate PostgreSQL + worker Playwright E2E
owner: research_eng
```

```yaml
id: AR-P12-INT-002
review_scope: phase-1-2-integration-gate
severity: high
category: security
status: open
requirement_source: Phase 1.2 integration gate repair brief
affected_files:
  - apps/web/src/lib/research-run-actions.ts
finding: Web launch authorization synthesizes source gates (fixtureSourcesFor) instead of loading canonical approved_sources via SourceRegistryPort.
impact: Preview/launch may not reflect registry lifecycle/reviews/kill switches for PostgreSQL runs.
required_action: Implement SourceRegistryPort; validate at preview, launch, and pre-retrieval; snapshot effective source/policy versions.
verification: Unit + PG E2E + zero-egress suite
owner: research_eng
```

## Findings (prior / accepted risk)

```yaml
id: AR-P12-001
review_scope: phase-1-2
severity: medium
category: architecture
status: accepted_risk
requirement_source: docs/research/LIVE_RESEARCH_RUN_ARCHITECTURE.md
affected_files:
  - apps/web/src/lib/research-runtime.ts
finding: Web memory runtime defers research.run.execute for UI pause/resume; sync unit dispatch still completes via nested enqueue.
impact: Behavior differs slightly between web memory UI and inline unit dispatcher, but checkpoints keep both correct for fixture-memory only.
required_action: Keep memory deferred path for deterministic tests; durable path must use Postgres job store after integration repair.
verification: Playwright memory orchestration E2E
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
verification: Default env + launch gates block live modes
owner: legal_privacy_security
```

## Checklist highlights

- [x] Phase 1 non-goals preserved (no unrestricted crawl, no auto-accept)
- [x] Live egress default disabled
- [x] UI avoids scrape/scraper labeling
- [x] Blockers RB-014–017 not closed by this change
- [ ] Durable web→worker queue boundary proven (blocked on PR #20 / E2E)
- [ ] Canonical SourceRegistryPort for PG launches (deferred)
- [ ] Independent security/privacy sign-off (RB-001/002) — still OPEN

## Recommendation

```yaml
recommendation: NOT_READY_FOR_PERSISTENT_FIXTURE_PILOT
memory_fixture_ui: available
durable_queue_claim: NOT_CLAIMED
live_egress: NOT_READY
blocking_reason: PR_20_NOT_MERGED
unaccepted_high_severity_integration_findings: 2
```
