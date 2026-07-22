import type { ConfidencePolicyDefinition, ConfidencePolicyResult, ScoringInput } from './types.js';

export function executeConfidencePolicy(
  policy: ConfidencePolicyDefinition,
  inputs: readonly ScoringInput[],
  options: { mode?: 'strict' | 'allowDraft'; completeness: number | null },
): ConfidencePolicyResult {
  if (policy.approvalStatus !== 'approved' && options.mode !== 'allowDraft') {
    return {
      aggregate: null,
      explanation: 'Confidence policy is not approved; aggregate withheld outside allowDraft mode.',
    };
  }

  const usable = inputs.filter((input) => input.valueStatus === 'known');
  if (usable.length === 0 || options.completeness === null) {
    return { aggregate: null, explanation: 'No usable inputs available for confidence.' };
  }

  const unassessedDefault = policy.unassessedDefault ?? 0.35;
  const evidenceAverage =
    usable.reduce((sum, input) => sum + confidenceFor(input, unassessedDefault), 0) / usable.length;
  const conflictPenalty = inputs.some((input) => input.valueStatus === 'contradicted')
    ? (policy.conflictPenalty ?? 0.2)
    : 0;
  const stalePenalty = inputs.some(
    (input) => input.valueStatus === 'stale' || input.freshnessResult === 'stale',
  )
    ? (policy.stalePenalty ?? 0.15)
    : 0;
  const aggregate = clamp(evidenceAverage * options.completeness - conflictPenalty - stalePenalty);

  return {
    aggregate: round(aggregate, 4),
    explanation:
      'Confidence combines evidence confidence, completeness coverage, conflicts, and age.',
  };
}

function confidenceFor(input: ScoringInput, unassessedDefault: number): number {
  if (typeof input.confidenceScore === 'number') return clamp(input.confidenceScore);
  switch (input.confidenceStatus) {
    case 'assessed':
      return 0.8;
    case 'provisional':
      return 0.55;
    case 'unassessed':
    case undefined:
      return unassessedDefault;
  }
  return unassessedDefault;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
