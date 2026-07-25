# Research Run Test Report (Phase 1.2)

**Date:** 2026-07-25  
**Branch:** `cursor/phase-1-2-live-research-orchestration-fb9d`  
**Canonical PR:** [#22](https://github.com/mikemiller1425-design/adp-acquisition-intelligence-platform/pull/22)  
**Baseline:** PR #20 merged → `main` `685b1a543c618e941e2447947728d9f075b585bc`  
**Scope:** Orchestration UI + fixture path + durable PG worker boundary + worker source revalidation + abandoned-lease recovery

## Distinction of evidence

| Layer | What it proves | Status |
|---|---|---|
| Unit (gates, circuit breaker, adapters, lease reclaim, source registry, zero-egress, **dynamic revocation**) | Gate logic / transitions / DNS / zero-outbound / kill-switch mid-run | `@adp/research` vitest — **49 passed** |
| Fixture / memory Playwright | UI configure → launch → pause → resume → complete | `research-run-orchestration.spec.ts` — **PASS** |
| Phase 1.1 memory workflow | Phase 1.1 regression | `research-fixture-workflow.spec.ts` — **PASS** |
| Phase 1.1 Postgres persistent E2E | Cross-restart durability of Phase 1.1 workflow | `test:e2e:postgres` — **PASS** |
| Postgres durable research-run E2E | Abandoned-lease reclaim + unconditional pause/resume | `test:e2e:research-run-postgres` — **2 passed** |
| Controlled external | Real archive/live HTTP under approvals | **Not run** — RB-015 OPEN |
| Production-ready | Deployed live research | **Not claimed** |

## Acceptance-blocker repairs (this revision)

### 1. Dynamic source revocation — **PASS**

Worker `ResearchRunService` injects `SourceRegistryPort` and calls `authorizeSourceForRetrieval` immediately before every fixture/archive/live retrieval. Launch `sourcePolicySnapshot` is historical evidence only.

Unit evidence (`dynamic source revocation`):

| Field | Value |
|---|---|
| Result | **PASS** |
| Requests before kill switch | `> 0` (first target completed) |
| Requests after kill switch | **unchanged** (zero additional retrievals) |
| Snapshots after kill switch | **unchanged** |
| Cleared kill switch + pending approvals | Still **blocked** (`terms_not_approved`) |

### 2. Abandoned-job recovery — **PASS** (deterministic)

Playwright holds `durable_jobs` in `running` via `ADP_RESEARCH_RUN_TARGET_DELAY_MS`, kills the worker, waits for lease expiry, starts a different worker id.

Exact evidence from local run:

| Field | Value |
|---|---|
| Abandoned job id | `6f19180f-a199-4c8c-afae-026379fade13` |
| Original worker id | `e2e-worker-a` |
| Replacement worker id | `e2e-worker-b` |
| Attempts before reclaim | `1` |
| Attempts after reclaim | `2` |
| Snapshots created | `2` |
| Targets completed | `2` |
| Duplicate target orgs | `0` |
| Unconditional pause/resume | **PASS** (`completedAtPause=0`, `completedWhilePaused=1`, `finalTargetsCompleted=3`) |

## Commands

```bash
pnpm --filter @adp/research test
pnpm --filter @adp/web test:e2e
pnpm --filter @adp/web test:e2e:postgres
pnpm --filter @adp/web test:e2e:research-run-postgres
pnpm validate
```

## Executed in this agent run

| Command | Result |
|---|---|
| `pnpm validate` | **PASS** |
| `pnpm --filter @adp/research test` | **49 passed** |
| `pnpm --filter @adp/web test:e2e` | **2 passed** |
| `pnpm --filter @adp/web test:e2e:postgres` | **1 passed** |
| `pnpm --filter @adp/web test:e2e:research-run-postgres` | **2 passed** |

## Explicit non-closure

- RB-001–RB-017 remain **OPEN**
- `ADP_LIVE_RESEARCH_ENABLED` defaults **false**
- Test evidence is locally reported (no GitHub Actions status checks attached)
- Recommendation: **READY FOR PERSISTENT FIXTURE PILOT**
