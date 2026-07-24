# Phase 1.2 Integration Gate — BLOCKED

**Date:** 2026-07-24  
**PR:** [#21](https://github.com/mikemiller1425-design/adp-acquisition-intelligence-platform/pull/21)  
**Branch:** `cursor/phase-1-2-live-research-orchestration-dd2b`  
**Status:** **BLOCKED — PR #20 is not merged**

## Entry gate (section 1)

The repair brief requires:

> PR #20 must merge first. … **Stop if PR #20 is not merged.**

### Verified at gate check

| Item | Result |
|---|---|
| PR #20 state | **OPEN** (not merged) |
| PR #20 URL | https://github.com/mikemiller1425-design/adp-acquisition-intelligence-platform/pull/20 |
| PR #20 head | `cursor/phase-1-1-population-engine-dd2b` |
| `main` tip | `27ff1cc` (PR #19 merge) — Phase 1.1 population engine **not** on main |
| Rebase of #21 onto post-#20 `main` | **Not performed** (blocked) |

## Deferred repair work (do not start until #20 merges)

1. Rebase #21 onto updated `main`; remove inherited Phase 1.1 noise from the effective diff
2. Connect Next.js `postgres` + `ADP_JOB_QUEUE=durable` launches to `DurableJobDispatcher` / `PostgresDurableJobStore` (fail closed; no silent memory fallback)
3. Canonical `SourceRegistryPort` from `approved_sources` (remove synthetic `fixtureSourcesFor()` for PostgreSQL)
4. Explicit adapter composition; no unconfigured hidden defaults
5. No fake PostgreSQL target org IDs; resolve saved target segments only
6. Worker lease / heartbeat / recovery / checkpoint idempotency
7. Separate PostgreSQL durable Playwright E2E (Next + worker + PG through 0012)
8. Zero-egress probe suite
9. Docs: claim persistent queue/worker only after PG worker E2E → **READY FOR PERSISTENT FIXTURE PILOT**

## Explicit non-goals (unchanged)

- Do **not** merge PR #21 without approval
- Do **not** close RB-001–RB-017
- Do **not** enable live egress by default
- Do **not** claim READY FOR CONTROLLED EXTERNAL PILOT while RB-014–017 remain open
- Do **not** claim the durable queue/worker boundary works until the PostgreSQL worker E2E passes

## Next step

Merge **PR #20** with explicit approval, then re-run this Phase 1.2 integration-gate repair on PR #21.
