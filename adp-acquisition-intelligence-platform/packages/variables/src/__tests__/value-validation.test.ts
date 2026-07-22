import { describe, expect, it } from 'vitest';

import { normalizeTypedValue, validateTypedValue } from '../domain/variables.js';

describe('typed value semantic validation', () => {
  it('keeps unknown distinct from zero and false', () => {
    expect(() =>
      validateTypedValue({
        dataType: 'integer',
        allowedValues: null,
        rangeConstraints: { min: 0 },
        typedValue: 0,
        valueStatus: 'known',
        evidenceType: 'verified_fact',
      }),
    ).not.toThrow();
    expect(() =>
      validateTypedValue({
        dataType: 'boolean',
        allowedValues: null,
        rangeConstraints: null,
        typedValue: false,
        valueStatus: 'known',
        evidenceType: 'verified_fact',
      }),
    ).not.toThrow();
    expect(() =>
      validateTypedValue({
        dataType: 'integer',
        allowedValues: null,
        rangeConstraints: null,
        typedValue: 0,
        valueStatus: 'unknown',
        evidenceType: 'unknown',
      }),
    ).toThrow(/explicit status sentinel/);
  });

  it('keeps not applicable distinct from unknown', () => {
    expect(
      normalizeTypedValue({
        dataType: 'string',
        allowedValues: null,
        rangeConstraints: null,
        typedValue: { status: 'not_applicable' },
        valueStatus: 'not_applicable',
        evidenceType: 'user_entered_fact',
      }),
    ).toEqual({ status: 'not_applicable' });
    expect(() =>
      validateTypedValue({
        dataType: 'string',
        allowedValues: null,
        rangeConstraints: null,
        typedValue: { status: 'unknown' },
        valueStatus: 'not_applicable',
        evidenceType: 'user_entered_fact',
      }),
    ).toThrow(/not_applicable/);
  });

  it('treats empty string as a known string value, not unknown', () => {
    expect(() =>
      validateTypedValue({
        dataType: 'string',
        allowedValues: null,
        rangeConstraints: null,
        typedValue: '',
        valueStatus: 'known',
        evidenceType: 'source_derived_fact',
      }),
    ).not.toThrow();
  });

  it('validates all Prompt 3 data shapes', () => {
    const fixtures = [
      ['percentage', 42.5, null, { min: 0, max: 100 }],
      ['currency', { amountMinor: 12345, currency: 'USD' }, null, null],
      ['enum', 'CPA', ['CPA', 'CAS'], null],
      ['date', '2026-07-22', null, null],
      ['datetime', '2026-07-22T12:00:00.000Z', null, null],
      ['integer_range', { min: 1, max: 10 }, null, null],
      ['decimal_range', { min: 1.25, max: 10.5 }, null, null],
      ['currency_range', { minMinor: 100, maxMinor: 500, currency: 'USD' }, null, null],
      ['categorized_list', [{ category: 'CAS', percentage: 60 }], null, null],
      ['controlled_multiselect', ['payroll', 'hr'], ['payroll', 'hr'], null],
      ['ordinal_rubric', 4, null, { min: 0, max: 4 }],
    ] as const;

    for (const [dataType, typedValue, allowedValues, rangeConstraints] of fixtures) {
      expect(() =>
        validateTypedValue({
          dataType,
          allowedValues,
          rangeConstraints,
          typedValue,
          valueStatus: 'known',
          evidenceType: 'source_derived_fact',
        }),
      ).not.toThrow();
    }
  });
});
