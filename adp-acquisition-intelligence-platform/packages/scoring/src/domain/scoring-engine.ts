import { calculateCompleteness } from './completeness.js';
import { executeConfidencePolicy } from './confidence-policy.js';
import { recommendationForScore } from './recommendation-policy.js';
import { transformValue } from './transforms.js';
import type {
  CompletenessDefinitionVersion,
  ScoreCalculationResult,
  ScoreComponentDefinition,
  ScoreDefinitionVersion,
  ScoreFactor,
  ScoringInput,
  ScoreResultStatus,
} from './types.js';
import { validateWeights } from './weight-validation.js';

export interface ScoreCoreOptions {
  confidenceMode?: 'strict' | 'allowDraft';
  now?: Date;
}

export function calculateScoreCore(
  definition: ScoreDefinitionVersion,
  inputs: readonly ScoringInput[],
  options: ScoreCoreOptions = {},
): ScoreCalculationResult {
  validateWeights(definition.components);
  const byComponent = new Map(inputs.map((input) => [input.componentKey, input]));
  const completenessDefinition: CompletenessDefinitionVersion = {
    key: `${definition.key}_core_completeness`,
    displayName: `${definition.displayName} Completeness`,
    description: 'Derived scoring completeness',
    purpose: definition.key,
    subjectType: definition.subjectType,
    version: definition.version,
    status: definition.status,
    approvalStatus: definition.approvalStatus,
    minimumCompleteness: definition.minimumCompleteness,
    variables: definition.components.map((component) => ({
      key: component.key,
      weight: component.weight,
      ...(component.required !== undefined ? { required: component.required } : {}),
    })),
  };
  const completeness = calculateCompleteness(
    completenessDefinition,
    definition.components.map((component) => inputFor(component, byComponent.get(component.key))),
  );
  const factors = buildFactors(definition, byComponent, options.now ?? new Date());
  const missingHighImpactVariables = factors
    .filter(
      (factor) =>
        factor.status !== 'used' &&
        definition.components.find((component) => component.key === factor.componentKey)
          ?.missingImpact === 'high',
    )
    .map((factor) => factor.componentKey);
  const requiredMissing = completeness.missingRequired.length > 0;
  const usedFactors = factors.filter(
    (factor) => factor.status === 'used' && factor.contribution !== null,
  );
  const score =
    requiredMissing || usedFactors.length === 0
      ? null
      : round(weightedScore(usedFactors, definition), 4);
  const confidence = executeConfidencePolicy(definition.confidencePolicy, inputs, {
    ...(options.confidenceMode !== undefined ? { mode: options.confidenceMode } : {}),
    completeness: completeness.aggregate,
  });
  const status = resultStatus({
    score,
    completenessStatus: completeness.status,
    confidence: confidence.aggregate,
    inputs,
  });
  const tier = score === null ? null : tierFor(score, definition.tiers);
  const recommendation = recommendationForScore({
    scoreKey: definition.key,
    family: definition.family,
    status,
    tier,
    policy: definition.recommendationPolicy,
  });

  return {
    scoreKey: definition.key,
    scoreVersion: definition.version,
    status,
    score,
    tier,
    confidence: confidence.aggregate,
    completeness: completeness.aggregate,
    factors,
    topPositiveFactors: [...usedFactors]
      .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0))
      .slice(0, 3),
    topNegativeFactors: [...usedFactors]
      .sort((a, b) => (a.contribution ?? 0) - (b.contribution ?? 0))
      .slice(0, 3),
    missingHighImpactVariables,
    recommendation,
    explanation: {
      completeness: completeness.explanation,
      confidence: confidence.explanation,
      requiredMissing,
    },
  };
}

function inputFor(
  component: ScoreComponentDefinition,
  input: ScoringInput | undefined,
): ScoringInput {
  return (
    input ?? {
      componentKey: component.key,
      variableKey: component.variableKey ?? component.key,
      value: null,
      valueStatus: 'unknown',
    }
  );
}

function buildFactors(
  definition: ScoreDefinitionVersion,
  byComponent: Map<string, ScoringInput>,
  now: Date,
): ScoreFactor[] {
  return definition.components.map((component) => {
    const input = byComponent.get(component.key);
    if (input === undefined) return missingFactor(component, 'missing', 'Input is missing.');
    if (input.valueStatus === 'not_applicable') {
      return missingFactor(component, 'not_applicable', 'Input is not applicable.', input);
    }
    if (input.valueStatus !== 'known' || input.freshnessResult === 'stale') {
      const status =
        input.freshnessResult === 'stale' || input.valueStatus === 'stale'
          ? 'stale'
          : input.valueStatus === 'withheld' || input.valueStatus === 'contradicted'
            ? input.valueStatus
            : 'missing';
      return missingFactor(component, status, 'Input is not usable for scoring.', input);
    }
    const transformedScore = transformValue({
      transform: component.transform,
      value: input.normalizedValue ?? input.value,
      ...(component.transformConfig !== undefined ? { config: component.transformConfig } : {}),
      now,
    });
    return {
      componentKey: component.key,
      variableValueId: input.valueId ?? null,
      rawValue: input.value,
      normalizedValue: input.normalizedValue ?? input.value,
      transformedScore: round(transformedScore, 4),
      weight: component.weight,
      contribution: round(transformedScore * component.weight, 4),
      status: 'used',
      explanation: 'Input transformed and included.',
    };
  });
}

function missingFactor(
  component: ScoreComponentDefinition,
  status: ScoreFactor['status'],
  explanation: string,
  input?: ScoringInput,
): ScoreFactor {
  return {
    componentKey: component.key,
    variableValueId: input?.valueId ?? null,
    rawValue: input?.value ?? null,
    normalizedValue: input?.normalizedValue ?? input?.value ?? null,
    transformedScore: null,
    weight: component.weight,
    contribution: null,
    status,
    explanation,
  };
}

function weightedScore(
  usedFactors: readonly ScoreFactor[],
  definition: ScoreDefinitionVersion,
): number {
  if (!definition.allowOptionalWeightRenormalization) {
    return usedFactors.reduce((sum, factor) => sum + (factor.contribution ?? 0), 0);
  }
  const denominator = usedFactors.reduce((sum, factor) => sum + factor.weight, 0);
  if (denominator === 0) return 0;
  return (
    usedFactors.reduce((sum, factor) => sum + (factor.transformedScore ?? 0) * factor.weight, 0) /
    denominator
  );
}

function resultStatus(input: {
  score: number | null;
  completenessStatus: ScoreResultStatus;
  confidence: number | null;
  inputs: readonly ScoringInput[];
}): ScoreResultStatus {
  if (input.score === null || input.completenessStatus === 'insufficient_data')
    return 'insufficient_data';
  if (
    input.completenessStatus === 'provisional' ||
    input.confidence === null ||
    input.inputs.some(
      (scoringInput) =>
        scoringInput.confidenceStatus === 'unassessed' ||
        scoringInput.valueStatus === 'withheld' ||
        scoringInput.valueStatus === 'stale' ||
        scoringInput.valueStatus === 'contradicted',
    )
  ) {
    return 'provisional';
  }
  return 'final';
}

function tierFor(score: number, tiers: Record<string, number>): string {
  const ordered = Object.entries(tiers).sort((left, right) => right[1] - left[1]);
  return ordered.find(([, threshold]) => score >= threshold)?.[0] ?? 'unclassified';
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
