import { AppError } from '@adp/platform';

import type { TransformName } from './types.js';

export interface TransformInput {
  transform: TransformName;
  value: unknown;
  config?: Record<string, unknown>;
  now?: Date;
}

export function transformValue(input: TransformInput): number {
  switch (input.transform) {
    case 'ordinal_linear':
      return ordinalLinear(input.value, input.config);
    case 'boolean_flag':
      return booleanFlag(input.value, input.config);
    case 'capped_band':
      return numericBand(readNumber(input.value, 'capped_band value'), input.config, 'value');
    case 'percentage_linear':
      return percentageLinear(input.value, input.config);
    case 'enum_map':
      return enumMap(input.value, input.config);
    case 'currency_band':
      return currencyBand(input.value, input.config);
    case 'range_midpoint_band':
      return numericBand(rangeMidpoint(input.value), input.config, 'value');
    case 'trigger_recency':
      return triggerRecency(input.value, input.config, input.now ?? new Date());
    case 'identity_passthrough':
      return clamp(readNumber(input.value, 'identity_passthrough value'), 0, 100);
  }
}

export function ordinalLinear(value: unknown, config: Record<string, unknown> = {}): number {
  const numeric = readNumber(value, 'ordinal_linear value');
  const min = readOptionalNumber(config['min']) ?? 0;
  const max = readOptionalNumber(config['max']) ?? 4;
  if (max <= min) throwInvalidConfig('ordinal_linear requires max > min');
  return clamp(((numeric - min) / (max - min)) * 100, 0, 100);
}

export function booleanFlag(value: unknown, config: Record<string, unknown> = {}): number {
  if (typeof value !== 'boolean') {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: 'boolean_flag value must be boolean',
    });
  }
  return value
    ? (readOptionalNumber(config['true_score']) ?? 100)
    : (readOptionalNumber(config['false_score']) ?? 0);
}

export function percentageLinear(value: unknown, config: Record<string, unknown> = {}): number {
  const numeric = readNumber(value, 'percentage_linear value');
  const min = readOptionalNumber(config['min']) ?? 0;
  const max = readOptionalNumber(config['max']) ?? 100;
  if (max <= min) throwInvalidConfig('percentage_linear requires max > min');
  return clamp(((numeric - min) / (max - min)) * 100, 0, 100);
}

export function enumMap(value: unknown, config: Record<string, unknown> = {}): number {
  if (typeof value !== 'string') {
    throw new AppError({ code: 'VALIDATION_FAILED', message: 'enum_map value must be string' });
  }
  const map = isRecord(config['map']) ? config['map'] : {};
  const score = readOptionalNumber(map[value]) ?? readOptionalNumber(config['default_score']);
  if (score === undefined) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: 'enum_map has no score for value',
      details: { value },
    });
  }
  return clamp(score, 0, 100);
}

export function currencyBand(value: unknown, config: Record<string, unknown> = {}): number {
  const amount = currencyAmountMinor(value);
  return numericBand(amount, config, 'minor');
}

export function triggerRecency(
  value: unknown,
  config: Record<string, unknown> = {},
  now = new Date(),
): number {
  const triggerDate = parseDate(value);
  const freshDays = readOptionalNumber(config['fresh_days']) ?? 30;
  const staleDays = readOptionalNumber(config['stale_days']) ?? 180;
  if (staleDays <= freshDays)
    throwInvalidConfig('trigger_recency requires stale_days > fresh_days');
  const ageDays = (now.getTime() - triggerDate.getTime()) / 86_400_000;
  if (ageDays <= freshDays) return 100;
  if (ageDays >= staleDays) return 0;
  return clamp(100 - ((ageDays - freshDays) / (staleDays - freshDays)) * 100, 0, 100);
}

function numericBand(
  value: number,
  config: Record<string, unknown> = {},
  key: 'value' | 'minor',
): number {
  const bands = Array.isArray(config['bands']) ? config['bands'] : [];
  for (const band of bands) {
    if (!isRecord(band)) continue;
    const min = readOptionalNumber(band[key === 'minor' ? 'min_minor' : 'min']);
    const max = readOptionalNumber(band[key === 'minor' ? 'max_minor' : 'max']);
    const score = readOptionalNumber(band['score']);
    if (score === undefined) continue;
    if ((min === undefined || value >= min) && (max === undefined || value <= max)) {
      return clamp(score, 0, 100);
    }
  }

  const min = readOptionalNumber(config['min']) ?? 0;
  const max = readOptionalNumber(config['max']) ?? 100;
  if (max <= min) return clamp(value, 0, 100);
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

function rangeMidpoint(value: unknown): number {
  if (!isRecord(value)) {
    throw new AppError({ code: 'VALIDATION_FAILED', message: 'range value must be an object' });
  }
  const min = readOptionalNumber(value['min']) ?? readOptionalNumber(value['minMinor']);
  const max = readOptionalNumber(value['max']) ?? readOptionalNumber(value['maxMinor']);
  if (min === undefined && max === undefined) {
    throw new AppError({ code: 'VALIDATION_FAILED', message: 'range value must include a bound' });
  }
  if (min !== undefined && max !== undefined) return (min + max) / 2;
  return min ?? (max as number);
}

function currencyAmountMinor(value: unknown): number {
  if (!isRecord(value)) {
    throw new AppError({ code: 'VALIDATION_FAILED', message: 'currency value must be an object' });
  }
  if (typeof value['amountMinor'] === 'number') return value['amountMinor'];
  return rangeMidpoint(value);
}

function readNumber(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new AppError({ code: 'VALIDATION_FAILED', message: `${field} must be numeric` });
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseDate(value: unknown): Date {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (date === null || Number.isNaN(date.getTime())) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: 'trigger_recency value must be a date',
    });
  }
  return date;
}

function throwInvalidConfig(message: string): never {
  throw new AppError({ code: 'VALIDATION_FAILED', message });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
