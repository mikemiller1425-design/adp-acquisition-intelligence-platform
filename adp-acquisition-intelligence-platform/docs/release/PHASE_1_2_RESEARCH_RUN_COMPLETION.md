# Phase 1.2 — Research Run Completion

**Date:** 2026-07-23  
**Branch:** `cursor/phase-1-2-live-research-orchestration-dd2b`  
**Recommendation:** **READY FOR FIXTURE PILOT** for Start Research Run orchestration  
**Not ready:** controlled external pilot, production live research

## Delivered

- Schema migration `0012` + Drizzle research-run tables / durable job seam
- `ResearchRunService` (preview, createAndLaunch, pause, resume, cancel, execute)
- Launch gates + safety dual-gate adapters (Common Crawl + Official Website drafts)
- Web UI: hub CTA, `/research/runs/new`, `/research/runs`, `/research/runs/[id]`
- Server actions: `previewOrLaunchResearchRunAction` + lifecycle actions
- Playwright memory orchestration E2E
- Operator / safety / architecture docs

## Defaults that must stay off

- `ADP_LIVE_RESEARCH_ENABLED` → **false** by default
- No owner blockers closed (RB-014–017 remain **OPEN**)

## Evidence pointers

- Architecture: `docs/research/LIVE_RESEARCH_RUN_ARCHITECTURE.md`
- Safety: `docs/research/RESEARCH_RUN_SAFETY_CONTROLS.md`
- Operator: `docs/research/RESEARCH_RUN_OPERATOR_GUIDE.md`
- Tests: `docs/research/RESEARCH_RUN_TEST_REPORT.md`
- Architecture review: `docs/01-reviews/PHASE_1_2_ARCHITECTURE_REVIEW.md`

## Explicit non-closure

Phase 1.2 adds orchestration UI and fixture-safe execution. It does **not** close RB-014, RB-015, RB-016, or RB-017. See `docs/release/PHASE1_RELEASE_BLOCKERS.md`.
