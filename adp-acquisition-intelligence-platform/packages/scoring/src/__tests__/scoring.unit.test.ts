import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { AppError } from '@adp/platform';
import { describe, expect, it } from 'vitest';

import { calculateCompleteness } from '../domain/completeness.js';
import { executeConfidencePolicy } from '../domain/confidence-policy.js';
import { chooseRecommendation } from '../domain/recommendation-policy.js';
import { calculateScoreCore } from '../domain/scoring-engine.js';
import { transformValue } from '../domain/transforms.js';
import type { ScoreDefinitionVersion, ScoringInput } from '../domain/types.js';
import { validateWeights } from '../domain/weight-validation.js';

describe('Prompt 5 transforms', () => {
  it('maps all transform families into a bounded 0-100 score', () => {
    const cases = [
      transformValue({ transform: 'ordinal_linear', value: 2, config: { min: 0, max: 4 } }),
      transformValue({ transform: 'boolean_flag', value: true }),
      transformValue({
        transform: 'capped_band',
        value: 50,
        config: { bands: [{ min: 25, max: 99, score: 55 }] },
      }),
      transformValue({ transform: 'percentage_linear', value: 25 }),
      transformValue({ transform: 'enum_map', value: 'yes', config: { map: { yes: 80 } } }),
      transformValue({
        transform: 'currency_band',
        value: { amountMinor: 100_00, currency: 'USD' },
        config: { bands: [{ min_minor: 1, score: 70 }] },
      }),
      transformValue({
        transform: 'range_midpoint_band',
        value: { min: 10, max: 20 },
        config: { bands: [{ min: 15, max: 15, score: 60 }] },
      }),
      transformValue({
        transform: 'trigger_recency',
        value: '2026-07-12T00:00:00.000Z',
        config: { fresh_days: 5, stale_days: 15 },
        now: new Date('2026-07-22T00:00:00.000Z'),
      }),
      transformValue({ transform: 'identity_passthrough', value: 101 }),
    ];

    expect(cases.every((score) => score >= 0 && score <= 100)).toBe(true);
    expect(cases).toEqual([50, 100, 55, 25, 80, 70, 60, 50, 100]);
  });
});

describe('Prompt 5 completeness and confidence', () => {
  it('handles unknown, not applicable, withheld, stale, and contradicted without zero imputation', () => {
    const result = calculateCompleteness(
      {
        minimumCompleteness: 0.5,
        approvalStatus: 'draft_unapproved',
        variables: [
          { key: 'known', weight: 0.2, required: true },
          { key: 'unknown', weight: 0.2, required: true },
          { key: 'na', weight: 0.2 },
          { key: 'withheld', weight: 0.2 },
          { key: 'stale', weight: 0.2 },
          { key: 'contradicted', weight: 0.2 },
        ],
      },
      [
        input('known', 1, 'known'),
        input('unknown', null, 'unknown'),
        input('na', null, 'not_applicable'),
        input('withheld', null, 'withheld'),
        input('stale', 1, 'stale'),
        input('contradicted', 1, 'contradicted'),
      ],
    );

    expect(result.aggregate).toBe(0.2);
    expect(result.missingRequired).toEqual(['unknown']);
    expect(result.status).toBe('insufficient_data');
  });

  it('returns null aggregate for unapproved confidence policies unless allowDraft is used', () => {
    const strict = executeConfidencePolicy(
      { approvalStatus: 'draft_unapproved' },
      [input('fit', 1, 'known')],
      { completeness: 1 },
    );
    const draft = executeConfidencePolicy(
      { approvalStatus: 'draft_unapproved' },
      [input('fit', 1, 'known')],
      { completeness: 1, mode: 'allowDraft' },
    );

    expect(strict.aggregate).toBeNull();
    expect(draft.aggregate).not.toBeNull();
  });
});

describe('Prompt 5 scoring core properties', () => {
  it('rejects invalid weights and missing required inputs', () => {
    expect(() =>
      validateWeights([
        { key: 'a', weight: 0.4, transform: 'identity_passthrough' },
        { key: 'b', weight: 0.4, transform: 'identity_passthrough' },
      ]),
    ).toThrow(AppError);

    const result = calculateScoreCore(
      definition('direct_payroll_opportunity', [
        { key: 'required', weight: 1, transform: 'identity_passthrough', required: true },
      ]),
      [],
    );
    expect(result.status).toBe('insufficient_data');
    expect(result.score).toBeNull();
  });

  it('is order independent and stays within range for monotonic identity inputs', () => {
    const def = definition('order_independent', [
      { key: 'a', weight: 0.5, transform: 'identity_passthrough' },
      { key: 'b', weight: 0.5, transform: 'identity_passthrough' },
    ]);
    for (let value = 0; value <= 100; value += 5) {
      const left = calculateScoreCore(def, [
        input('a', value, 'known'),
        input('b', 100 - value, 'known'),
      ]);
      const right = calculateScoreCore(def, [
        input('b', 100 - value, 'known'),
        input('a', value, 'known'),
      ]);
      expect(left.score).toBe(right.score);
      expect(left.score).toBeGreaterThanOrEqual(0);
      expect(left.score).toBeLessThanOrEqual(100);
    }
  });

  it('uses deterministic tie handling for recommendation candidates', () => {
    const recommendation = chooseRecommendation([
      {
        scoreKey: 'wholesale_fit',
        family: 'motion',
        status: 'provisional',
        score: 80,
        confidence: 0.9,
        completeness: 0.9,
        policy: { strategicPriority: 1 },
      },
      {
        scoreKey: 'acquisition_fit',
        family: 'motion',
        status: 'final',
        score: 80,
        confidence: 0.7,
        completeness: 0.7,
        policy: { strategicPriority: 2 },
      },
    ]);

    expect(recommendation.primaryMotion).toBe('acquisition_fit');
  });
});

describe('golden score fixtures', () => {
  it('replays expected family outputs', async () => {
    const fixtureDir = fileURLToPath(
      new URL('../../../../tests/fixtures/golden-scores', import.meta.url),
    );
    const files = (await readdir(fixtureDir)).filter((file) => file.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(9);

    for (const file of files) {
      const fixture = JSON.parse(await readFile(`${fixtureDir}/${file}`, 'utf8')) as {
        scoreKey: string;
        family: string;
        components: ScoreDefinitionVersion['components'];
        inputs: ScoringInput[];
        now?: string;
        expected: { status: string; tier: string | null; score: number | null };
      };
      const result = calculateScoreCore(
        definition(fixture.scoreKey, fixture.components, fixture.family),
        fixture.inputs,
        fixture.now === undefined ? {} : { now: new Date(fixture.now) },
      );
      expect({ status: result.status, tier: result.tier, score: result.score }, file).toEqual(
        fixture.expected,
      );
    }
  });
});

function definition(
  key: string,
  components: ScoreDefinitionVersion['components'],
  family = 'motion',
): ScoreDefinitionVersion {
  return {
    key,
    displayName: key,
    description: key,
    family,
    subjectType: 'organization',
    version: 'test',
    status: 'draft',
    approvalStatus: 'draft_unapproved',
    range: [0, 100],
    minimumCompleteness: 0.55,
    tiers: { high: 75, medium: 50, low: 0 },
    confidencePolicy: { approvalStatus: 'approved' },
    recommendationPolicy: {},
    allowOptionalWeightRenormalization: true,
    components,
  };
}

function input(
  componentKey: string,
  value: unknown,
  valueStatus: ScoringInput['valueStatus'],
): ScoringInput {
  return {
    componentKey,
    variableKey: componentKey,
    value,
    valueStatus,
    confidenceStatus: 'assessed',
    confidenceScore: 0.8,
  };
}
