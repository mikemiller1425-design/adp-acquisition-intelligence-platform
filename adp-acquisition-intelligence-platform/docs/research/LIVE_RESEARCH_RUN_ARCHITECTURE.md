# Live Research Run Architecture (Phase 1.2)

**Status:** Implemented for **fixture pilot** orchestration; live egress **DISABLED** by default  
**Date:** 2026-07-23  
**Related:** [Research Run Safety Controls](RESEARCH_RUN_SAFETY_CONTROLS.md), [Operator Guide](RESEARCH_RUN_OPERATOR_GUIDE.md), [Phase 1.2 Completion](../release/PHASE_1_2_RESEARCH_RUN_COMPLETION.md)

## Maturity matrix

| Capability | State |
|---|---|
| Run definition + lifecycle state machine | **Implemented** |
| Launch gates + estimates | **Implemented** |
| Fixture mode execution | **Fixture-tested** (unit + Playwright memory) |
| Memory provider orchestration UI | **Fixture-tested** |
| Postgres schema (`0012`) + repository | **Implemented** (PG path available; full durable E2E is separate) |
| Common Crawl / archived-web adapter | **Draft + gated** — not production-ready |
| Official website live adapter | **Draft + gated** — not production-ready |
| Controlled external pilot | **Not ready** (RB-015 OPEN) |
| Production-ready live research | **Not ready** |

## Preferred collection order

1. Approved structured / licensed source (slot; RB-014 gated)
2. Existing internal snapshot reuse (freshness threshold)
3. Common Crawl archive adapter (draft)
4. Official organization website live fallback (draft + dual gate)
5. Human extraction review before canonical intelligence changes

## Components

```text
UI /research/runs/new
        │ previewOrLaunchResearchRunAction
        ▼
ResearchRunService.preview / createAndLaunch
        │ launch gates (authz, segment, limits, source, kill switch, ADP_LIVE_RESEARCH_ENABLED)
        ▼
research_run_definitions + research_runs + targets
        │ enqueue research.run.execute (deferred in web memory)
        ▼
executeRun (one target / invocation, checkpointed)
        │ fixture | dry_run | archive_* | live_* (gated)
        ▼
snapshots → extraction → proposed claims → extraction review
```

## Modes

| Mode | Network | Default for pilot |
|---|---|---|
| `fixture` | No | **Yes** |
| `dry_run` | No | Optional |
| `archive_only` | Archive only if dual gates pass | Blocked by default |
| `archive_first_live_fallback` | Archive then live | Blocked by default |
| `live_official_site_only` | Live only | Blocked by default |

## Deployment gates

- `ADP_LIVE_RESEARCH_ENABLED` defaults **false** (absent = false).
- `ADP_RESEARCH_GLOBAL_KILL_SWITCH` can halt live/collection paths.
- Source registry lifecycle must be `enabled` with required reviews (fixture uses `not_required_for_fixture` only for fixture adapters).

## Explicit non-goals

No unrestricted crawl, LinkedIn, CAPTCHA bypass, proxy evasion, auto-accept claims, or enabling live egress by default.
