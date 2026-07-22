import { readFile } from 'node:fs/promises';

import YAML from 'yaml';

import type {
  ApprovalStatus,
  CompletenessDefinitionVersion,
  DefinitionStatus,
  ScoreDefinitionVersion,
} from '../domain/types.js';

export async function loadScoreDrafts(path: string): Promise<ScoreDefinitionVersion[]> {
  const parsed = YAML.parse(await readFile(path, 'utf8')) as unknown;
  const scores = isRecord(parsed) && Array.isArray(parsed['scores']) ? parsed['scores'] : [];
  return scores.map(parseScoreDraft);
}

export async function loadCompletenessDrafts(
  path: string,
): Promise<CompletenessDefinitionVersion[]> {
  const parsed = YAML.parse(await readFile(path, 'utf8')) as unknown;
  const definitions =
    isRecord(parsed) && Array.isArray(parsed['completeness_definitions'])
      ? parsed['completeness_definitions']
      : [];
  return definitions.map(parseCompletenessDraft);
}

export function parseScoreDraft(value: unknown): ScoreDefinitionVersion {
  const record = requireRecord(value);
  return {
    key: readString(record, 'key'),
    displayName: readString(record, 'display_name'),
    description: readString(record, 'description'),
    family: readString(record, 'family'),
    subjectType: readSubjectType(record['subject_type']),
    version: readString(record, 'version'),
    status: readDefinitionStatus(record['status']),
    approvalStatus: readApprovalStatus(record['approval_status']),
    range: readRange(record['range']),
    minimumCompleteness: readNumber(record, 'minimum_completeness'),
    tiers: readNumberRecord(record['tiers']),
    confidencePolicy: requireRecord(record['confidence_policy']),
    recommendationPolicy: requireRecord(record['recommendation_policy']),
    allowOptionalWeightRenormalization: true,
    components: readArray(record, 'components').map((component, index) => {
      const componentRecord = requireRecord(component);
      return {
        key: readString(componentRecord, 'key'),
        variableKey: readString(componentRecord, 'variable_key'),
        weight: readNumber(componentRecord, 'weight'),
        transform: readString(
          componentRecord,
          'transform',
        ) as ScoreDefinitionVersion['components'][number]['transform'],
        transformConfig: isRecord(componentRecord['transform_config'])
          ? componentRecord['transform_config']
          : {},
        required: componentRecord['required'] === true,
        missingImpact: componentRecord['missing_impact'] === 'high' ? 'high' : 'normal',
        displayOrder: index,
      };
    }),
  };
}

export function parseCompletenessDraft(value: unknown): CompletenessDefinitionVersion {
  const record = requireRecord(value);
  return {
    key: readString(record, 'key'),
    displayName: readString(record, 'display_name'),
    description: readString(record, 'description'),
    purpose: readString(record, 'purpose'),
    subjectType: readSubjectType(record['subject_type']),
    version: readString(record, 'version'),
    status: readDefinitionStatus(record['status']),
    approvalStatus: readApprovalStatus(record['approval_status']),
    minimumCompleteness: readNumber(record, 'minimum_completeness'),
    variables: readArray(record, 'variables').map((variable) => {
      const variableRecord = requireRecord(variable);
      return {
        key: readString(variableRecord, 'key'),
        weight: readNumber(variableRecord, 'weight'),
        required: variableRecord['required'] === true,
      };
    }),
  };
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Expected non-empty string at ${key}`);
  }
  return value;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected number at ${key}`);
  }
  return value;
}

function readArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`Expected array at ${key}`);
  return value;
}

function readRange(value: unknown): readonly [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number'
  ) {
    throw new Error('Expected numeric range [min, max]');
  }
  return [value[0], value[1]];
}

function readNumberRecord(value: unknown): Record<string, number> {
  const record = requireRecord(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => {
      if (typeof entry !== 'number') throw new Error(`Expected number tier ${key}`);
      return [key, entry];
    }),
  );
}

function readSubjectType(value: unknown): 'organization' | 'contact' {
  if (value === 'organization' || value === 'contact') return value;
  throw new Error('Expected organization or contact subject type');
}

function readDefinitionStatus(value: unknown): DefinitionStatus {
  if (value === 'draft' || value === 'active' || value === 'retired') return value;
  throw new Error('Expected definition status');
}

function readApprovalStatus(value: unknown): ApprovalStatus {
  if (
    value === 'draft_unapproved' ||
    value === 'pending' ||
    value === 'approved' ||
    value === 'rejected'
  ) {
    return value;
  }
  throw new Error('Expected approval status');
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Expected object');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
