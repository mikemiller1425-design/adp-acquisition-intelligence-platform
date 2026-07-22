# Variable Definition Guide

This guide explains how Prompt 3 variable definitions and values are modeled and how later prompts should use them.

## Package

Use `@adp/variables` for variable-domain behavior.

Public exports are defined in:

- `packages/variables/src/index.ts`

Important modules:

- `domain/variables.ts` — data types, statuses, evidence types, validation, normalization, subject helpers.
- `domain/ports.ts` — definition/value repositories, audit/outbox/authz ports, and public record types.
- `application/variable-definition-service.ts` — draft definition creation, version creation, publish, retire.
- `application/variable-value-service.ts` — propose, confirm, supersede, contradict, manual override, effective-current lookup, history, evidence links.
- `infrastructure/postgres-repositories.ts` — Postgres implementations of variable ports.

## Tables

Variable definitions and values use:

- `variable_definitions`
- `variable_definition_versions`
- `variable_values`
- `variable_value_evidence`
- `confidence_assessments`
- `evidence_records`

See [Database Architecture](../05-data/DATABASE_ARCHITECTURE.md) and the [Variable Dictionary](../05-data/VARIABLE_DICTIONARY.md).

## Seeded dictionary

Prompt 3 seeds 56 active variable definitions.

The count is defined by:

- `VARIABLE_DICTIONARY_DEFINITION_COUNT` in `packages/database/seeds/variables.ts`

The seed is idempotent. It creates one active definition version per seeded definition.

## Definition contract

Each variable definition has:

- stable `key`
- display label
- description
- subject type (`organization` or `contact`)
- data type
- current version pointer
- lifecycle status

Each definition version can carry:

- unit
- allowed values
- range constraints
- null/status semantics
- collection methods
- evidence requirements
- confidence requirements
- freshness policy
- sensitivity classification
- applicable workflows
- score consumer metadata
- help text
- lifecycle status

Definition keys must be snake_case and stable. Do not repurpose a key for a different semantic meaning.

## Data types

Prompt 3 supports:

- `boolean`
- `integer`
- `decimal`
- `percentage`
- `currency`
- `string`
- `enum`
- `date`
- `datetime`
- `integer_range`
- `decimal_range`
- `currency_range`
- `categorized_list`
- `controlled_multiselect`
- `ordinal_rubric`

Use integer minor units plus ISO currency for currency values.

## Value statuses

Value statuses are semantic and must not be collapsed:

- `known`
- `unknown`
- `not_applicable`
- `withheld`
- `contradicted`
- `stale`

Known zero is not unknown. Known false is not unknown. Empty string can be a known string value.

For non-known statuses, use explicit status sentinels:

```json
{ "status": "unknown" }
```

```json
{ "status": "not_applicable" }
```

```json
{ "status": "withheld" }
```

## Evidence types

Variable values carry an evidence type:

- `verified_fact`
- `source_derived_fact`
- `user_entered_fact`
- `calculated`
- `ai_inference`
- `unknown`

`ai_inference` is never the same as `verified_fact`. If a reviewer later verifies the value, create a separate verified value through confirmation/supersession.

## Definition version lifecycle

Create and publish definitions through `VariableDefinitionService`.

Lifecycle:

- draft definition
- draft version
- active published version
- retired prior version

Active version material fields are immutable. Publishing a replacement version may retire the prior active version, but it must not rewrite the prior version's unit, constraints, semantics, evidence requirements, freshness policy, or help text.

## Value lifecycle

Variable value lifecycle:

- `proposed`
- `current`
- `superseded`
- `contradicted`
- `stale`
- `archived`

Rules:

- Only one current non-contradicted value can exist for a subject and definition.
- Confirming a new current value supersedes the prior current value in one transaction.
- Prior values remain queryable through history.
- Contradicted values remain in history and are excluded from effective-current lookup.
- Rollback of a later transactional port failure must leave the original current value intact.

## Manual overrides

Manual overrides are visible data, not hidden patches.

Override rows include:

- `manual_override_flag`
- `override_actor`
- `override_reason_code`
- `override_reason_note`
- `override_at`
- `original_value_id`

The actor must be attributable to a persisted user because the database enforces override metadata. Removing an override restores the original value content through a new current row while preserving lineage to the original value.

## Confidence

Prompt 3 does not implement confidence aggregation weights.

Allowed Prompt 3 behavior:

- store `confidence_status`
- link to `confidence_assessments`
- store component values in `confidence_assessments`
- leave `aggregate_score` null

Disallowed Prompt 3 behavior:

- invent aggregate confidence weights
- infer score confidence from source count alone
- treat AI inference as verified fact

## Freshness

Freshness is represented by:

- definition version `freshness_policy`
- value `freshness_result`
- observed/effective/verified/expiry timestamps

Stale values stay distinct from unknown values. Stale evidence updates freshness/research posture without inventing fit.

## Using values in later prompts

Later prompts should:

- read current values through service/repository methods that exclude contradicted values
- read full history when explaining provenance, supersession, contradiction, or overrides
- link evidence for every sourced or reviewed value when available
- preserve original discovery answers separately from normalized variable values
- avoid scoring or outreach assumptions until those prompts implement their policies

## Prompt boundary

This guide does not define:

- collection import or duplicate resolution
- completeness or scoring formulas
- discovery question selection
- outreach behavior
- UI queues or dashboards

Those are Prompt 4+ responsibilities.
