import type { FreshnessResult, StalenessEvaluation } from '../domain/evidence.js';
import type { FreshnessPolicyCarrier, FreshnessValueCarrier } from '../domain/ports.js';

export class StalenessEvaluationService {
  evaluate(input: {
    definitionVersion: FreshnessPolicyCarrier;
    value: FreshnessValueCarrier;
    evaluatedAt?: Date;
  }): StalenessEvaluation {
    const evaluatedAt = input.evaluatedAt ?? new Date();
    if (input.value.expiresAt !== null) {
      return {
        result: input.value.expiresAt <= evaluatedAt ? 'stale' : 'fresh',
        explanation:
          input.value.expiresAt <= evaluatedAt
            ? 'Value expiresAt is at or before evaluation time.'
            : 'Value has an explicit future expiresAt.',
        evaluatedAt,
        expiresAt: input.value.expiresAt,
      };
    }

    const policy = asPolicy(input.definitionVersion.freshnessPolicy);
    if (policy === null) {
      return {
        result: 'no_policy',
        explanation: 'Definition version does not define a freshness policy.',
        evaluatedAt,
        expiresAt: null,
      };
    }

    const referenceAt = input.value.observedAt ?? input.value.effectiveAt;
    if (referenceAt === null) {
      return {
        result: 'unknown',
        explanation: 'Freshness policy exists, but the value has no observedAt or effectiveAt.',
        evaluatedAt,
        expiresAt: null,
      };
    }

    if (policy.staleAfterDays === null) {
      return {
        result: 'unknown',
        explanation: 'Freshness policy does not include a recognized staleAfterDays window.',
        evaluatedAt,
        expiresAt: null,
      };
    }

    const staleAt = addDays(referenceAt, policy.staleAfterDays);
    if (evaluatedAt >= staleAt) {
      return {
        result: 'stale',
        explanation: 'Value age exceeds the definition freshness policy.',
        evaluatedAt,
        expiresAt: staleAt,
      };
    }

    const expiringAt =
      policy.expiringAfterDays === null ? null : addDays(referenceAt, policy.expiringAfterDays);
    const result: FreshnessResult =
      expiringAt !== null && evaluatedAt >= expiringAt ? 'expiring' : 'fresh';
    return {
      result,
      explanation:
        result === 'expiring'
          ? 'Value is inside the definition freshness warning window.'
          : 'Value is inside the definition freshness policy window.',
      evaluatedAt,
      expiresAt: staleAt,
    };
  }
}

function asPolicy(
  value: unknown,
): { staleAfterDays: number | null; expiringAfterDays: number | null } | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { staleAfterDays: null, expiringAfterDays: null };
  }
  const record = value as Record<string, unknown>;
  return {
    staleAfterDays:
      readNonNegativeNumber(record, 'staleAfterDays') ??
      readNonNegativeNumber(record, 'maxAgeDays'),
    expiringAfterDays:
      readNonNegativeNumber(record, 'expiringAfterDays') ??
      readNonNegativeNumber(record, 'warningAfterDays'),
  };
}

function readNonNegativeNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
