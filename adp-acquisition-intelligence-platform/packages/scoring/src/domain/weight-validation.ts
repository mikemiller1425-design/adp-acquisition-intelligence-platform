import { AppError } from '@adp/platform';

import type { ScoreComponentDefinition } from './types.js';

export const WEIGHT_SUM_TOLERANCE = 0.0001;

export function validateWeights(components: readonly ScoreComponentDefinition[]): void {
  if (components.length === 0) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: 'Score definitions must include at least one component',
    });
  }

  const sum = components.reduce((total, component) => {
    if (!Number.isFinite(component.weight) || component.weight <= 0 || component.weight > 1) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Score component weight must be within (0, 1]',
        details: { componentKey: component.key, weight: component.weight },
      });
    }
    return total + component.weight;
  }, 0);

  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: 'Score component weights must sum to 1.0',
      details: { sum },
    });
  }
}
