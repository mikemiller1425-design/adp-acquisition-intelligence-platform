# Target Universe Ingestion

**Version:** 1.0.0  
**Status:** Implemented  
**Service:** `PopulationImportService` in `@adp/research`  
**Config:** `config/population/population_sources.v1.yaml`  
**Policy companion:** [Entity Resolution Policy](ENTITY_RESOLUTION_POLICY.md), [Database Population Architecture](DATABASE_POPULATION_ARCHITECTURE.md)

## Goal

Load a **target universe** of organizations from approved population sources into `raw_candidates`, resolve them against existing organizations, and optionally create or link records—without treating bulk load as live web scraping.

## Source registry

Population sources are versioned records (`population_sources` + `population_source_versions`) with:

- `source_key`, provider, source type
- `license_status` and permitted/prohibited fields
- Geographic / organization coverage
- `approval_status` lifecycle (`draft` → … → `enabled` / `suspended` / `retired`)
- Retention requirements and data owner

### Seeded / fixture config (v1)

| `source_key` | Approval | Notes |
|---|---|---|
| `internal_crm_export` | `approved` | Internal-use CRM export fields |
| `licensed_directory_fixture` | `draft` | Pending owner licensing approval (**RB-014**) |

Agents and automation **must not** self-approve licensing. Human owner approval is required before enabling licensed external directories.

## Import pipeline

```text
upload / request
    → authz (population_import:create)
    → idempotency check
    → create population_imports (dry_run default true)
    → map columns → normalizePopulationRow
    → insert raw_candidates (status=normalized)
    → resolveEntity via @adp/collection matcher
    → preview report (matched / created / ambiguous / rejected)
    → commit only when dryRun=false and decisions allow
```

### Status machine (`population_import_status`)

`uploaded` → `mapping` → `validating` → `normalizing` → `resolving` → `preview_ready` → `committing` → `committed`  
Failure / undo paths: `failed`, `reversed`.

The application service currently drives normalize → resolve in-process and persists an import report JSON suitable for operator preview.

### Normalization

`normalizePopulationRow` applies mapping from logical fields (`displayName`, `legalName`, `domain`, …) to source columns, then:

- Whitespace and org-name normalization (strip LLC/Inc noise)
- Domain normalization (strip scheme, `www.`, port, path)
- Phone to last-10 digits when possible
- Identity key precedence: `domain:` → `ext:` → `name:…|postal:` → anonymous fallback
- Validation: reject rows missing all of display/legal/domain (`missing_identity`)

### Dry run vs commit

| Mode | Behavior |
|---|---|
| `dryRun: true` (default) | Normalize + resolve; **no** org create/link side effects |
| `dryRun: false` | Exact `link_existing` links; `create_new` creates organizations |

Ambiguous / possible-duplicate decisions never auto-merge. See [Entity Resolution Policy](ENTITY_RESOLUTION_POLICY.md).

## Idempotency and events

- Unique `idempotency_key` on `population_imports`
- Replay returns the prior import + report
- Outbox events include `population.import_created`, `population.organization_matched`, `population.organization_created`, and resolution review signals as applicable

Job type constants (for worker wiring) are declared in `RESEARCH_JOB_TYPES` (`population.import.requested`, `population.normalize.requested`, `population.resolve.requested`, …).

## Authorization

`AllowListResearchCapabilityChecker` gates `population_import:create` to roles `admin` and `ops`. Viewers and sales cannot create imports.

## Pilot limits

From `config/research/collection_policy.v1.yaml`:

- Max **10,000** rows per population import
- Max **1,000** organizations per resolution batch

Performance coverage: `population.performance.test.ts` dry-runs 10k candidate rows.

## Relationship to Prompt 4 imports

Operator file imports remain on the Prompt 4 path (`@adp/collection` import batches). Universe population is the research-owned bulk path for territory coverage expansion. Do not conflate the two UIs or tables.

## Failure and recovery

| Symptom | Operator action |
|---|---|
| High `rejected_count` | Fix mapping / source quality; re-import with new idempotency key |
| High `ambiguous_count` | Complete entity-resolution review queue before commit |
| Source `draft` / license pending | Do not enable; track **RB-014** |
| Need undo after commit | Use `reversed` status path and organization merge/archive procedures — do not hard-delete provenance |

Operational detail: [Population Operations Runbook](POPULATION_OPERATIONS_RUNBOOK.md).

## Non-objectives

Universe ingestion does **not**:

- Scrape LinkedIn or authenticated portals
- Bypass licensing or field prohibitions
- Confirm variables or write scores
- Crawl arbitrary external links discovered in bulk rows
