import type {
  CompletenessDefinitionVersion,
  CompletenessResult,
  CompletenessVariableDefinition,
  ScoringInput,
  ValueStatus,
} from './types.js';

export function calculateCompleteness(
  definition: Pick<
    CompletenessDefinitionVersion,
    'variables' | 'minimumCompleteness' | 'approvalStatus'
  >,
  inputs: readonly ScoringInput[],
): CompletenessResult {
  const byKey = new Map(inputs.map((input) => [input.variableKey ?? input.componentKey, input]));
  const details = definition.variables.map((variable) =>
    detailFor(variable, byKey.get(variable.key)),
  );
  const applicable = details.filter((detail) => detail.applicable);
  const denominator = applicable.reduce((sum, detail) => sum + detail.weight, 0);
  const numerator = applicable
    .filter((detail) => detail.usable)
    .reduce((sum, detail) => sum + detail.weight, 0);
  const aggregate = denominator === 0 ? null : round(numerator / denominator, 4);
  const missingRequired = details
    .filter((detail) => detail.required && detail.applicable && !detail.usable)
    .map((detail) => detail.key);

  if (aggregate === null) {
    return {
      aggregate: null,
      status: 'insufficient_data',
      missingRequired,
      details,
      explanation: 'No applicable completeness inputs were available.',
    };
  }

  if (missingRequired.length > 0) {
    return {
      aggregate,
      status: 'insufficient_data',
      missingRequired,
      details,
      explanation: 'Required completeness inputs are missing or unusable.',
    };
  }

  if (aggregate < definition.minimumCompleteness) {
    return {
      aggregate,
      status: 'provisional',
      missingRequired,
      details,
      explanation: 'Completeness is below the configured threshold.',
    };
  }

  return {
    aggregate,
    status: 'final',
    missingRequired,
    details,
    explanation: 'Completeness meets the configured threshold.',
  };
}

function detailFor(variable: CompletenessVariableDefinition, input: ScoringInput | undefined) {
  const status: ValueStatus | 'missing' = input?.valueStatus ?? 'missing';
  const applicable = status !== 'not_applicable';
  const usable =
    applicable &&
    input !== undefined &&
    status === 'known' &&
    input.freshnessResult !== 'stale' &&
    input.value !== null &&
    input.value !== undefined;
  return {
    key: variable.key,
    required: variable.required === true,
    applicable,
    usable,
    weight: variable.weight,
    status,
  };
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
