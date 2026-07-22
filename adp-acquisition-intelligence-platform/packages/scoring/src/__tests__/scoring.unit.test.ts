import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { AppError } from '@adp/platform';
import { describe, expect, it } from 'vitest';

import { ScoreDefinitionService } from '../application/definition-services.js';
import { calculateCompleteness } from '../domain/completeness.js';
import { executeConfidencePolicy } from '../domain/confidence-policy.js';
import { chooseRecommendation, compareResultsForReplay } from '../domain/recommendation-policy.js';
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

  it('covers transform boundaries, defaults, and validation failures explicitly', () => {
    expect(
      transformValue({ transform: 'ordinal_linear', value: -1, config: { min: 0, max: 4 } }),
    ).toBe(0);
    expect(
      transformValue({ transform: 'ordinal_linear', value: 5, config: { min: 0, max: 4 } }),
    ).toBe(100);
    expect(transformValue({ transform: 'boolean_flag', value: false })).toBe(0);
    expect(
      transformValue({
        transform: 'boolean_flag',
        value: true,
        config: { true_score: 70, false_score: 20 },
      }),
    ).toBe(70);
    expect(
      transformValue({
        transform: 'enum_map',
        value: 'missing',
        config: { map: { known: 90 }, default_score: 10 },
      }),
    ).toBe(10);
    expect(
      transformValue({
        transform: 'range_midpoint_band',
        value: { minMinor: 10_00 },
        config: { bands: [{ min: 10_00, score: 40 }] },
      }),
    ).toBe(40);

    expect(() =>
      transformValue({ transform: 'ordinal_linear', value: 1, config: { min: 2, max: 2 } }),
    ).toThrow(AppError);
    expect(() =>
      transformValue({ transform: 'enum_map', value: 'missing', config: { map: {} } }),
    ).toThrow(AppError);
    expect(() => transformValue({ transform: 'trigger_recency', value: 'not-a-date' })).toThrow(
      AppError,
    );
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

  it('counts explicit zero and false values as known while preserving unknown as incomplete', () => {
    const result = calculateCompleteness(
      {
        minimumCompleteness: 0.75,
        approvalStatus: 'draft_unapproved',
        variables: [
          { key: 'zero', weight: 0.25, required: true },
          { key: 'false', weight: 0.25, required: true },
          { key: 'unknown', weight: 0.25, required: true },
          { key: 'not_applicable', weight: 0.25 },
        ],
      },
      [
        input('zero', 0, 'known'),
        input('false', false, 'known'),
        input('unknown', null, 'unknown'),
        input('not_applicable', null, 'not_applicable'),
      ],
    );

    expect(result.aggregate).toBe(0.6667);
    expect(result.missingRequired).toEqual(['unknown']);
    expect(result.details).toEqual([
      expect.objectContaining({ key: 'zero', usable: true, status: 'known' }),
      expect.objectContaining({ key: 'false', usable: true, status: 'known' }),
      expect.objectContaining({ key: 'unknown', usable: false, status: 'unknown' }),
      expect.objectContaining({
        key: 'not_applicable',
        applicable: false,
        status: 'not_applicable',
      }),
    ]);
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

  it('keeps score confidence null under strict draft policy without suppressing allowDraft evidence', () => {
    const def: ScoreDefinitionVersion = {
      ...definition('draft_confidence_guard', [
        { key: 'fit', weight: 1, transform: 'identity_passthrough', required: true },
      ]),
      confidencePolicy: { approvalStatus: 'draft_unapproved' },
    };

    const strict = calculateScoreCore(def, [input('fit', 80, 'known')]);
    const draft = calculateScoreCore(def, [input('fit', 80, 'known')], {
      confidenceMode: 'allowDraft',
    });

    expect(strict.score).toBe(80);
    expect(strict.confidence).toBeNull();
    expect(strict.status).toBe('provisional');
    expect(draft.confidence).toBe(0.8);
    expect(draft.status).toBe('final');
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

  it('is monotonic for a single identity component and never leaves the 0-100 range', () => {
    const def = definition('monotonic_identity', [
      { key: 'signal', weight: 1, transform: 'identity_passthrough', required: true },
    ]);
    let previousScore = -1;
    for (let value = -25; value <= 125; value += 5) {
      const result = calculateScoreCore(def, [input('signal', value, 'known')], {
        confidenceMode: 'allowDraft',
      });
      expect(result.score).toBeGreaterThanOrEqual(previousScore);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      previousScore = result.score ?? previousScore;
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

  it('compares replayed results deterministically without using score magnitude as a tie-breaker', () => {
    expect(
      compareResultsForReplay(
        { status: 'final', score: 10, confidence: 0.5, completeness: 0.5 },
        { status: 'provisional', score: 99, confidence: 1, completeness: 1 },
      ),
    ).toBeLessThan(0);
    expect(
      compareResultsForReplay(
        { status: 'provisional', score: 80, confidence: 0.8, completeness: 0.8 },
        { status: 'provisional', score: 80, confidence: 0.8, completeness: 0.7 },
      ),
    ).toBeLessThan(0);
  });
});

describe('Prompt 5 definition activation guardrails', () => {
  it('rejects active or already approved draft creation and requires explicit approval metadata to publish', async () => {
    const repository = new MemoryDefinitionRepository();
    const service = new ScoreDefinitionService(repository);

    await expect(
      service.createDraft({ ...definition('active_rejected', []), status: 'active' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      service.createDraft({
        ...definition('approved_rejected', [
          { key: 'fit', weight: 1, transform: 'identity_passthrough' },
        ]),
        approvalStatus: 'approved',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await service.createDraft(
      definition('approval_metadata_required', [
        { key: 'fit', weight: 1, transform: 'identity_passthrough' },
      ]),
    );
    await expect(
      service.publish({
        key: 'approval_metadata_required',
        version: 'test',
        actor: { userId: null, roles: ['admin'] },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      service.publish({
        key: 'approval_metadata_required',
        version: 'test',
        approvalStatus: 'approved',
        approvalMetadata: { ticket: 'SCR-002-not-granted-in-test' },
        actor: { userId: null, roles: ['researcher'] },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('golden score fixtures', () => {
  it('replays expected family outputs', async () => {
    const fixtureDir = fileURLToPath(
      new URL('../../../../tests/fixtures/golden-scores', import.meta.url),
    );
    const files = (await readdir(fixtureDir)).filter((file) => file.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(9);
    const replayedFamilies = new Set<string>();

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
      replayedFamilies.add(fixture.scoreKey);
    }

    expect(replayedFamilies).toEqual(
      new Set([
        'accessibility',
        'acquisition_fit',
        'cas_maturity',
        'data_confidence',
        'direct_payroll_opportunity',
        'influence',
        'revenue_potential',
        'urgency',
        'wholesale_fit',
      ]),
    );
  });

  it('runs a deterministic batch replay smoke for future performance baselines', async () => {
    const fixtureDir = fileURLToPath(
      new URL('../../../../tests/fixtures/golden-scores', import.meta.url),
    );
    const files = (await readdir(fixtureDir)).filter((file) => file.endsWith('.json'));
    const fixtures = await Promise.all(
      files.map(async (file) => {
        return JSON.parse(await readFile(`${fixtureDir}/${file}`, 'utf8')) as {
          scoreKey: string;
          family: string;
          components: ScoreDefinitionVersion['components'];
          inputs: ScoringInput[];
          now?: string;
        };
      }),
    );

    const results = Array.from({ length: 25 }).flatMap(() =>
      fixtures.map((fixture) =>
        calculateScoreCore(
          definition(fixture.scoreKey, fixture.components, fixture.family),
          fixture.inputs,
          fixture.now === undefined ? {} : { now: new Date(fixture.now) },
        ),
      ),
    );

    expect(results).toHaveLength(files.length * 25);
    expect(
      results.every(
        (result) => result.score === null || (result.score >= 0 && result.score <= 100),
      ),
    ).toBe(true);
  });
});

class MemoryDefinitionRepository {
  private readonly definitions = new Map<string, ScoreDefinitionVersion>();

  upsertDraft(definition: ScoreDefinitionVersion): Promise<ScoreDefinitionVersion> {
    this.definitions.set(definition.key, definition);
    return Promise.resolve(definition);
  }

  findByKey(key: string): Promise<ScoreDefinitionVersion | null> {
    return Promise.resolve(this.definitions.get(key) ?? null);
  }

  findActiveByKey(): Promise<ScoreDefinitionVersion | null> {
    return Promise.resolve(null);
  }

  publish(): Promise<ScoreDefinitionVersion> {
    throw new Error('Publish should not be reached without approval metadata and admin role.');
  }
}

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
