# Phase 1 — Performance Review

**Baseline:** `docs/01-reviews/PROMPT_12_PERFORMANCE_NOTES.md`  
**Date:** 2026-07-23

---

## Scope evaluated

- Large organizations / contact graphs  
- Large imports / discovery runs  
- Dashboard responsiveness  
- Reporting generation  
- Background queues  
- Database queries & indexes  
- Memory / concurrency  
- Caching / pagination  

---

## Expected limits (engineering estimates)

| Workload | Expected Phase 1 comfort zone | Notes |
|----------|-------------------------------|-------|
| Organizations | Low thousands interactive; **100k not proven** | RB-005 |
| Contacts per org | Hundreds–low thousands | Index-dependent |
| Dashboard list pages | Paginated; aim <2s p95 on warm DB | Needs prod measurement |
| Report generation | Async job; seconds–minutes by size | Monitor `report_jobs` |
| Discovery runs | Provider-rate limited; queue-backed | Circuit breakers help |
| Scoring batch | Job-backed; CPU-bound possible | Scale workers ops |
| Concurrent users | Small internal team (single-digit–low tens) | Not multi-tenant SaaS |

---

## Strengths

- Indexes on FKs and common filters (org, status, created_at) across migrations  
- Background jobs for heavy work (discovery, enrichment, scoring, reports, exports)  
- Pagination patterns on list APIs / UI  
- Circuit breakers and rate limits on external providers  
- Reporting snapshots avoid recomputing everything on every page view  

---

## Bottlenecks & risks

| Area | Risk | Mitigation |
|------|------|------------|
| Unbounded list queries | Missing limit → memory spike | Enforce pagination in handlers |
| N+1 ORM access | Dashboard detail pages | Review hot paths; add joins/selects |
| Large JSON blobs | Report/payload columns | Cap size; stream exports |
| Migration on large DBs | Long locks | Ops runbooks; offline windows |
| Queue backlog | Worker underprovision | Scale workers; alert on lag |
| Full-table scoring | CPU/IO | Batch + checkpoint jobs |
| 100k orgs | Untested | Explicit blocker RB-005 |

---

## Caching

| Layer | Status |
|-------|--------|
| HTTP cache | Limited; private app |
| App memory cache | Minimal — prefer DB truth |
| Report snapshots | Primary “cache” for dashboards |
| Redis | Not required Phase 1 |

---

## Concurrency

- Node single-threaded event loop + worker processes for jobs  
- Postgres handles concurrent writers with row locks  
- Outreach send must remain rate-limited to avoid provider bans  

---

## Recommendation

Performance is **adequate for internal pilot scale**. Do **not** claim 100k-org readiness. Measure p95 on staging before production load. Phase 2 features should add perf budgets when touching hot paths.
