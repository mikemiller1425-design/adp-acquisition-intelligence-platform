# Prompt 3: Variables, Evidence, and Provenance

**Branch:** `cursor/prompt-3-variables-evidence-dd2b`  
**Baseline:** Prompt 2 completion commit `7da041ae77439f0d0b36d2282fded6d0737ebd63`  
**Status:** Implemented and validated for Prompt 3 scope

## Scope delivered

Prompt 3 implements the Phase 1 foundation for variables, evidence, provenance, review lifecycle, confidence components, and consent evidence links.

Implemented packages:

- `@adp/evidence`
  - Evidence/source domain primitives.
  - Evidence, source, confidence assessment, staleness, permission evidence link, and research observation services.
  - Postgres repository adapters exported through the package public index.
- `@adp/variables`
  - Variable definition/value domain primitives.
  - Definition versioning and value lifecycle services.
  - Postgres repository adapters exported through the package public index.
- `@adp/database`
  - Prompt 3 schema and migration `0002_lyrical_daimon_hellstrom.sql`.
  - Prompt 3 seed data for the canonical 56 variable definitions and sample evidence/value records.
- `@adp/consent`
  - Evidence record link seam for permission assertions without changing consent precedence behavior.

## Database objects

Prompt 3 adds these tables:

1. `sources`
2. `evidence_records`
3. `confidence_assessments`
4. `research_observations`
5. `variable_definitions`
6. `variable_definition_versions`
7. `variable_values`
8. `variable_value_evidence`
9. `permission_evidence_links`

The migration also adds Prompt 3 enums for evidence types, source types, reviewer status, confidence status, value status, value lifecycle, variable data type, sensitivity, freshness, evidence relationships, and permission evidence subject types.

## Seed data

`packages/database/seeds/variables.ts` seeds:

- 56 active variable definitions matching the current [Variable Dictionary](../05-data/VARIABLE_DICTIONARY.md).
- One active definition version per seeded definition.
- Source and evidence fixtures.
- Sample variable values with provenance.
- Permission evidence link fixture.
- Confidence assessment fixture with component data and `aggregate_score = null`.

The exported constant `VARIABLE_DICTIONARY_DEFINITION_COUNT` is `56`, and database integration tests assert that seed count.

## Evidence model

Evidence records capture claims and provenance, not score results or outreach actions.

Key invariants:

- `evidence_records` are subject-scoped to exactly one organization or contact.
- Material evidence fields (`claim`, `structured_payload`, `content_hash`, and `evidence_type`) are immutable after insert.
- Evidence can be reviewed with `pending`, `approved`, `rejected`, or `needs_review`.
- Evidence content is deduplicated by stable content hash.
- Evidence confidence components are stored independently:
  - `source_reliability`
  - `specificity`
  - `recency`
  - `cross_source_agreement`
  - `extraction_certainty`
- No aggregate confidence score is computed in Prompt 3.

## Variable model

Variable definitions are versioned configuration. Values are subject-scoped facts, estimates, or status sentinels linked to definition versions.

Key invariants:

- `unknown`, `not_applicable`, `withheld`, `contradicted`, and `stale` are distinct statuses.
- Known zero and known false are valid typed values and are not coerced to unknown.
- AI inference remains `ai_inference`; it is not upgraded to `verified_fact` unless a verified value is separately confirmed.
- Only one current, non-contradicted value per subject and variable definition is allowed.
- Superseded values remain in history with `superseded_by_id`.
- Contradicted values remain in history and are excluded from effective current lookup.
- Manual overrides preserve original value lineage through `original_value_id`, actor, reason code/note, and timestamp.
- Active variable definition version material fields are immutable. Publishing a replacement version may retire the previous active version without rewriting its material definition fields.

## Research observation lifecycle

Research observations record claims that may become values only after review:

- `proposed` observations can be accepted, rejected, or marked contradicted.
- Accepted observations require a proposed definition version.
- Acceptance confirms a variable value through the variable value command port and links any evidence record.
- Rejected and contradicted observations do not create values.

## Consent evidence link seam

Prompt 3 adds `permission_evidence_links` and a `ConsentEvidenceLinkPort` seam so consent assertions can attach structured evidence rows. This does not change Prompt 2 consent precedence:

1. global suppression
2. organization restriction
3. contact channel opt-out/restriction
4. contact permission

Legacy human-readable `evidence_ref` fields remain available for Prompt 2 behavior. Prompt 3 evidence links are additive provenance.

## Boundaries intentionally not implemented

Prompt 3 does **not** implement Prompt 4+ features:

- collection import, CSV mapping, dry-run/commit/revert, or duplicate resolution
- scoring, completeness, confidence aggregation weights, or recommendation policy
- discovery agendas, answer mapping UI, or rescore queues
- outreach, autonomous sending, sequence queues, or UI work queues
- reporting/dashboard/export behavior

Confidence aggregation is intentionally unresolved until an approved scoring/confidence policy is implemented in a later prompt. Prompt 3 stores components and explicitly leaves `aggregate_score` null.

## Validation coverage

Prompt 3 tests cover:

- migration creation from an empty schema and Drizzle journal ordering
- seed idempotency and 56 variable definitions
- Prompt 3 subject, uniqueness, FK, check, and immutability constraints
- source metadata credential rejection and source deduplication
- confidence components without fabricated aggregate score
- staleness from explicit freshness policy only
- unknown distinct from zero/false
- `not_applicable` distinct from unknown
- all Prompt 3 typed value shapes
- AI inference provenance retained separately from verified facts
- definition version replacement with active-version material immutability
- transactional value supersession and rollback
- manual override original-value lineage
- contradicted value preservation and effective-current exclusion
- consent evidence link creation without precedence changes

See [Prompt 3 Handoff](../01-reviews/PROMPT_3_HANDOFF.md) for final command evidence.
