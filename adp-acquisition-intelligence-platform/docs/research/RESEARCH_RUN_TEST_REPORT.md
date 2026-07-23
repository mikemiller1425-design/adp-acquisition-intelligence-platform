# Research Run Test Report (Phase 1.2)

**Date:** 2026-07-23  
**Scope:** Orchestration UI + fixture memory path

## Distinction of evidence

| Layer | What it proves | Status |
|---|---|---|
| Unit (domain gates, state machine, adapters fail-closed) | Gate logic / transitions | Expected via `@adp/research` vitest |
| Fixture / memory Playwright | UI configure → launch → pause → resume → complete | `apps/web/e2e/research-run-orchestration.spec.ts` |
| Postgres persistent E2E | Cross-restart durability of Phase 1.1 workflow | Separate config (`playwright.postgres.config.ts`) — **not** replaced by this suite |
| Controlled external | Real archive/live HTTP under approvals | **Not run** — RB-015 OPEN; flag default false |
| Production-ready | Deployed live research | **Not claimed** |

## Playwright suite notes

- Provider: **memory** (`playwright.config.ts` sets `ADP_RESEARCH_PROVIDER=memory`)
- Live flag: unset / false
- `testIgnore` continues to exclude `research-postgres-persistent-workflow.spec.ts` from the default config
- Postgres suite `testMatch` remains exclusive to the persistent workflow spec

## Commands

```bash
pnpm --filter @adp/research test
pnpm --filter @adp/web test:e2e   # includes research-run-orchestration.spec.ts
pnpm --filter @adp/web test:e2e:postgres  # separate; unchanged ignore/match contract
```

## Residual gaps

- Full PG-backed research-run durable queue E2E across process restart: follow-up
- Live adapter contract tests against real network: blocked by RB-015
