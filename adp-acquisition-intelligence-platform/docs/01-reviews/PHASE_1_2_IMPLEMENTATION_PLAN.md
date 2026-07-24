# Phase 1.2 — Bounded Implementation Plan

**Date:** 2026-07-24  
**Baseline:** PR #20 head `d9a810897fe15c126af83b32fae83197ae3acc5b` (OPEN; not merged — used as accepted head)  
**Branch:** `cursor/phase-1-2-live-research-orchestration-fb9d`  
**Prior tip:** `origin/cursor/phase-1-2-live-research-orchestration-dd2b` (carried forward; gaps closed on this branch)

## Entry-gate findings

| Item | Result |
|---|---|
| Phase 1.1 docs / architecture | Read — fixture pilot, persistent PG E2E, atomic claim accept |
| PR #20 | OPEN — use final head as baseline (do not wait for merge) |
| Live egress default | Disabled (`ADP_LIVE_RESEARCH_ENABLED` defaults false) |
| Durable queue | Postgres `durable_jobs` + worker poll when `ADP_JOB_QUEUE=durable` |

### Release blockers governing this prompt

| Blocker | Governs | Status (unchanged) |
|---|---|---|
| RB-015 | Common Crawl / archived-web + live org-site legal/privacy/security | **OPEN** — adapters stay draft; no live egress by default |
| RB-016 | Snapshot object-storage backup/retention | **OPEN** — store `storage_key` seam only |
| RB-017 | Extraction / AI provider | **OPEN** — deterministic extractor only; human review required |
| RB-001 / RB-002 | Independent security / privacy reviews | **OPEN** |
| RB-014 | Licensed structured sources | **OPEN** — preferred-order slot exists; no licensed enablement |

**Do not close** RB-001–RB-017 in this PR.

## Preferred collection order (enforced in orchestrator)

1. Approved structured/licensed source (slot; gated by registry + RB-014)
2. Existing internal snapshot (reuse if within freshness threshold)
3. Common Crawl archive adapter (draft; recorded/fixture bodies in tests)
4. Official organization website live fallback (draft + kill switch + `ADP_LIVE_RESEARCH_ENABLED`)
5. Human review before canonical intelligence changes (unchanged)

## Delivery slices (this branch closes residual gaps)

1. Registry-aligned source keys in UI (`archived_web_fixture`)
2. Persist `research_run_approvals` + `research_run_metrics`; operator confirmation → approval row
3. `awaiting_approval` for non-fixture modes that pass technical gates but need operator confirm
4. Preferred-order orchestration with registry-driven source gates inside `processTarget`
5. Official website adapter DNS/IP validation before transport
6. Error-rate + request-budget circuit breakers on the run path
7. Detail UI: archive/live counters, kill switch (authorized), blocker deep-links, export report
8. Tests: archive hit/miss, authz denial, circuit breaker, worker-restart checkpoint recovery, DNS gate
9. Docs + `.env.example` live-flag documentation

## Explicit non-goals

No unrestricted crawl, LinkedIn, CAPTCHA bypass, proxy evasion, auto-accept claims, live egress by default, production deploy, or merging without approval.

## Recommendation target after exit gates

**READY FOR FIXTURE PILOT** for Start Research Run orchestration.  
**NOT READY** for controlled external pilot or production until RB-015 (and related) close with owner evidence.
