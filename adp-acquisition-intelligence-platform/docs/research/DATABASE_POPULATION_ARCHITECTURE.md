# Database Population Architecture

**Version:** 1.0.0  
**Status:** Implemented (Phase 1.1 population engine)  
**Package:** `@adp/research`  
**Migration:** `packages/database/migrations/0010_phase_1_1_population_research.sql`  
**Schema module:** `packages/database/src/schema/research.ts`

## Purpose

Phase 1.1 extends the Phase 1 canonical model with a **population and research** data plane. It populates the target universe from approved bulk sources, resolves candidates into organizations without uncontrolled auto-merge, stores approved public-source registry metadata, and retains retrieval snapshots and extracted claims as **proposals** until human review.

This document is the data architecture companion to:

- [Target Universe Ingestion](TARGET_UNIVERSE_INGESTION.md)
- [Entity Resolution Policy](ENTITY_RESOLUTION_POLICY.md)
- [Public Source Collection Architecture](PUBLIC_SOURCE_COLLECTION_ARCHITECTURE.md)
- [Approved Source Registry](APPROVED_SOURCE_REGISTRY.md)
- Existing [Database Architecture](../05-data/DATABASE_ARCHITECTURE.md)

## Design principles reflected in schema

| Principle | Schema / enum expression |
|---|---|
| Bulk first | Population import tables are first-class; live collection is opt-in via `approved_sources` |
| Archive before live | Adapter types include `bulk_archive` and `archived_web`; live `organization_website` is gated |
| Claims are proposals | `extracted_claims.review_status` defaults to `proposed`; no auto-confirm path in collectors |
| Collectors never confirm variables/scores | Claims link optionally to canonical evidence/variable IDs only after review |
| Kill switch / lifecycle | `approved_sources.lifecycle`, `kill_switch_active` |
| Idempotent jobs | Unique `idempotency_key` on imports, collection runs, and jobs |
| Provenance | Snapshots store URL, hash, redirect chain, adapter/parser/policy versions |

## Enum catalog

| Enum | Values |
|---|---|
| `population_source_approval_status` | `draft`, `under_review`, `approved`, `enabled`, `suspended`, `retired` |
| `population_import_status` | `uploaded`, `mapping`, `validating`, `normalizing`, `resolving`, `preview_ready`, `committing`, `committed`, `failed`, `reversed` |
| `raw_candidate_status` | `raw`, `normalized`, `resolved`, `rejected`, `restricted`, `ambiguous` |
| `entity_resolution_decision` | `create_new`, `link_existing`, `create_location`, `possible_duplicate`, `ambiguous_review`, `reject`, `restricted`, `existing_relationship`, `out_of_territory` |
| `approved_source_lifecycle` | `draft`, `under_review`, `approved`, `enabled`, `suspended`, `retired` |
| `approved_source_adapter_type` | `bulk_archive`, `public_api`, `licensed_data`, `archived_web`, `structured_metadata`, `organization_website`, `fixture` |
| `research_priority_tier` | `A`, `B`, `C`, `D` |
| `collection_run_status` | `draft`, `queued`, `running`, `cancelling`, `cancelled`, `completed`, `failed` |
| `collection_job_status` | `queued`, `running`, `succeeded`, `failed`, `cancelled`, `blocked`, `skipped` |
| `extracted_claim_review_status` | `proposed`, `accepted`, `accepted_corrected`, `rejected`, `duplicate`, `contradictory`, `deferred`, `needs_research`, `source_problem` |

## Table groups

### 1. Population sources and imports

| Table | Role |
|---|---|
| `population_sources` | Registry of bulk/licensed population datasets (license, permitted/prohibited fields, coverage, approval) |
| `population_source_versions` | Versioned license policy + schema mapping per source |
| `population_imports` | Import batch with idempotency, dry-run flag, counts, report JSON |
| `population_import_rows` | Per-row raw/normalized payloads and validation errors |
| `raw_candidates` | Normalized identity candidates ready for resolution / org link |

**Key constraints**

- `population_sources.source_key` unique
- `population_imports.idempotency_key` unique
- Non-negative count check on imports
- FK from imports → sources (`ON DELETE restrict`) so licensed sources are not casually removed

### 2. Entity resolution

| Table | Role |
|---|---|
| `entity_resolution_runs` | Batch run tied to an import and policy version |
| `entity_resolution_candidates` | Ranked match proposals with confidence and signals (0–100) |
| `entity_resolution_decisions` | Human or system decision with rationale and optional organization ID |

Resolution **reuses** `@adp/collection` duplicate matching (`matchDuplicateCandidate`) and records decisions with policy version `entity-resolution-v1`. See [Entity Resolution Policy](ENTITY_RESOLUTION_POLICY.md).

### 3. Approved sources and priority

| Table | Role |
|---|---|
| `approved_sources` | Allowlisted retrieval adapters with reviews, rate/size limits, kill switch |
| `research_priority_assessments` | Per-org tier A–D assessments (draft formula; production activation gated) |

Config mirrors:

- `config/population/population_sources.v1.yaml`
- `config/research/approved_sources.v1.yaml`
- `config/research/research_priority.v1.yaml`

### 4. Collection, snapshots, extraction

| Table | Role |
|---|---|
| `collection_runs` | Orchestrated run against an approved source |
| `collection_run_targets` | Org + domain targets for a run |
| `collection_jobs` | Fine-grained job rows (retrieve, snapshot, extract, …) |
| `source_snapshots` | Immutable retrieval metadata + content hash + optional storage key |
| `extraction_runs` | Extractor/mapping version applied to a snapshot |
| `extracted_claims` | Proposed variable claims awaiting review |
| `collection_coverage` | Per-org coverage rollup (one row per organization) |
| `source_rate_limit_states` | Sliding window counters per approved source + domain |

**Integrity notes**

- Unique `(collection_job_id, requested_url, content_hash)` on snapshots supports dedupe
- Claims default to `proposed`; accept path records `canonical_evidence_id` / `canonical_variable_value_id`
- Rate-limit state unique on `(approved_source_id, domain)`

## Relationship to Phase 1 tables

Population and research tables **do not replace** Prompt 4 import batches (`import_batches` / `import_rows`). They are a parallel, research-owned pipeline for **universe population** and **targeted public enrichment**:

| Concern | Phase 1 collection | Phase 1.1 research |
|---|---|---|
| Operator CRM/file import | `import_batches` | — |
| Licensed/bulk universe load | — | `population_*` / `raw_candidates` |
| Duplicate matcher | `@adp/collection` | Reused via `resolveEntity` |
| Evidence / variables | `@adp/evidence`, `@adp/variables` | Claim review proposes into those ports |
| Scores | `@adp/scoring` | Recalc requested only after claim accept |

## Indexing strategy

Indexes favor:

- Source lifecycle and approval lookups
- Import status and identity-key scans during resolution
- Claim review queues (`review_status`, `variable_key`, `organization_id`)
- Snapshot content-hash reuse
- Coverage and rate-limit hot paths

Pilot volume assumptions (see `config/research/collection_policy.v1.yaml`): ≤10k rows/import, ≤100 orgs/collection run, ≤8 pages/org.

## Storage of snapshot bodies

`source_snapshots.storage_key` is a pointer (object-store key), not the body. Production backup/retention for snapshot objects is tracked as **RB-016**. Local/CI pilots may omit object storage and rely on fixture retrieval only.

## Non-goals in schema

The schema intentionally does **not** introduce:

- LinkedIn-specific scrape tables
- CAPTCHA or auth-bypass credential stores
- Auto-confirmed variable writes from collectors
- Unbounded crawl frontier / link-queue tables

## Change control

Schema changes require a new migration after `0010`, updates to `packages/database/src/schema/research.ts`, and coordinated updates to this document and the Phase 1.1 completion/release artifacts.
