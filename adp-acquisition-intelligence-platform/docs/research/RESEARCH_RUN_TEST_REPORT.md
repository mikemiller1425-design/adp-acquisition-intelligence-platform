# Research Run Test Report (Phase 1.2)

**Date:** 2026-07-24  
**Branch:** `cursor/phase-1-2-live-research-orchestration-fb9d`  
**Canonical PR:** [#22](https://github.com/mikemiller1425-design/adp-acquisition-intelligence-platform/pull/22)  
**Baseline:** PR #20 merged → `main` `685b1a543c618e941e2447947728d9f075b585bc`  
**Scope:** Orchestration UI + fixture path + durable PG worker boundary + gated archive/live adapters

## Distinction of evidence

| Layer | What it proves | Status |
|---|---|---|
| Unit (domain gates, state machine, circuit breaker, adapters fail-closed, lease reclaim, source registry, zero-egress) | Gate logic / transitions / DNS / zero-outbound | `@adp/research` vitest — **48 passed** |
| Fixture / memory Playwright | UI configure → launch → pause → resume → complete | `research-run-orchestration.spec.ts` — **PASS** |
| Phase 1.1 memory workflow | Phase 1.1 regression | `research-fixture-workflow.spec.ts` — **PASS** |
| Phase 1.1 Postgres persistent E2E | Cross-restart durability of Phase 1.1 workflow | `test:e2e:postgres` — **PASS** |
| Postgres durable research-run + separate worker E2E | Web enqueues `durable_jobs`; worker claims; pause/resume; restart recovery | `test:e2e:research-run-postgres` — **PASS** |
| Controlled external | Real archive/live HTTP under approvals | **Not run** — RB-015 OPEN; flag default false |
| Production-ready | Deployed live research | **Not claimed** |

## Coverage map (prompt checklist)

| # | Requirement | Evidence |
|---|---|---|
| 1 | State transitions + launch gating | unit |
| 2 | Source-registry authorization | unit + SourceRegistryPort on web launch |
| 3 | Robots policy | Phase 1.1 robots unit + OfficialWebsiteAdapter hooks |
| 4 | DNS rebinding / redirect safety | unit (`dns_rebinding_or_private` before transport) |
| 5 | Rate / concurrency / request-budget / circuit breaker | unit circuit + request budget |
| 6 | Queue retry / idempotency | DurableJobDispatcher + lease reclaim (ISO timestamptz bind) |
| 7 | Pause / resume / cancel | unit + memory Playwright + PG durable Playwright |
| 8 | Worker-restart recovery | unit checkpoint skip + PG durable Playwright |
| 9 | Web-restart persistence | PG durable Playwright + Phase 1.1 postgres Playwright |
| 10 | Archive hit | unit (recorded body → snapshot + claims) |
| 11 | Archive miss / live fallback | unit (gates deny; zero outbound) |
| 12 | Kill-switch-before-request | unit |
| 13 | Extraction → review | fixture path proposes claims; review UI link |
| 14 | PostgreSQL integration | migration `0012` + durable E2E |
| 15 | Playwright orchestration | memory + postgres durable suites |
| 16 | Unauthorized live → zero requests | unit zero-egress probes |

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
| `pnpm validate` | **PASS** (format, lint, typecheck, deps, unit tests, build, docs) |
| `pnpm --filter @adp/research test` | **48 passed** (via validate) |
| `pnpm --filter @adp/web test:e2e` | **2 passed** (Phase 1.1 memory + Phase 1.2 memory orchestration) |
| `pnpm --filter @adp/web test:e2e:postgres` | **1 passed** (Phase 1.1 persistent workflow) |
| `pnpm --filter @adp/web test:e2e:research-run-postgres` | **1 passed** (durable queue + worker + restart) |

## Explicit non-closure

- RB-001–RB-017 remain **OPEN**
- `ADP_LIVE_RESEARCH_ENABLED` defaults **false**
- Do **not** claim READY FOR CONTROLLED EXTERNAL PILOT
- Recommendation after this evidence: **READY FOR PERSISTENT FIXTURE PILOT**
