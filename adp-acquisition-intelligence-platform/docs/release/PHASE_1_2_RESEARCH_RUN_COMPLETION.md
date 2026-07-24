# Phase 1.2 — Research Run Completion

**Date:** 2026-07-24  
**Branch:** `cursor/phase-1-2-live-research-orchestration-fb9d`  
**Canonical PR:** [#22](https://github.com/mikemiller1425-design/adp-acquisition-intelligence-platform/pull/22)  
**Supersedes:** [#21](https://github.com/mikemiller1425-design/adp-acquisition-intelligence-platform/pull/21) (branch retained)  
**Baseline:** PR #20 merged into `main` at `685b1a543c618e941e2447947728d9f075b585bc` (head was `d9a810897fe15c126af83b32fae83197ae3acc5b`)  
**Recommendation:** **READY FOR PERSISTENT FIXTURE PILOT** (after PG durable E2E evidence in test report)  
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
- **Integration-gate repair:** web → Postgres `durable_jobs`; separate worker; `SourceRegistryPort`; target-segment UUID resolution; lease reclaim; zero-egress unit probes; PG durable Playwright suite
- Operator / safety / architecture docs + integration-gate status record

## Maturity labels

| Capability | Label |
|---|---|
| Start Research Run (fixture) | **implemented** + **tested with fixtures** |
| Archive/live adapters | **implemented** (fail-closed) + **tested with fixtures** (recorded bodies / zero-outbound) |
| Durable queue/worker | **implemented** (Postgres `durable_jobs` when `ADP_JOB_QUEUE=durable`) |
| PostgreSQL research-run orchestration E2E | **implemented** (`test:e2e:research-run-postgres`) — see test report |
| Controlled external pilot | **not approved** (RB-015 OPEN) |
| Production-ready live research | **not claimed** |

## Defaults that must stay off

- `ADP_LIVE_RESEARCH_ENABLED` → **false** by default (documented in `.env.example`)
- No owner blockers closed (RB-001–RB-017 remain **OPEN**)

## Evidence pointers

- Integration gate: `docs/01-reviews/PHASE_1_2_INTEGRATION_GATE_BLOCKED.md`
- Architecture: `docs/research/LIVE_RESEARCH_RUN_ARCHITECTURE.md`
- Safety: `docs/research/RESEARCH_RUN_SAFETY_CONTROLS.md`
- Operator: `docs/research/RESEARCH_RUN_OPERATOR_GUIDE.md`
- Tests: `docs/research/RESEARCH_RUN_TEST_REPORT.md`
- Architecture review: `docs/01-reviews/PHASE_1_2_ARCHITECTURE_REVIEW.md`
- Plan: `docs/01-reviews/PHASE_1_2_IMPLEMENTATION_PLAN.md`

## Explicit non-closure

Phase 1.2 adds orchestration UI and fixture-safe durable execution. It does **not** close RB-001–RB-017. See `docs/release/PHASE1_RELEASE_BLOCKERS.md`.
