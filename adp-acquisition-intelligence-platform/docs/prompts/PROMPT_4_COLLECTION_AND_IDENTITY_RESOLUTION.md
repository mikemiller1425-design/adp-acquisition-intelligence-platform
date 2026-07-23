# Prompt 4 — Collection and Identity Resolution

**Status:** Implemented and locally verified  
**Branch:** `cursor/prompt-4-collection-identity-dd2b`  
**PostgreSQL gate:** [Prompt 4 PostgreSQL 17 Gate](../01-reviews/PROMPT_4_POSTGRESQL_17_GATE.md)

## Scope

Prompt 4 adds the collection/import and identity-resolution package surface needed before scoring:

- CSV upload validation, private artifact storage, malware-scan port use, mapping, validation, dry-run, commit, retry, reports, and reversal services.
- A 52-field import field registry spanning organization, location, contact, consent, and variable proposal fields.
- Deterministic normalizers for identity keys, contact channels, geography, dates, booleans, numbers, percentages, currency, ranges, URLs, and enums.
- Explainable duplicate candidate scoring with exact/likely/possible tiers and feature-level explanations.
- Manual duplicate review dispositions before commit.
- Merge planning with child reassignment previews and relationship/cycle conflict detection.
- Versioned public service contracts for evidence, observation, variable, consent, audit, outbox, storage, malware scan, and authorization ports.

Prompt 4 does **not** start Prompt 5 scoring or completeness work.

## Implemented package surface

Primary package: `packages/collection`.

Key modules:

- `domain/field-registry.ts` — embedded 52-field registry and strict alias validation.
- `domain/normalizers.ts` — pure normalization policy.
- `application/import-row-normalization.ts` — mapping-to-normalized-row behavior, including blank semantics.
- `domain/duplicate-matcher.ts` — explainable duplicate signals and tiers.
- `domain/import-lifecycle.ts` — import status transition guards.
- `domain/merge-planner.ts` and `domain/reversal.ts` — merge/reversal safety decisions.
- `application/services.ts` — upload, mapping, validation, dry-run, duplicate review, commit, retry, report, import reversal, merge, and merge reversal services.
- `infrastructure/postgres-repositories.ts` — Postgres repositories for import batches/rows/duplicate review/org creation/merge events and merge write application.

## Deferred composition

API routes and UI screens for import operations are deferred to API/UI composition prompts. The versioned service contracts exist and are tested. Postgres merge reversal still requires a reviewed before/after restoration snapshot before a DB-backed reversal writer should move children back; `MergeReversalService` already enforces eligibility and can use a concrete reversal writer when composed.

## Verification evidence

Collection package verification:

- Unit/domain/service: normalizers, field registry, mapping, lifecycle, duplicate features, commit gates, retry, consent behavior, merge planning, reversal eligibility.
- PG17 integration: migration tables, batch/row persistence, mixed valid/invalid validation, dry-run no business mutation, duplicate-review blocking, commit, idempotent commit retry, provenance proposal ports, consent preservation, audit/outbox ports, import reversal, merge child reassignment/reversal service behavior.
- Security: oversized/binary/null/path-traversal/malformed CSV rejection, formula-safe report output, unauthorized report/commit/merge denial.
- E2E service: 29-row CSV with 27 valid organizations, malformed rows, exact and ambiguous duplicates, dry-run, review, commit, provenance, report, and reversal.
- Performance: 10k-row CSV parser/validator baseline with duration and heap logging.

