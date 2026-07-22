# Scoring Configuration Guide

**Status:** Prompt 5 draft configuration guide  
**Production activation:** Blocked until SCR-002 and CONF-007 approvals are recorded

This guide explains how to work with Prompt 5 scoring configuration without treating draft definitions as business-approved production scoring.

## Configuration files

Prompt 5 draft files live in `config/scoring`:

- `draft-scores.v1.yaml` — aggregate draft file for all nine score families.
- `<score_key>.v0.1.0-draft.yaml` — per-score draft files for review.
- `confidence_policy.v0.1.0-draft.yaml` — inactive draft confidence policy.
- `recommendation_policy.v0.1.0-draft.yaml` — inactive draft recommendation policy.

Every draft definition must remain:

```yaml
status: draft
approval_status: draft_unapproved
activation_allowed: false
```

Do not change these to active values until `business_scoring_owner` approval exists and the exit contract is updated by an approval/release change.

## Score definition fields

Each score definition includes:

- `key` — stable score key, such as `wholesale_fit`.
- `version` — semantic definition version; Prompt 5 uses `0.1.0-draft`.
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

## Loading and saving drafts

Use the package loaders and services:

```ts
import { ScoreDefinitionService, loadScoreDrafts } from '@adp/scoring';

const drafts = await loadScoreDrafts('config/scoring/draft-scores.v1.yaml');
for (const draft of drafts) {
  await new ScoreDefinitionService(definitionRepository).createDraft(draft);
}
```

`createDraft` forces `status='draft'` and `approvalStatus='draft_unapproved'`.

## Activation guard

Publishing requires:

- admin actor role,
- `approvalStatus: 'approved'`,
- explicit `approvalMetadata`,
- database constraints that allow active status only with approval.

This guard exists to prevent accidental activation. It is not a business approval substitute.

## Draft replay workflow

Use draft replay only for engineering validation:

1. Update the draft YAML and golden fixture together.
2. Run `pnpm --filter @adp/scoring test`.
3. Confirm golden fixtures cover all nine score families.
4. Record changes in Prompt 5 docs or approval packets.
5. Keep SCR-002 pending until approved definitions replace the draft.

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

