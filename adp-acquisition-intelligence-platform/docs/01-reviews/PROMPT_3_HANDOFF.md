# Prompt 3 Handoff

**Prompt:** Variables, evidence, and provenance  
**Branch:** `cursor/prompt-3-variables-evidence-dd2b`  
**Recommendation:** READY FOR PROMPT 4, with non-blocking PostgreSQL 17 validation and confidence aggregation policy deferred.

## What changed

### Database

- Added migration `packages/database/migrations/0002_lyrical_daimon_hellstrom.sql`.
- Added schema modules:
  - `packages/database/src/schema/evidence.ts`
  - `packages/database/src/schema/variables.ts`
- Updated schema exports and enums.
- Added variable/evidence seed support in `packages/database/seeds/variables.ts`.
- Updated database integration coverage for:
  - Prompt 3 table creation.
  - migration journal order.
  - Prompt 3 constraints, FKs, partial unique indexes, and immutability triggers.
  - idempotent seed execution and 56 variable definitions.

### Evidence

- Added `@adp/evidence` package with:
  - source/evidence/confidence/staleness/research-observation domain primitives
  - application services
  - Postgres repositories
  - package tests
- Evidence records deduplicate by content hash and protect material fields from rewrite.
- Confidence assessments store components and leave aggregate score null until an approved policy exists.

### Variables

- Added `@adp/variables` package with:
  - variable definition/value domain primitives
  - definition versioning service
  - value proposal/confirmation/supersession/contradiction/override service
  - Postgres repositories
  - semantic and integration tests
- Gap-fill coverage added for:
  - definition version replacement without rewriting active version material fields
  - manual override original-value lineage
  - contradicted value preservation and effective-current exclusion

### Consent seam

- Added `ConsentEvidenceLinkPort` support to attach `evidence_records` to permission-like consent rows.
- Added integration coverage proving evidence links do not change Prompt 2 consent precedence or legacy `evidence_ref` behavior.

### Documentation

- Added [Prompt 3 implementation summary](../prompts/PROMPT_3_VARIABLES_EVIDENCE_PROVENANCE.md).
- Added [Prompt 3 Architecture Review](PROMPT_3_ARCHITECTURE_REVIEW.md).
- Added [Evidence and Provenance Guide](../development/EVIDENCE_AND_PROVENANCE_GUIDE.md).
- Added [Variable Definition Guide](../development/VARIABLE_DEFINITION_GUIDE.md).
- Updated repository, database, setup, migration, and documentation index notes.

## Prompt 3 database tables

Prompt 3 adds 9 tables:

`sources`, `evidence_records`, `confidence_assessments`, `research_observations`, `variable_definitions`, `variable_definition_versions`, `variable_values`, `variable_value_evidence`, `permission_evidence_links`.

## Variable count

Seeded variable definition count: `56`.

The count is defined as `VARIABLE_DICTIONARY_DEFINITION_COUNT` in `packages/database/seeds/variables.ts` and asserted by `packages/database/src/__tests__/database.integration.test.ts`.

## Validation evidence

Commands run with:

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
sudo service postgresql start
```

Passed:

```bash
pnpm install --frozen-lockfile
pnpm validate
pnpm validate:docs
TEST_DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/database test:integration
TEST_DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/evidence test
TEST_DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/variables test
```

Environment notes:

- Local database-backed validation used the host PostgreSQL 16.14 service.
- `docker-compose.yml` targets PostgreSQL 17; Docker was not available in this cloud image (`docker: command not found`), so this remains a non-blocking compatibility follow-up until the same suites run against PostgreSQL 17.

## Architecture review result

See [Prompt 3 Architecture Review](PROMPT_3_ARCHITECTURE_REVIEW.md).

Verdict: `PASS_WITH_NON_BLOCKING`

Open finding:

- `AR-P3-002` low: local validation used host PostgreSQL 16.14 while compose targets PostgreSQL 17. Run the same migration and integration suite against PostgreSQL 17 before release hardening.

Resolved finding:

- `AR-P3-001` high: active variable definition version immutability initially blocked replacement-version publication. Resolved by allowing only active-to-retired lifecycle transition while preserving material-field immutability and adding integration coverage.

## Unresolved confidence policy

Prompt 3 intentionally does not define confidence aggregation weights.

Current behavior:

- Evidence and confidence services validate and persist component values.
- `confidence_assessments.aggregate_score` remains null.
- Service explanations state that no approved aggregation formula exists.

Prompt 4 must not assume an aggregate confidence score. Prompt 5/scoring or a dedicated policy prompt must define any approved aggregation formula, versioning, replay, and golden tests before aggregate scores are populated.

## Deferred work

Deferred by prompt boundary:

- Prompt 4 collection import, manual entry workflows, CSV mapping, dry-run/commit/revert, duplicate detection, and merge review.
- Prompt 5 completeness, scoring, confidence aggregation, score snapshots, and recalculation.
- Prompt 7 discovery agendas, answer mapping, and score deltas.
- Prompt 8 outreach, sequences, activity tracking, consent-gated sending/recording, and response classification.
- Prompt 10 reporting, dashboards, exports, and UI queues.

Deferred operational follow-up:

- Run database-backed validation against PostgreSQL 17 or CI equivalent.
- Compose production authz and object-level access checks around the new services when API/routes/jobs are introduced.
- Add performance/query-plan evidence when Prompt 4+ introduces high-volume import/list/query paths.

## PG16 vs PG17 note

This cloud environment validated against the available host PostgreSQL 16.14 service. The project compose target is PostgreSQL 17, but Docker was not available in this cloud image. No PostgreSQL 16-specific SQL was intentionally introduced, but PostgreSQL 17 validation remains open as `AR-P3-002`.

## READY recommendation draft

READY FOR PROMPT 4.

Prompt 4 can safely build collection/import and identity-resolution behavior on:

- canonical organization/contact persistence from Prompt 2
- structured source and evidence records
- research observations that can later be accepted into variable values
- versioned variable definitions and current/history value semantics
- evidence links for values and consent permissions
- distinct unknown/false/zero/not-applicable/withheld/contradicted/stale semantics

Prompt 4 must not implement scoring, discovery, outreach, UI queues, autonomous sending, or confidence aggregation weights.
