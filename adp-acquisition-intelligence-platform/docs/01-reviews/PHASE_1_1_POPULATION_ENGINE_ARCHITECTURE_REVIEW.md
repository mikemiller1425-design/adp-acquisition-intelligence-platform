# Phase 1.1 Population Engine — Architecture Review

**Status:** PASS WITH EXPLICIT OPEN OWNER APPROVALS  
**Scope:** Phase 1.1 population & research engine (`@adp/research`, migrations `0010`+`0011`, research/population configs, Research UI + Playwright E2E)  
**Baseline:** `1e98880f742a739bbfc44167c549fd4ebc8cd5c0` (Phase 1 tip / PR #19 OPEN stacked baseline)  
**Branch:** `cursor/phase-1-1-population-engine-dd2b`  
**Review type:** Prompt-level review per [Architecture Review Checklist](../11-implementation/16_ARCHITECTURE_REVIEW_CHECKLIST.md)  
**Date:** 2026-07-23  
**Revision:** 1.2 (PostgreSQL persistent E2E acceptance gate)

## Decision

**PASS WITH EXPLICIT OPEN OWNER APPROVALS** — No blocking **engineering** findings for a **controlled fixture-backed pilot**. Live public-source egress, licensed dataset enablement, production object-storage retention, and AI extraction remain owner-gated (RB-014…RB-017). Existing Phase 1 blockers RB-001…RB-009 are preserved OPEN. PR #19 remains OPEN (stacked; not merged by this agent).

## Checklist summary

| Section | Result | Notes |
|---|---|---|
| A. Specification and scope | PASS | Five lanes only; Phase 2 / LinkedIn / auth-bypass / CAPTCHA / unrestricted crawl / auto-confirm absent |
| B. Architecture and dependencies | PASS | Shared `registerResearchJobHandlers` + `createResearchRuntime`; Postgres + in-memory UoW |
| C. Interfaces and compatibility | PASS | Ports for population, retrieval, claims, evidence/variables/scores; collectors cannot confirm |
| D. Data architecture | PASS | `0010`+`0011`; attempts table; `blocked` run status; dry-run non-mutating |
| E. Scoring integrity | PASS | Claim accept is one DB txn (claim + evidence + variable + outbox); score recalc queued **only** via `intelligence.recalculation_requested` outbox (no in-txn side effect) |
| F. Security and privacy | PASS WITH SIGN-OFFS | SSRF, DNS gate, PSL redirects, robots, rate limits, kill switch, concurrency |
| G. Reliability and operability | PASS | Idempotency, cancel/kill switch, runbook |
| H. Performance and scale | PASS WITH NOTE | 10k dry-run covered; 100k org claim not made (RB-005) |
| I. Testing quality | PASS | 21 `@adp/research` tests (incl. claim-accept atomic rollback on Postgres); memory Playwright labeled **non-persistent**; **PostgreSQL persistent E2E passed** (`test:e2e:postgres`, migrate through 0011, Next.js restart, direct table probe, dry-run non-mutation) |
| J. UI and dashboards | PASS | Functional auth-controlled Research workflows (no Phase 1.1 StubScreens) |
| K. Documentation | PASS | Completion report + this review + research docs updated |
| L. Regression readiness | PASS WITH NOTE | Stacked on unmerged Phase 1 tip; monorepo validate required on tip |

## Findings

### Blocking engineering findings

**None** for controlled pilot (fixture retrieval only). Prior REQUEST CHANGES items 1–16 remediated.

### Deferred / non-blocking (owned)

| ID | Severity | Finding | Owner | Target |
|---|---|---|---|---|
| AR-P1.1-001 | medium | Live `organization_website` adapter remains draft; not exercised on network | research_eng + legal/sec | After RB-015 |
| AR-P1.1-002 | medium | Snapshot `storage_key` lacks production object-store backup/retention proof | ops | RB-016 |
| AR-P1.1-003 | medium | Research priority numeric formula draft-gated | product/ops | Policy approval |
| AR-P1.1-004 | low | Platform-wide RB-006 browser acceptance beyond Phase 1.1 research journey | qa_release | RB-006 |
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

- `packages/research/src/**` (domain, application, job handlers, postgres repos, fixtures)
- `packages/database/migrations/0010_*`, `0011_*`
- `apps/worker` consumers thin-wrap shared handlers
- `apps/web` Research routes
- `e2e/research-fixture-workflow.spec.ts` — memory / **non-persistent** (**passed**; not sufficient for “persistent E2E”)
- `e2e/research-postgres-persistent-workflow.spec.ts` — `ADP_RESEARCH_PROVIDER=postgres` (**passed**; controlled-pilot persistence gate)
- Fixture approvals use `not_required_for_fixture` (not impersonating human legal/privacy/security approval)

## Non-objectives verification

| Non-objective | Result |
|---|---|
| No LinkedIn scraping | PASS |
| No auth bypass | PASS |
| No CAPTCHA circumvention | PASS |
| No unrestricted crawl | PASS |
| No auto claim confirmation | PASS |
| No live network retrieval | PASS |
| No Phase 2 | PASS |

## Recommendation

**READY FOR CONTROLLED PILOT** (fixture-backed). Do **not** enable live organization-website or archived-web network adapters until RB-014/RB-015 (and RB-016/RB-017 as applicable) close with human owner signatures. Do **not** close owner/production blockers from this PR.

```yaml
recommendation: READY_FOR_CONTROLLED_PILOT
live_egress: NOT_READY
blocking_engineering_findings: 0
pr_19_merge_status: OPEN_STACKED
playwright_research_e2e_memory_non_persistent: PASS
playwright_research_e2e_postgres_persistent: PASS
persistent_e2e_claimed: true
```
