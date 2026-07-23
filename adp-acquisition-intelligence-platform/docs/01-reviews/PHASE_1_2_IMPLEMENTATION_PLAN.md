# Phase 1.2 — Bounded Implementation Plan

**Date:** 2026-07-23  
**Baseline:** PR #20 head `d9a810897fe15c126af83b32fae83197ae3acc5b` (OPEN; not merged — used as accepted head)  
**Branch:** `cursor/phase-1-2-live-research-orchestration-dd2b`

## Entry-gate findings

| Item | Result |
|---|---|
| Phase 1.1 docs / architecture | Read — fixture pilot, persistent PG E2E, atomic claim accept |
| PR #20 | OPEN — use final head as baseline (do not wait for merge) |
| Live egress default | Disabled (`FixtureRetrievalPort`; `ADP_LIVE_RESEARCH_ENABLED` absent/false) |
| pg-boss | ADR-006 accepted; **not wired** — Phase 1.2 adds durable Postgres job queue + worker poller (pg-boss-compatible seam) |

### Release blockers governing this prompt

| Blocker | Governs | Status (unchanged) |
|---|---|---|
| RB-015 | Common Crawl / archived-web + live org-site legal/privacy/security | **OPEN** — adapters stay draft; no live egress by default |
| RB-016 | Snapshot object-storage backup/retention | **OPEN** — store `storage_key` seam only |
| RB-017 | Extraction / AI provider | **OPEN** — deterministic extractor only; human review required |
| RB-001 / RB-002 | Independent security / privacy reviews | **OPEN** |
| RB-014 | Licensed structured sources | **OPEN** — preferred order slot exists; no licensed enablement |

**Do not close** RB-001–RB-017 in this PR.

## Preferred collection order (enforced in orchestrator)

1. Approved structured/licensed source (slot; gated by registry + RB-014)
2. Existing internal snapshot (reuse if fresh)
3. Common Crawl archive adapter (draft; fixture/recorded in tests)
4. Official organization website live fallback (draft + kill switch + `ADP_LIVE_RESEARCH_ENABLED`)
5. Human review before canonical intelligence changes (unchanged)

## Delivery slices

1. **Schema** — migration `0012` + Drizzle: definitions, runs, targets, source_attempts, events, metrics, approvals, checkpoints; durable `job_queue` tables
2. **Domain** — run modes, state machine, launch gates, estimates, circuit breakers
3. **Adapters** — Common Crawl + Official Website production-shaped; **disabled** unless dual gates pass; fixture path retained
4. **Queue/worker** — API enqueues durable jobs; worker claims with `SKIP LOCKED`; restart-safe
5. **UI** — “Start Research Run” wizard + `/research/runs` list/detail (pause/resume/cancel)
6. **Tests** — unit, PG integration, unauthorized zero-request, Playwright orchestration (fixture mode)
7. **Docs** — architecture, adapters, operator guide, safety, test report, completion, blocker register note

## Explicit non-goals

No unrestricted crawl, LinkedIn, CAPTCHA bypass, proxy evasion, auto-accept claims, live egress by default, production deploy, or merging without approval.

## Recommendation target after exit gates

**READY FOR FIXTURE PILOT** for Start Research Run orchestration.  
**NOT READY** for controlled external pilot or production until RB-015 (and related) close with owner evidence.
