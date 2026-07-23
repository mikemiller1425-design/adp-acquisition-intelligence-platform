# Phase 1.1 Population Engine — Architecture Review

**Status:** PASS WITH EXPLICIT OPEN OWNER APPROVALS  
**Scope:** Phase 1.1 population & research engine (`@adp/research`, migration `0010`, research/population configs)  
**Baseline:** `1e98880f742a739bbfc44167c549fd4ebc8cd5c0` (Phase 1 tip / PR #19 OPEN stacked baseline)  
**Branch:** `cursor/phase-1-1-population-engine-dd2b`  
**Review type:** Prompt-level review per [Architecture Review Checklist](../11-implementation/16_ARCHITECTURE_REVIEW_CHECKLIST.md)  
**Date:** 2026-07-23

## Decision

**PASS WITH EXPLICIT OPEN OWNER APPROVALS** — No blocking **engineering** findings for a **controlled fixture-backed pilot**. Live public-source egress, licensed dataset enablement, production object-storage retention, and AI extraction remain owner-gated (RB-014…RB-017). Existing Phase 1 blockers RB-001…RB-009 are preserved OPEN.

## Checklist summary

| Section | Result | Notes |
|---|---|---|
| A. Specification and scope | PASS | Five lanes only; Phase 2 / LinkedIn / auth-bypass / CAPTCHA / unrestricted crawl / auto-confirm absent |
| B. Architecture and dependencies | PASS | `@adp/research` application → domain ports → infrastructure; reuses `@adp/collection` matcher |
| C. Interfaces and compatibility | PASS | Ports for population, retrieval, claims, evidence/variables/scores; collectors cannot confirm |
| D. Data architecture | PASS | Migration `0010` enums/tables/indexes; dry-run defaults; claim `proposed` default |
| E. Scoring integrity | PASS | Score path is recalc **request** after human accept only |
| F. Security and privacy | PASS WITH SIGN-OFFS | SSRF, robots, rate limits, kill switch implemented; owner live approvals pending |
| G. Reliability and operability | PASS | Idempotency keys, cancel/kill switch, runbook added |
| H. Performance and scale | PASS WITH NOTE | 10k dry-run covered; 100k org claim not made (RB-005 remains) |
| I. Testing quality | PASS WITH NOTE | Package unit/E2E-style service tests + 10k perf; browser E2E still RB-006 |
| J. UI and dashboards | N/A / DEFER | No new production UI required for package delivery; existing `/research` route unchanged in scope |
| K. Documentation | PASS | `docs/research/*`, baseline gate, completion report, blockers RB-014…017 |
| L. Regression readiness | PASS WITH NOTE | Stacked on unmerged Phase 1 tip; package tests green; full monorepo validate expected on integration |

## Findings

### Blocking engineering findings

**None** for controlled pilot (fixture retrieval only).

### Deferred / non-blocking (owned)

| ID | Severity | Finding | Owner | Target |
|---|---|---|---|---|
| AR-P1.1-001 | medium | Live `organization_website` adapter remains draft + kill switch; not exercised on network | research_eng + legal/sec | After RB-015 |
| AR-P1.1-002 | medium | Snapshot `storage_key` lacks production object-store backup/retention proof | ops | RB-016 |
| AR-P1.1-003 | medium | Research priority numeric formula draft-gated | product/ops | Policy approval |
| AR-P1.1-004 | low | Browser Playwright journey for population/research UX not in this package | qa_release | RB-006 |
| AR-P1.1-005 | low | AI/LLM extraction provider not wired (deterministic only) | product + security | RB-017 |

### Open owner approvals (not architecture defects)

| Item | Blocker | Status |
|---|---|---|
| Bulk population dataset licensing | RB-014 | OPEN |
| Live public-source / archived-web legal+privacy+security | RB-015 | OPEN |
| Production object-storage backup/retention for snapshots | RB-016 | OPEN |
| Extraction provider / AI extraction approval | RB-017 | OPEN |
| Independent security/privacy (platform) | RB-001 / RB-002 | OPEN (preserved) |

## Evidence inspected

- `packages/research/src/**` (domain, application, fixture retrieval, tests)
- `packages/database/migrations/0010_phase_1_1_population_research.sql`
- `packages/database/src/schema/research.ts`
- `config/population/population_sources.v1.yaml`
- `config/research/*.v1.yaml`
- Package test run: **30 tests passed** (`vitest` in `@adp/research`)

## Non-objectives verification

| Non-objective | Result |
|---|---|
| No LinkedIn scraping | PASS — no adapter/code path |
| No auth bypass | PASS |
| No CAPTCHA circumvention | PASS |
| No unrestricted crawl | PASS — path allowlist + page limits |
| No auto claim confirmation | PASS — `auto_accept_enabled: false`; collectors propose only |

## Recommendation

Proceed to **controlled pilot** using fixture (and internal approved bulk) paths only. Do **not** enable live organization-website or archived-web network adapters until RB-014/RB-015 (and RB-016/RB-017 as applicable) close with human owner signatures.

```yaml
review:
  scope: phase-1-1-population-engine
  baseline: 1e98880f742a739bbfc44167c549fd4ebc8cd5c0
  branch: cursor/phase-1-1-population-engine-dd2b
  result: PASS_WITH_EXPLICIT_OPEN_OWNER_APPROVALS
  blocking_engineering_findings: 0
  controlled_pilot_ready: true
  live_egress_ready: false
  reviewer: cursor-first-pass
  reviewed_at: 2026-07-23T00:00:00Z
```
