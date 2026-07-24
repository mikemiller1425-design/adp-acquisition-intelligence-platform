# Research Run Test Report (Phase 1.2)

**Date:** 2026-07-24  
**Branch:** `cursor/phase-1-2-live-research-orchestration-fb9d`  
**Scope:** Orchestration UI + fixture path + gated archive/live adapters

## Distinction of evidence

| Layer | What it proves | Status |
|---|---|---|
| Unit (domain gates, state machine, circuit breaker, adapters fail-closed) | Gate logic / transitions / DNS / zero-outbound | `@adp/research` vitest (`research-run.unit.test.ts`) |
| Fixture / memory Playwright | UI configure → launch → pause → resume → complete | `apps/web/e2e/research-run-orchestration.spec.ts` |
| Postgres persistent E2E | Cross-restart durability of Phase 1.1 workflow | Separate config (`playwright.postgres.config.ts`) — **not** replaced |
| Postgres research-run tables | Migration `0012` present via database integration suite | Tested when `DATABASE_URL` / `TEST_DATABASE_URL` available |
| Controlled external | Real archive/live HTTP under approvals | **Not run** — RB-015 OPEN; flag default false |
| Production-ready | Deployed live research | **Not claimed** |

## Coverage map (prompt checklist)

| # | Requirement | Evidence |
|---|---|---|
| 1 | State transitions + launch gating | unit |
| 2 | Source-registry authorization | unit (`capability_denied`, lifecycle/review gates) |
| 3 | Robots policy | Phase 1.1 robots unit + OfficialWebsiteAdapter hooks |
| 4 | DNS rebinding / redirect safety | unit (`dns_rebinding_or_private` before transport) |
| 5 | Rate / concurrency / request-budget / circuit breaker | unit circuit + request budget; Phase 1.1 rate-limit tests |
| 6 | Queue retry / idempotency | DurableJobDispatcher unit |
| 7 | Pause / resume / cancel | unit + Playwright |
| 8 | Worker-restart recovery | unit checkpoint skip (no re-retrieval) |
| 9 | Web-restart persistence | Phase 1.1 postgres Playwright (workflow); research-run durable PG E2E follow-up |
| 10 | Archive hit | unit (recorded body → snapshot + claims) |
| 11 | Archive miss / live fallback | unit (gates deny; zero outbound) |
| 12 | Kill-switch-before-request | unit |
| 13 | Extraction → review | fixture path proposes claims; review UI link; accept via Phase 1.1 service |
| 14 | PostgreSQL integration | migration/table presence + claim-accept atomic suite when DB up |
| 15 | Playwright orchestration | memory suite |
| 16 | Unauthorized live → zero requests | unit |

## Commands

```bash
pnpm --filter @adp/research test
pnpm --filter @adp/web test:e2e   # includes research-run-orchestration.spec.ts
pnpm --filter @adp/web test:e2e:postgres  # separate; unchanged ignore/match contract
pnpm validate
```

## Executed in this agent run

| Command | Result |
|---|---|
| `pnpm validate` | **PASS** |
| `pnpm --filter @adp/research test` (with local PostgreSQL) | **38 passed** |
| `playwright test e2e/research-run-orchestration.spec.ts` | **PASS** |

## Residual gaps (explicit)

- Full PG-backed research-run durable queue E2E across process restart: follow-up
- Live adapter contract tests against real network: blocked by RB-015
- AI extraction provider: blocked by RB-017
