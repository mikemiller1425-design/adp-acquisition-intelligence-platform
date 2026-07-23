# Phase 1.1 Population Engine — Completion Report

**Version:** 1.2.0  
**Date:** 2026-07-23  
**Branch:** `cursor/phase-1-1-population-engine-dd2b`  
**Baseline:** `1e98880f742a739bbfc44167c549fd4ebc8cd5c0` (PR #19 MERGED; branch rebased onto main)  
**Tip commit:** `5f6ff10dd8a464844e9eae0cfaed5cbc2b10080a` (validate + persistent E2E green; subsequent tip-SHA sync commits do not re-run gates)  
**Draft PR:** #20  
**Recommendation:** **READY FOR CONTROLLED PILOT** (fixture-only). **NOT READY** for live public-source egress or production release.

---

## Required completion report fields (30)

| # | Field | Status / value |
|---|---|---|
| 1 | Phase / prompt identity | Phase 1.1 Population & Research Engine |
| 2 | Implementation branch | `cursor/phase-1-1-population-engine-dd2b` |
| 3 | Baseline SHA | `1e98880f742a739bbfc44167c549fd4ebc8cd5c0` |
| 4 | Stacked baseline / PR | PR **#19 MERGED**; this branch rebased onto resulting `main` |
| 5 | Baseline gate | [PHASE_1_1_BASELINE_GATE.md](../01-reviews/PHASE_1_1_BASELINE_GATE.md) — **PASS** |
| 6 | Package delivered | `@adp/research` (`packages/research`) |
| 7 | Migrations delivered | `0010_phase_1_1_population_research.sql`, `0011_phase_1_1_collection_attempts.sql` |
| 8 | Population configs | `config/population/population_sources.v1.yaml` |
| 9 | Research configs | `config/research/{approved_sources,collection_policy,entity_resolution_policy,research_priority,extractor_variable_mapping}.v1.yaml` |
| 10 | Lane 1 — population import | **Done** — dry-run non-mutating for candidates/orgs; idempotency |
| 11 | Lane 2 — entity resolution | **Done** — reuses `@adp/collection` matcher; name-only no auto-merge |
| 12 | Lane 3 — bulk enrichment seams | **Done** — job types + archive-before-live; live archive draft |
| 13 | Lane 4 — research priority | **Done** — draft rules; `productionActivationGated: true` |
| 14 | Lane 5 — targeted collection | **Done** — snapshots before claims; attempts + extraction runs persisted; redirect abort |
| 15 | Retrieval in CI | **FixtureRetrievalPort only** + DNS/private-address gate (no live sockets) |
| 16 | Live org website adapter | **Draft** — not enabled |
| 17 | Principles honored | Bulk first; claims proposals; SSRF/PSL redirects; robots; rate limits; kill switch; concurrency |
| 18 | Non-objectives honored | No LinkedIn; no auth bypass; no CAPTCHA; no unrestricted crawl; no auto claim confirmation; no Phase 2 |
| 19 | Security controls evidence | [PUBLIC_SOURCE_SECURITY_MODEL.md](../research/PUBLIC_SOURCE_SECURITY_MODEL.md) |
| 20 | AuthZ capabilities | Role allowlist; Research UI routes authorization-controlled |
| 21 | Claim → intelligence integration | **Atomic** accept in one DB txn: claim transition + evidence + variable propose + outbox (incl. `intelligence.recalculation_requested`); recalc drained via worker job boundary — not an in-txn side effect |
| 22 | Package automated tests | **21 passed** in `@adp/research` (incl. Postgres claim-accept rollback: evidence/variable failure leaves claim unaccepted, no partial rows) |
| 23 | Browser E2E | **Memory (non-persistent):** `research-fixture-workflow.spec.ts` — fast path, does **not** prove PG persistence. **PostgreSQL persistent (gate):** `pnpm --filter @adp/web test:e2e:postgres` — migrate through 0011, `ADP_RESEARCH_PROVIDER=postgres`, real Next.js UI, job handlers, restart after collection, direct table probe, dry-run non-mutation — **PASSED**. “Persistent E2E passed” is claimed only for this suite. |
| 24 | Documentation set | `docs/research/*` + architecture review + baseline gate + this report |
| 25 | Architecture review | [PHASE_1_1_POPULATION_ENGINE_ARCHITECTURE_REVIEW.md](../01-reviews/PHASE_1_1_POPULATION_ENGINE_ARCHITECTURE_REVIEW.md) — **PASS WITH EXPLICIT OPEN OWNER APPROVALS** |
| 26 | Prior blockers preserved | RB-001…RB-013 remain **OPEN** (not closed) |
| 27 | New blockers | **RB-014** licensing; **RB-015** live/archive; **RB-016** object-storage; **RB-017** extraction provider |
| 28 | Open owner approvals | Licensing, live source, object storage, extraction provider, platform RB-001/002 |
| 29 | Controlled pilot posture | Fixture + internal approved bulk only; no live egress |
| 30 | Final recommendation | **READY FOR CONTROLLED PILOT** — **NOT READY** for live public-source production egress |

---

## Review-fix closeout (PR #20 REQUEST CHANGES)

| # | Finding | Resolution |
|---|---|---|
| 1 | Abort after invalid redirect | `TargetedCollectionService` aborts snapshot/extract on redirect failure |
| 2 | Snapshots before claims | Snapshot insert precedes extraction run + claim proposals |
| 3 | Persist attempts + extraction runs | `collection_attempts` (0011) + `extraction_runs` via repos |
| 4 | PostgreSQL repositories | `postgres-repositories.ts` for Phase 1.1 tables |
| 5 | Real bounded worker handlers | `registerResearchJobHandlers` shared by worker + web |
| 6 | Dry runs non-mutating | Import/normalize skip candidate/org writes when `dryRun` |
| 7 | Claim accept transactional | `ExtractionReviewService` via `runInTransaction` |
| 8 | DNS at retrieval boundary | `FixtureRetrievalPort` + `StaticDnsResolver` / private IP checks |
| 9 | Public-suffix domains | `tldts` `registrableDomain` |
| 10 | Kill-switch + rate-limit persistence | Approved-source kill switch + `source_rate_limit_states` |
| 11 | Source concurrency limits | `InProcessConcurrencyGate` / UoW concurrency port |
| 12 | Collection status enums | `collection_run_status` includes `blocked`; attempts statuses reconciled |
| 13 | Functional Research UI | StubScreens replaced with auth-controlled workflows |
| 14 | Playwright E2E | Memory labeled non-persistent; **PostgreSQL persistent E2E passed** (restart + SQL probe) |
| 15 | Fixture approvals | `not_required_for_fixture` only for `adapterType=fixture` |
| 16 | Docs / readiness | This report + architecture review updated |
| 17 | PR #19 | **MERGED**; PR #20 rebased onto resulting `main` before re-validation |

---

## Explicitly not claimed

- Production deployment / live org-website crawling
- Licensed external directory enablement without owner signature
- Closure of RB-001…RB-017 owner/production blockers
- Phase 2 implementation

## Sign-off template (external)

> We accept **controlled pilot** use of fixture-backed population/research paths. We will not enable live public-source or archived-web egress until RB-015 is CLOSED. We will not enable licensed bulk datasets until RB-014 is CLOSED.

*(Not signed in this repository.)*
