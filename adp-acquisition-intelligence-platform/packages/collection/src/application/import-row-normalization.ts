import type { FieldRegistry, FieldRegistryEntry } from '../domain/field-registry.js';
import {
  normalizeAddress,
  normalizeBoolean,
  normalizeContactRole,
  normalizeCountry,
  normalizeCurrency,
  normalizeDate,
  normalizeDomain,
  normalizeEmail,
  normalizeEnum,
  normalizeFirmType,
  normalizeNumber,
  normalizePercentage,
  normalizePhone,
  normalizeRange,
  normalizeState,
  normalizeUnicodeWhitespace,
  normalizeUrl,
} from '../domain/normalizers.js';

export type NormalizedMappedRow = {
  mapped: Record<string, string | null>;
  normalized: Record<string, unknown>;
  errors: string[];
};

export function applyMappingToRawRow(input: {
  raw: Record<string, string>;
  mapping: Record<string, string>;
  registry: FieldRegistry;
}): NormalizedMappedRow {
  const mapped: Record<string, string | null> = {};
  const normalized: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [sourceColumn, fieldKey] of Object.entries(input.mapping)) {
    const field: FieldRegistryEntry | undefined = input.registry.fields.find(
      (entry: FieldRegistryEntry) => entry.key === fieldKey,
    );
    if (field === undefined) {
      errors.push(`Unknown mapped field ${fieldKey}`);
      continue;
    }
    const rawValue = input.raw[sourceColumn] ?? '';
    mapped[field.key] = rawValue.trim() === '' ? null : rawValue;
    const normalizedValue = normalizeFieldValue(field, rawValue);
    normalized[field.key] = normalizedValue.normalized;
    normalized[`${field.key}.__original`] = normalizedValue.original;
    normalized[`${field.key}.__blank`] = rawValue.trim() === '';
    if (rawValue.trim() !== '' && normalizedValue.normalized === null) {
      errors.push(`Invalid ${field.label}`);
    }
  }

  for (const field of input.registry.fields) {
    if (field.requiredForCommit && !(field.key in mapped)) {
      errors.push(`Missing required field ${field.label}`);
      continue;
    }
    if (field.requiredForCommit && mapped[field.key] === null) {
      errors.push(`Blank required field ${field.label}`);
    }
  }

  return { mapped, normalized, errors };
}

export function normalizeFieldValue(field: FieldRegistryEntry, value: string) {
  switch (field.key) {
    case 'organization.display_name':
    case 'organization.legal_name':
      return normalizeUnicodeWhitespace(value);
    case 'organization.domain':
      return normalizeDomain(value);
    case 'organization.website_url':
      return normalizeUrl(value);
    case 'organization.firm_type':
      return normalizeFirmType(value);
    case 'location.address_line_1':
      return normalizeAddress(value);
    case 'location.region':
      return normalizeState(value);
    case 'location.country_code':
      return normalizeCountry(value);
    case 'location.phone':
    case 'contact.phone':
      return normalizePhone(value);
    case 'contact.email':
      return normalizeEmail(value);
    case 'contact.role':
      return normalizeContactRole(value);
    default:
      break;
  }

  switch (field.valueKind) {
    case 'boolean':
      return normalizeBoolean(value);
    case 'date':
      return normalizeDate(value);
    case 'number':
      return normalizeNumber(value);
    case 'percentage':
      return normalizePercentage(value);
    case 'currency':
      return normalizeCurrency(value);
    case 'range':
      return normalizeRange(value);
    case 'enum':
      return normalizeEnum(value, field.allowedValues);
    case 'email':
      return normalizeEmail(value);
    case 'phone':
      return normalizePhone(value);
    case 'url':
      return normalizeUrl(value);
    case 'domain':
      return normalizeDomain(value);
    case 'address':
      return normalizeAddress(value);
    case 'state':
      return normalizeState(value);
    case 'country':
      return normalizeCountry(value);
    case 'string':
      return normalizeUnicodeWhitespace(value);
  }
  return normalizeUnicodeWhitespace(value);
}
