# Research Run Test Report (Phase 1.2)

**Date:** 2026-07-24  
**Branch:** `cursor/phase-1-2-live-research-orchestration-fb9d`  
**Canonical PR:** [#22](https://github.com/mikemiller1425-design/adp-acquisition-intelligence-platform/pull/22)  
**Scope:** Orchestration UI + fixture path + durable PG worker boundary + gated archive/live adapters

## Distinction of evidence

| Layer | What it proves | Status |
|---|---|---|
| Unit (domain gates, state machine, circuit breaker, adapters fail-closed, lease reclaim, source registry, zero-egress) | Gate logic / transitions / DNS / zero-outbound | `@adp/research` vitest (`research-run.unit.test.ts`) |
| Fixture / memory Playwright | UI configure → launch → pause → resume → complete | `apps/web/e2e/research-run-orchestration.spec.ts` |
| Postgres persistent E2E (Phase 1.1) | Cross-restart durability of Phase 1.1 workflow | `playwright.postgres.config.ts` — **not** replaced |
| Postgres durable research-run + separate worker E2E | Web enqueues `durable_jobs`; worker claims; pause/resume; restart recovery | `playwright.research-run.postgres.config.ts` |
| Controlled external | Real archive/live HTTP under approvals | **Not run** — RB-015 OPEN; flag default false |
| Production-ready | Deployed live research | **Not claimed** |

## Coverage map (prompt checklist)

| # | Requirement | Evidence |
|---|---|---|
| 1 | State transitions + launch gating | unit |
| 2 | Source-registry authorization | unit + SourceRegistryPort on web launch |
| 3 | Robots policy | Phase 1.1 robots unit + OfficialWebsiteAdapter hooks |
| 4 | DNS rebinding / redirect safety | unit (`dns_rebinding_or_private` before transport) |
| 5 | Rate / concurrency / request-budget / circuit breaker | unit circuit + request budget; Phase 1.1 rate-limit tests |
| 6 | Queue retry / idempotency | DurableJobDispatcher unit + lease reclaim |
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
pnpm --filter @adp/web test:e2e   # includes research-run-orchestration.spec.ts
pnpm --filter @adp/web test:e2e:postgres  # Phase 1.1 persistent workflow
pnpm --filter @adp/web test:e2e:research-run-postgres  # Phase 1.2 durable worker
pnpm validate
```

## Executed in this agent run

| Command | Result |
|---|---|
| `pnpm --filter @adp/research test` | **48 passed** (pre-validate) |
| `pnpm validate` | *pending — fill after run* |
| `pnpm --filter @adp/web test:e2e` (Phase 1.1 memory + Phase 1.2 memory orchestration) | *pending* |
| `pnpm --filter @adp/web test:e2e:postgres` (Phase 1.1 regression) | *pending* |
| `pnpm --filter @adp/web test:e2e:research-run-postgres` | *pending* |

## Residual gaps (explicit)

- Live adapter contract tests against real network: blocked by RB-015
- AI extraction provider: blocked by RB-017
- RB-001–RB-017 remain **OPEN**
