# Phase 1.2 — Research Run Completion

**Date:** 2026-07-24  
**Branch:** `cursor/phase-1-2-live-research-orchestration-dd2b`  
**PR:** [#21](https://github.com/mikemiller1425-design/adp-acquisition-intelligence-platform/pull/21)  
**Integration gate:** **BLOCKED** — see [PHASE_1_2_INTEGRATION_GATE_BLOCKED.md](../01-reviews/PHASE_1_2_INTEGRATION_GATE_BLOCKED.md)  
**Recommendation (current):** memory fixture UI only — **not** READY FOR PERSISTENT FIXTURE PILOT  
**Not ready:** persistent durable queue claim, controlled external pilot, production live research

## Capability claims (separate)

| Capability | Claim |
|---|---|
| Memory fixture UI | Implemented (prior commits on this branch) |
| PostgreSQL persistence (run tables) | Schema present; full durable E2E **not** claimed |
| Durable queue (web → `durable_jobs`) | **Not verified** — web still uses deferred dispatcher for launches |
| Separate worker execution | Worker poll seam exists; PG worker E2E **not** passed |
| Restart recovery | **Not verified** under integration-gate suite |
| Approved-source integration | Synthetic `fixtureSourcesFor()` still used for web launch authz |
| External egress authorization | Fail-closed; RB-014–017 **OPEN** |

## Delivered (pre-repair baseline)

- Schema migration `0012` + Drizzle research-run tables / durable job seam
- `ResearchRunService` (preview, createAndLaunch, pause, resume, cancel, execute)
- Launch gates + safety dual-gate adapters (Common Crawl + Official Website drafts)
- Web UI: hub CTA, `/research/runs/new`, `/research/runs`, `/research/runs/[id]`
- Server actions: `previewOrLaunchResearchRunAction` + lifecycle actions
- Playwright memory orchestration E2E
- Operator / safety / architecture docs

## Integration-gate repair status

**Stopped:** PR #20 is **OPEN** / not merged. Rebase + durable-queue + SourceRegistryPort + PG worker E2E repairs are deferred.

## Defaults that must stay off

- `ADP_LIVE_RESEARCH_ENABLED` → **false** by default
- No owner blockers closed (RB-014–017 remain **OPEN**)

## Evidence pointers

- Blocked gate: `docs/01-reviews/PHASE_1_2_INTEGRATION_GATE_BLOCKED.md`
- Architecture: `docs/research/LIVE_RESEARCH_RUN_ARCHITECTURE.md`
- Safety: `docs/research/RESEARCH_RUN_SAFETY_CONTROLS.md`
- Operator: `docs/research/RESEARCH_RUN_OPERATOR_GUIDE.md`
- Tests: `docs/research/RESEARCH_RUN_TEST_REPORT.md`
- Architecture review: `docs/01-reviews/PHASE_1_2_ARCHITECTURE_REVIEW.md`

## Explicit non-closure

Phase 1.2 must **not** claim the persistent queue/worker boundary works until the separate PostgreSQL worker E2E passes. It does **not** close RB-014, RB-015, RB-016, or RB-017. See `docs/release/PHASE1_RELEASE_BLOCKERS.md`.
