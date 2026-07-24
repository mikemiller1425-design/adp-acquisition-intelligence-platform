# Phase 1.2 — Architecture Review

**Date:** 2026-07-24  
**Review level:** Prompt / milestone (Phase 1.2 research-run orchestration)  
**Checklist:** `docs/11-implementation/16_ARCHITECTURE_REVIEW_CHECKLIST.md`  
**Branch:** `cursor/phase-1-2-live-research-orchestration-fb9d`  
**Canonical PR:** [#22](https://github.com/mikemiller1425-design/adp-acquisition-intelligence-platform/pull/22) (supersedes [#21](https://github.com/mikemiller1425-design/adp-acquisition-intelligence-platform/pull/21))  
**Integration gate:** Cleared after PR #20 merge — see [PHASE_1_2_INTEGRATION_GATE_BLOCKED.md](PHASE_1_2_INTEGRATION_GATE_BLOCKED.md)

## Verdict

**Acceptable for persistent fixture pilot** of Start Research Run orchestration once PostgreSQL durable worker E2E evidence is recorded in the test report.  
**Not acceptable** to claim controlled-external or production live research readiness while RB-015 (and related) remain OPEN and `ADP_LIVE_RESEARCH_ENABLED` defaults false.

## Scope reviewed

- Research run domain (modes, transitions, estimates, gates, circuit breakers)
- Application service + job handler `research.run.execute`
- Preferred collection order + approvals/metrics persistence
- Web composition: deferred dispatcher (memory) vs `DurableJobDispatcher` + `PostgresDurableJobStore` (durable)
- Canonical `SourceRegistryPort` over `approved_sources`
- Target-segment resolution to real organization UUIDs (no synthetic PG org IDs)
- Worker lease reclaim / heartbeat / checkpoint idempotency
- UI routes under `/research/runs*`
- Draft archive/live adapters fail-closed with DNS/IP validation before transport
- Documentation maturity labels

## Integration-gate findings (from PR #21) — remediated on #22

```yaml
id: AR-P12-INT-001
review_scope: phase-1-2-integration-gate
severity: high
category: architecture
status: remediated
finding: Next.js launch path previously used DeferredResearchExecuteDispatcher even for postgres+durable.
required_action: Compose DurableJobDispatcher (processInline false) and fail closed if durable cannot initialize.
verification: apps/web/e2e/research-run-postgres-durable-orchestration.spec.ts
owner: research_eng
```

```yaml
id: AR-P12-INT-002
review_scope: phase-1-2-integration-gate
severity: high
category: security
status: remediated
finding: Web launch previously synthesized source gates instead of canonical approved_sources.
required_action: SourceRegistryPort; validate at preview/launch; snapshot effective source/policy versions.
verification: Unit source-registry tests + PG durable E2E
owner: research_eng
```

## Findings (ongoing)

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
impact: Behavior differs between memory UI and durable worker paths; checkpoints keep both correct.
required_action: Keep memory deferred path for deterministic tests; durable path uses Postgres job store.
verification: Playwright memory + postgres durable orchestration E2Es
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
status: remediated
requirement_source: docs/research/RESEARCH_RUN_TEST_REPORT.md
finding: Dedicated PostgreSQL research-run durable-queue process-restart E2E was missing.
required_action: Add Next + worker + PG Playwright suite (`test:e2e:research-run-postgres`).
verification: research-run-postgres-durable-orchestration.spec.ts
owner: research_eng
```

## Checklist highlights

- [x] Phase 1 non-goals preserved (no unrestricted crawl, no auto-accept)
- [x] Live egress default disabled
- [x] UI avoids scrape/scraper labeling
- [x] Blockers RB-014–017 not closed by this change
- [x] Preferred collection order enforced in orchestrator
- [x] Dual gates enforced server-side and again before network access
- [x] Durable web→worker queue boundary (implementation; evidence in test report)
- [x] Canonical SourceRegistryPort for PG launches
- [ ] Independent security/privacy sign-off (RB-001/002) — still OPEN

## Recommendation

```yaml
recommendation: READY_FOR_PERSISTENT_FIXTURE_PILOT
memory_fixture_ui: available
durable_queue_claim: verified_by_pg_worker_e2e
live_egress: NOT_READY
rb_001_through_017: OPEN
```
