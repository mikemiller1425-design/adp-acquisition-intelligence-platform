import { AppError } from '@adp/platform';

export const variableDataTypes = [
  'boolean',
  'integer',
  'decimal',
  'percentage',
  'currency',
  'string',
  'enum',
  'date',
  'datetime',
  'integer_range',
  'decimal_range',
  'currency_range',
  'categorized_list',
  'controlled_multiselect',
  'ordinal_rubric',
] as const;

export const definitionLifecycles = ['draft', 'active', 'retired'] as const;
export const valueStatuses = [
  'known',
  'unknown',
  'not_applicable',
  'withheld',
  'contradicted',
  'stale',
] as const;
export const valueLifecycles = [
  'proposed',
  'current',
  'superseded',
  'contradicted',
  'stale',
  'archived',
] as const;
export const evidenceTypes = [
  'verified_fact',
  'source_derived_fact',
  'user_entered_fact',
  'calculated',
  'ai_inference',
  'unknown',
] as const;
export const evidenceRelationshipTypes = [
  'supports',
  'contradicts',
  'verifies',
  'contextualizes',
] as const;
export const freshnessResults = ['fresh', 'expiring', 'stale', 'no_policy', 'unknown'] as const;

export type VariableDataType = (typeof variableDataTypes)[number];
export type DefinitionLifecycle = (typeof definitionLifecycles)[number];
export type ValueStatus = (typeof valueStatuses)[number];
export type ValueLifecycle = (typeof valueLifecycles)[number];
export type EvidenceType = (typeof evidenceTypes)[number];
export type EvidenceRelationshipType = (typeof evidenceRelationshipTypes)[number];
export type FreshnessResult = (typeof freshnessResults)[number];
export type SubjectType = 'organization' | 'contact';
export type JsonObject = Record<string, unknown>;

export type SubjectRef =
  | { subjectType: 'organization'; organizationId: string; contactId?: null }
  | { subjectType: 'contact'; organizationId?: null; contactId: string };

export type DefinitionValidationContext = {
  dataType: VariableDataType;
  allowedValues: unknown;
  rangeConstraints: unknown;
};

export type ValueValidationInput = DefinitionValidationContext & {
  typedValue: unknown;
  valueStatus: ValueStatus;
  evidenceType: EvidenceType;
};

export function subjectColumns(subject: SubjectRef): {
  subjectType: SubjectType;
  organizationId: string | null;
  contactId: string | null;
} {
  return subject.subjectType === 'organization'
    ? { subjectType: 'organization', organizationId: subject.organizationId, contactId: null }
    : { subjectType: 'contact', organizationId: null, contactId: subject.contactId };
}

export function validateTypedValue(input: ValueValidationInput): void {
  if (input.evidenceType === 'ai_inference' && input.valueStatus === 'known') {
    // AI inferences can be known proposed/current values, but they must retain ai_inference provenance.
  }
  if (input.valueStatus !== 'known') {
    validateStatusSentinel(input.typedValue, input.valueStatus);
    return;
  }

  switch (input.dataType) {
    case 'boolean':
      assertType(typeof input.typedValue === 'boolean', 'boolean value must be true or false');
      return;
    case 'integer':
      assertType(Number.isInteger(input.typedValue), 'integer value must be an integer');
      assertRange(input.typedValue as number, input.rangeConstraints);
      return;
    case 'decimal':
      assertType(isFiniteNumber(input.typedValue), 'decimal value must be numeric');
      assertRange(input.typedValue as number, input.rangeConstraints);
      return;
    case 'percentage':
      assertType(isFiniteNumber(input.typedValue), 'percentage value must be numeric');
      assertRange(input.typedValue as number, input.rangeConstraints);
      return;
    case 'currency':
      validateCurrency(input.typedValue);
      return;
    case 'string':
      assertType(typeof input.typedValue === 'string', 'string value must be a string');
      return;
    case 'enum':
      assertType(typeof input.typedValue === 'string', 'enum value must be a string');
      assertAllowed(input.typedValue, input.allowedValues);
      return;
    case 'date':
      assertType(isDateString(input.typedValue), 'date value must be YYYY-MM-DD');
      return;
    case 'datetime':
      assertType(isDateTime(input.typedValue), 'datetime value must be an ISO datetime or Date');
      return;
    case 'integer_range':
      validateNumericRange(input.typedValue, true);
      return;
    case 'decimal_range':
      validateNumericRange(input.typedValue, false);
      return;
    case 'currency_range':
      validateCurrencyRange(input.typedValue);
      return;
    case 'categorized_list':
      validateCategorizedList(input.typedValue);
      return;
    case 'controlled_multiselect':
      validateControlledMultiselect(input.typedValue, input.allowedValues);
      return;
    case 'ordinal_rubric':
      assertType(Number.isInteger(input.typedValue), 'ordinal rubric value must be an integer');
      assertRange(input.typedValue as number, input.rangeConstraints ?? { min: 0, max: 4 });
      return;
  }
}

export function normalizeTypedValue(input: ValueValidationInput): unknown {
  validateTypedValue(input);
  if (input.valueStatus !== 'known') return { status: input.valueStatus };
  return input.typedValue;
}

function validateStatusSentinel(typedValue: unknown, status: ValueStatus): void {
  if (status === 'unknown' || status === 'not_applicable' || status === 'withheld') {
    const expected = status;
    const actual =
      typedValue !== null && typeof typedValue === 'object'
        ? (typedValue as Record<string, unknown>)['status']
        : undefined;
    if (actual !== expected) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: `${status} values must use an explicit status sentinel`,
        details: { expected: { status: expected } },
      });
    }
  }
}

function validateCurrency(value: unknown): void {
  assertType(isRecord(value), 'currency value must be an object');
  assertType(Number.isInteger(value['amountMinor']), 'currency amountMinor must be an integer');
  assertType(isIsoCurrency(value['currency']), 'currency must be an ISO 4217 code');
}

function validateCurrencyRange(value: unknown): void {
  assertType(isRecord(value), 'currency range must be an object');
  assertType(
    Number.isInteger(value['minMinor']) || value['minMinor'] === null,
    'minMinor must be an integer or null',
  );
  assertType(
    Number.isInteger(value['maxMinor']) || value['maxMinor'] === null,
    'maxMinor must be an integer or null',
  );
  assertType(isIsoCurrency(value['currency']), 'currency range must include an ISO 4217 currency');
  if (
    typeof value['minMinor'] === 'number' &&
    typeof value['maxMinor'] === 'number' &&
    value['minMinor'] > value['maxMinor']
  ) {
    throwValidation('currency range minMinor must be <= maxMinor');
  }
}

function validateNumericRange(value: unknown, integer: boolean): void {
  assertType(isRecord(value), 'range value must be an object');
  const min = value['min'];
  const max = value['max'];
  const validNumber = integer ? Number.isInteger : isFiniteNumber;
  assertType(validNumber(min) || min === null, 'range min must be numeric or null');
  assertType(validNumber(max) || max === null, 'range max must be numeric or null');
  if (typeof min === 'number' && typeof max === 'number' && min > max) {
    throwValidation('range min must be <= max');
  }
}

function validateCategorizedList(value: unknown): void {
  assertType(Array.isArray(value), 'categorized_list value must be an array');
  for (const item of value) {
    assertType(isRecord(item), 'categorized_list items must be objects');
    assertType(
      typeof item['category'] === 'string' && item['category'] !== '',
      'category is required',
    );
  }
}

function validateControlledMultiselect(value: unknown, allowedValues: unknown): void {
  assertType(Array.isArray(value), 'controlled_multiselect value must be an array');
  const allowed = allowedSet(allowedValues);
  for (const item of value) {
    assertType(typeof item === 'string', 'controlled_multiselect options must be strings');
    if (allowed !== null && !allowed.has(item)) {
      throwValidation('controlled_multiselect option is not allowed', { option: item });
    }
  }
}

function assertAllowed(value: unknown, allowedValues: unknown): void {
  const allowed = allowedSet(allowedValues);
  if (allowed !== null && !allowed.has(value)) {
    throwValidation('enum value is not allowed', { value });
  }
}

function allowedSet(allowedValues: unknown): Set<unknown> | null {
  if (Array.isArray(allowedValues)) return new Set(allowedValues);
  if (isRecord(allowedValues) && Array.isArray(allowedValues['values'])) {
    return new Set(allowedValues['values']);
  }
  return null;
}

function assertRange(value: number, rangeConstraints: unknown): void {
  if (!isRecord(rangeConstraints)) return;
  const min = rangeConstraints['min'];
  const max = rangeConstraints['max'];
  if (typeof min === 'number' && value < min)
    throwValidation('value is below minimum', { value, min });
  if (typeof max === 'number' && value > max)
    throwValidation('value is above maximum', { value, max });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIsoCurrency(value: unknown): boolean {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}

function isDateString(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  );
}

function isDateTime(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function assertType(condition: boolean, message: string): asserts condition {
  if (!condition) throwValidation(message);
}

function throwValidation(message: string, details?: Record<string, unknown>): never {
  throw new AppError({ code: 'VALIDATION_FAILED', message, details });
}
