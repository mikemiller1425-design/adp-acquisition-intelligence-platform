# Scoring Configuration Guide

**Status:** Active Phase 1 baseline configuration guide
**Production activation:** Approved for Phase 1 baseline; unapproved future changes remain blocked by activation guards

This guide explains how to work with the owner-approved Phase 1 baseline scoring configuration and how to keep future calibration changes versioned and guarded.

## Configuration files

Prompt 5/6 baseline files live in `config/scoring` and `config/completeness`:

- `draft-scores.v1.yaml` — aggregate active file for all nine score families.
- `<score_key>.v0.1.0-draft.yaml` — historical filenames containing active `version: 1.0.0` Phase 1 baseline metadata.
- `confidence_policy.v0.1.0-draft.yaml` — active Phase 1 confidence policy.
- `recommendation_policy.v0.1.0-draft.yaml` — active Phase 1 recommendation policy.
- `config/completeness/draft-completeness.v1.yaml` — active completeness seed config.

Active Phase 1 baseline definitions must use:

```yaml
status: active
approval_status: approved
activation_allowed: true
```

Approval is recorded as repository owner (mikemiller1425-design) via Prompt 6 unblock instruction 2026-07-22. Later calibration must publish a superseding version and include fresh approval evidence; do not mutate the meaning of `1.0.0`.

## Score definition fields

Each score definition includes:

- `key` — stable score key, such as `wholesale_fit`.
- `version` — semantic definition version; Phase 1 baseline uses `1.0.0`.
- `family` — `motion` or `support`.
- `subject_type` — `organization` or `contact`.
- `minimum_completeness` — draft threshold used by the engine.
- `range` — currently `[0, 100]`.
- `tiers` — draft high/medium/low thresholds.
- `confidence_policy` — policy metadata; unapproved policy returns `null` in strict mode.
- `recommendation_policy` — deterministic next-action hints.
- `components` — weighted inputs.

Component fields:

- `key` — component key in the score.
- `variable_key` — source variable key when the component maps to the Variable Dictionary.
- `weight` — positive weight. Weights must sum to 1.0 before validation passes.
- `transform` — one of the supported engine transforms.
- `transform_config` — transform-specific settings.
- `required` — when true, missing/unusable data can force `insufficient_data`.
- `missing_impact` — `high` marks gaps that should be surfaced prominently.

## Supported transforms

Prompt 5 implements these transforms in `packages/scoring/src/domain/transforms.ts`:

| Transform | Input shape | Notes |
|---|---|---|
| `ordinal_linear` | number | Linear from configured `min` to `max`, clamped to 0-100. |
| `boolean_flag` | boolean | Defaults true=100 and false=0; configurable scores are allowed. |
| `capped_band` | number | Matches configured numeric bands, then falls back to linear scaling. |
| `percentage_linear` | number | Linear percentage, clamped to 0-100. |
| `enum_map` | string | Maps configured enum values; `default_score` is optional. |
| `currency_band` | object with `amountMinor`, or range bounds | Uses minor units and configured bands. |
| `range_midpoint_band` | object with `min`/`max` or minor-unit bounds | Scores the midpoint or single bound. |
| `trigger_recency` | date string or `Date` | Scores fresh-to-stale date decay. |
| `identity_passthrough` | number | Clamps direct 0-100 values. |

Unknown, missing, N/A, withheld, contradicted, and stale values are handled before transforms. Do not encode missing data as zero.

## Loading and saving definitions

Use the package loaders and services:

```ts
import { ScoreDefinitionService, loadScoreDrafts } from '@adp/scoring';

const definitions = await loadScoreDrafts('config/scoring/draft-scores.v1.yaml');
for (const definition of definitions) {
  if (definition.status === 'draft') {
    await new ScoreDefinitionService(definitionRepository).createDraft(definition);
  }
}
```

`createDraft` still forces draft lifecycle for unapproved definitions. Approved activation uses `publish` with `approvalStatus: 'approved'` and explicit approval metadata, while database seeds can load active approved baseline config directly.

## Activation guard

Publishing requires:

- admin actor role,
- `approvalStatus: 'approved'`,
- explicit `approvalMetadata`,
- database constraints that allow active status only with approval.

This guard exists to prevent accidental activation. It is not an approval substitute for future versions.

## Baseline replay workflow

Use replay for engineering validation and later calibration:

1. Update a new versioned YAML and golden fixture together.
2. Run `pnpm --filter @adp/scoring test`.
3. Confirm golden fixtures cover all nine score families.
4. Record changes in Prompt 5 docs or approval packets.
5. Keep future versions inactive until approval evidence is recorded.

## Approval package checklist

Before production activation, the approval packet should include:

- approved component-to-variable mapping,
- approved weights and transform bands,
- approved completeness thresholds,
- approved confidence aggregation policy,
- approved recommendation/tie policy,
- approved golden replay outputs,
- explicit decision on all mapping gaps in `docs/08-scoring/SCORE_COMPONENT_VARIABLE_MAPPING.md`,
- conflict-register update closing CONF-007.

