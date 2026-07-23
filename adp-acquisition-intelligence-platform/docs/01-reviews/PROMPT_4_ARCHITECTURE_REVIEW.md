# Prompt 4 Architecture Review

**Review date:** 2026-07-22  
**Branch:** `cursor/prompt-4-collection-identity-dd2b`  
**Verdict:** **PASS_WITH_NON_BLOCKING**

## Checklist vs actual diff

| Area | Expected | Actual | Result |
|---|---|---|---|
| PostgreSQL version | Prompt 4 DB work validated on PostgreSQL 17 | PG17 gate recorded in [PROMPT_4_POSTGRESQL_17_GATE.md](PROMPT_4_POSTGRESQL_17_GATE.md); collection integration suite uses test DB URL on port 5433 | PASS |
| Migration/schema | Collection import and identity tables exist | `0003_melted_inertia` creates import batches/rows/entity links, duplicate candidates, merge events; integration verifies tables | PASS |
| Field registry | Versioned registry with broad import surface | Embedded registry has 52 fields; tests assert count and duplicate-alias rejection | PASS |
| Normalization | Deterministic normalizers with blank distinct from unknown | Normalizers and row mapper tested for identity, contact, geo, boolean, date, numeric, percent, currency, range, URL, enum, blank semantics | PASS |
| CSV security | Upload validation protects storage and reports | Oversized, binary, null byte, path traversal, malformed quote, and formula-injection tests pass | PASS |
| Import lifecycle | Upload -> map -> validate -> dry-run -> duplicate review -> commit -> report -> reversal | Services enforce lifecycle transitions, duplicate resolution, idempotent retry, reports, and compensating reversal | PASS |
| Duplicate resolution | Explainable exact/likely/possible review flow; no auto-merge | Feature-level duplicate explanations and manual dispositions tested | PASS |
| Merge planning | Child reassignment and conflict/cycle detection | Domain planner and service tests cover child reassignment, relationship conflict, cycle rejection, safe/blocked reversal | PASS |
| Cross-domain ports | Evidence, observation, variable, consent, audit, outbox boundaries | Versioned ports exist; commit service invokes fakes in tests; API composition deferred | PASS |
| Postgres adapters | Persistence is real for Prompt 4 storage surfaces | Import batch/row/duplicate/org/merge event adapters verified; merge apply writer reassigns supported children and archives absorbed orgs | PASS |
| API/UI routes | Optional if service contracts exist | Service contracts exist; routes/screens deferred to later composition prompt | PASS_WITH_NON_BLOCKING |
| Scoring boundary | Do not start Prompt 5 | No scoring/completeness implementation added | PASS |

## Non-blocking findings

1. **API route composition deferred.** Import and merge services are ready for API wiring, but HTTP routes and UI workflows are not part of this prompt.
2. **DB-backed merge reversal writer needs before/after snapshots.** Eligibility and service orchestration exist. A concrete Postgres reversal writer should be added when merge UI/API records reviewed restoration snapshots.
3. **Dedicated `import_entity_links` writer not yet composed.** Import row `createdEntityRefs` are persisted and tested; the separate link table exists for later reporting/composition workflows.

## Decision

Prompt 4 satisfies the collection and identity-resolution contract needed for Prompt 5. The findings are composition/reporting enhancements, not blockers for scoring.

