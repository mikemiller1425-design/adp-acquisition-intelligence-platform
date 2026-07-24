# Phase 1.2 — Research Run Completion

**Date:** 2026-07-24  
**Branch:** `cursor/phase-1-2-live-research-orchestration-fb9d`  
**Baseline:** PR #20 head (OPEN) `d9a810897fe15c126af83b32fae83197ae3acc5b`  
**Recommendation:** **READY FOR FIXTURE PILOT** for Start Research Run orchestration  
**Not ready:** controlled external pilot, production live research

## Delivered

- Schema migration `0012` + Drizzle research-run tables / durable job seam
- `ResearchRunService` (preview, createAndLaunch, approveRun, pause, resume, cancel, kill switch, execute, export)
- Preferred collection order: licensed slot → internal snapshot → archive → live fallback → human review
- Launch gates + dual-gate adapters (Common Crawl + Official Website drafts) with DNS validation
- Approvals + metrics persistence (`research_run_approvals`, `research_run_metrics`)
- Request-budget + error-rate circuit breakers
- Web UI: hub CTA, `/research/runs/new`, `/research/runs`, `/research/runs/[id]`
- Server actions including kill switch + export report
- Playwright memory orchestration E2E (operator confirmation checkbox)
- Operator / safety / architecture docs

## Maturity labels

| Capability | Label |
|---|---|
| Start Research Run (fixture) | **implemented** + **tested with fixtures** |
| Archive/live adapters | **implemented** (fail-closed) + **tested with fixtures** (recorded bodies / zero-outbound) |
| Durable queue/worker | **implemented** (Postgres `durable_jobs` when `ADP_JOB_QUEUE=durable`) |
| PostgreSQL research-run orchestration E2E | **partial** (tables/migration; full restart E2E follow-up) |
| Controlled external pilot | **not approved** (RB-015 OPEN) |
| Production-ready live research | **not claimed** |

## Defaults that must stay off

- `ADP_LIVE_RESEARCH_ENABLED` → **false** by default (documented in `.env.example`)
- No owner blockers closed (RB-014–017 remain **OPEN**)

## Evidence pointers

- Architecture: `docs/research/LIVE_RESEARCH_RUN_ARCHITECTURE.md`
- Safety: `docs/research/RESEARCH_RUN_SAFETY_CONTROLS.md`
- Operator: `docs/research/RESEARCH_RUN_OPERATOR_GUIDE.md`
- Tests: `docs/research/RESEARCH_RUN_TEST_REPORT.md`
- Architecture review: `docs/01-reviews/PHASE_1_2_ARCHITECTURE_REVIEW.md`
- Plan: `docs/01-reviews/PHASE_1_2_IMPLEMENTATION_PLAN.md`

## Explicit non-closure

Phase 1.2 adds orchestration UI and fixture-safe execution. It does **not** close RB-014, RB-015, RB-016, or RB-017. See `docs/release/PHASE1_RELEASE_BLOCKERS.md`.
