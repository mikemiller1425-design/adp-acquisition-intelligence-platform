# Research Run Test Report (Phase 1.2)

**Date:** 2026-07-24  
**Scope:** Orchestration UI + fixture memory path  
**Integration gate:** **BLOCKED** on PR #20 — durable PG worker E2E **not run**

## Distinction of evidence

| Layer | What it proves | Status |
|---|---|---|
| Unit (domain gates, state machine, adapters fail-closed) | Gate logic / transitions | Expected via `@adp/research` vitest |
| Fixture / memory Playwright | UI configure → launch → pause → resume → complete | `apps/web/e2e/research-run-orchestration.spec.ts` |
| Postgres persistent E2E (Phase 1.1 workflow) | Cross-restart durability of Phase 1.1 flow | Separate config — **not** Phase 1.2 durable-run proof |
| PostgreSQL durable research-run + separate worker E2E | Web enqueues `durable_jobs`; worker claims; restart recovery | **Not run** — blocked until PR #20 merges and repair lands |
| Controlled external | Real archive/live HTTP under approvals | **Not run** — RB-015 OPEN; flag default false |
| Production-ready | Deployed live research | **Not claimed** |

## Capability claims (do not conflate)

| Capability | Claim |
|---|---|
| Memory fixture UI | Available on this branch |
| PostgreSQL persistence | Schema/migration present; durable E2E **not** claimed |
| Durable queue | **Not claimed** |
| Separate worker execution | **Not claimed** |
| Restart recovery | **Not claimed** |
| Approved-source registry integration | Synthetic web authz remains; canonical port **deferred** |
| External egress authorization | Fail-closed; RB-014–017 **OPEN** |

## Playwright suite notes

- Provider: **memory** (`playwright.config.ts` sets `ADP_RESEARCH_PROVIDER=memory`)
- Live flag: unset / false
- `testIgnore` continues to exclude `research-postgres-persistent-workflow.spec.ts` from the default config
- Postgres suite `testMatch` remains exclusive to the Phase 1.1 persistent workflow spec
- Phase 1.2 durable worker Playwright suite: **not added** (blocked)

## Commands

```bash
pnpm --filter @adp/research test
pnpm --filter @adp/web test:e2e   # includes research-run-orchestration.spec.ts
pnpm --filter @adp/web test:e2e:postgres  # Phase 1.1 only; unchanged
```

## Residual gaps

- Full PG-backed research-run durable queue E2E across process restart: **blocked / follow-up after PR #20**
- Canonical SourceRegistryPort + zero-egress suite expansion: deferred with integration repair
- Live adapter contract tests against real network: blocked by RB-015
