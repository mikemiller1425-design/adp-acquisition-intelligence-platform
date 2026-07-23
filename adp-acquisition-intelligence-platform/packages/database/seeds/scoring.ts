import { readFile } from 'node:fs/promises';

import { eq, sql } from 'drizzle-orm';
import YAML from 'yaml';

import {
  completenessDefinitions,
  completenessDefinitionVersions,
  scoreComponents,
  scoreDefinitions,
  scoreDefinitionVersions,
  variableDefinitions,
  type RepositoryExecutor,
} from '../src/index.js';

export interface ScoringSeedSummary {
  scoreDefinitions: number;
  completenessDefinitions: number;
}

const scoreConfigPath = new URL('../../../config/scoring/draft-scores.v1.yaml', import.meta.url);
const completenessConfigPath = new URL(
  '../../../config/completeness/draft-completeness.v1.yaml',
  import.meta.url,
);
const PHASE_1_BASELINE_APPROVAL_METADATA = {
  approved_at: '2026-07-22T00:00:00.000Z',
  approved_by:
    'repository owner (mikemiller1425-design) via Prompt 6 unblock instruction 2026-07-22',
  approver: 'repository owner (mikemiller1425-design) via Prompt 6 unblock instruction 2026-07-22',
  approval_scope: 'Phase 1 baseline approval of the draft mappings/weights already published',
};

export async function seedScoringDrafts(db: RepositoryExecutor): Promise<ScoringSeedSummary> {
  const [scoreDrafts, completenessDrafts] = await Promise.all([
    loadYamlArray(scoreConfigPath, 'scores'),
    loadYamlArray(completenessConfigPath, 'completeness_definitions'),
  ]);

  for (const draft of scoreDrafts) {
    await seedScoreDraft(db, draft);
  }
  for (const draft of completenessDrafts) {
    await seedCompletenessDraft(db, draft);
  }

  return {
    scoreDefinitions: scoreDrafts.length,
    completenessDefinitions: completenessDrafts.length,
  };
}

async function seedScoreDraft(
  db: RepositoryExecutor,
  draft: Record<string, unknown>,
): Promise<void> {
  const status = readDefinitionStatus(draft['status']);
  const approvalStatus = readApprovalStatus(draft['approval_status']);
  const approvalMetadata =
    approvalStatus === 'approved' ? PHASE_1_BASELINE_APPROVAL_METADATA : null;
  const publishedAt =
    status === 'active' ? new Date(PHASE_1_BASELINE_APPROVAL_METADATA.approved_at) : null;
  const definition = first(
    await db
      .insert(scoreDefinitions)
      .values({
        key: readString(draft, 'key'),
        displayName: readString(draft, 'display_name'),
        description: readString(draft, 'description'),
        family: readString(draft, 'family'),
        subjectType: readSubjectType(draft['subject_type']),
        status,
        approvalStatus,
        approvalMetadata,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: scoreDefinitions.key,
        set: {
          displayName: readString(draft, 'display_name'),
          description: readString(draft, 'description'),
          family: readString(draft, 'family'),
          subjectType: readSubjectType(draft['subject_type']),
          status,
          approvalStatus,
          approvalMetadata,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: scoreDefinitions.id }),
  );
  const range = readRange(draft['range']);
  const version = first(
    await db
      .insert(scoreDefinitionVersions)
      .values({
        definitionId: definition.id,
        version: readString(draft, 'version'),
        rangeMin: String(range[0]),
        rangeMax: String(range[1]),
        minimumCompleteness: String(readNumber(draft, 'minimum_completeness')),
        tiers: readRecord(draft['tiers']),
        confidencePolicy: readRecord(draft['confidence_policy']),
        recommendationPolicy: readRecord(draft['recommendation_policy']),
        allowOptionalWeightRenormalization: true,
        status,
        approvalStatus,
        approvalMetadata,
        publishedAt,
      })
      .onConflictDoUpdate({
        target: [scoreDefinitionVersions.definitionId, scoreDefinitionVersions.version],
        set: {
          rangeMin: String(range[0]),
          rangeMax: String(range[1]),
          minimumCompleteness: String(readNumber(draft, 'minimum_completeness')),
          tiers: readRecord(draft['tiers']),
          confidencePolicy: readRecord(draft['confidence_policy']),
          recommendationPolicy: readRecord(draft['recommendation_policy']),
          allowOptionalWeightRenormalization: true,
          status,
          approvalStatus,
          approvalMetadata,
          publishedAt,
        },
      })
      .returning({ id: scoreDefinitionVersions.id }),
  );

  if (status === 'active') {
    await db
      .update(scoreDefinitions)
      .set({ currentVersionId: version.id, updatedAt: sql`now()` })
      .where(eq(scoreDefinitions.id, definition.id));
  }

  await db.delete(scoreComponents).where(eq(scoreComponents.scoreDefinitionVersionId, version.id));
  for (const [index, componentValue] of readArray(draft, 'components').entries()) {
    const component = readRecord(componentValue);
    const variable = await findVariable(db, readString(component, 'variable_key'));
    await db.insert(scoreComponents).values({
      scoreDefinitionVersionId: version.id,
      key: readString(component, 'key'),
      variableDefinitionId: variable?.id ?? null,
      variableDefinitionVersionId: variable?.currentVersionId ?? null,
      weight: String(readNumber(component, 'weight')),
      transform: readString(component, 'transform'),
      transformConfig: isRecord(component['transform_config']) ? component['transform_config'] : {},
      required: component['required'] === true,
      missingImpact: component['missing_impact'] === 'high' ? 'high' : 'normal',
      displayOrder: index,
    });
  }
}

async function seedCompletenessDraft(
  db: RepositoryExecutor,
  draft: Record<string, unknown>,
): Promise<void> {
  const status = readDefinitionStatus(draft['status']);
  const approvalStatus = readApprovalStatus(draft['approval_status']);
  const approvalMetadata =
    approvalStatus === 'approved' ? PHASE_1_BASELINE_APPROVAL_METADATA : null;
  const publishedAt =
    status === 'active' ? new Date(PHASE_1_BASELINE_APPROVAL_METADATA.approved_at) : null;
  const definition = first(
    await db
      .insert(completenessDefinitions)
      .values({
        key: readString(draft, 'key'),
        displayName: readString(draft, 'display_name'),
        description: readString(draft, 'description'),
        purpose: readString(draft, 'purpose'),
        subjectType: readSubjectType(draft['subject_type']),
        status,
        approvalStatus,
        approvalMetadata,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: completenessDefinitions.key,
        set: {
          displayName: readString(draft, 'display_name'),
          description: readString(draft, 'description'),
          purpose: readString(draft, 'purpose'),
          subjectType: readSubjectType(draft['subject_type']),
          status,
          approvalStatus,
          approvalMetadata,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: completenessDefinitions.id }),
  );

  const version = first(
    await db
      .insert(completenessDefinitionVersions)
      .values({
        definitionId: definition.id,
        version: readString(draft, 'version'),
        definition: {
          variables: readArray(draft, 'variables'),
          minimumCompleteness: readNumber(draft, 'minimum_completeness'),
        },
        status,
        approvalStatus,
        approvalMetadata,
        publishedAt,
      })
      .onConflictDoUpdate({
        target: [
          completenessDefinitionVersions.definitionId,
          completenessDefinitionVersions.version,
        ],
        set: {
          definition: {
            variables: readArray(draft, 'variables'),
            minimumCompleteness: readNumber(draft, 'minimum_completeness'),
          },
          status,
          approvalStatus,
          approvalMetadata,
          publishedAt,
        },
      })
      .returning({ id: completenessDefinitionVersions.id }),
  );

  if (status === 'active') {
    await db
      .update(completenessDefinitions)
      .set({ currentVersionId: version.id, updatedAt: sql`now()` })
      .where(eq(completenessDefinitions.id, definition.id));
  }
}

async function loadYamlArray(url: URL, key: string): Promise<Array<Record<string, unknown>>> {
  const parsed = YAML.parse(await readFile(url, 'utf8')) as unknown;
  const value = readRecord(parsed)[key];
  if (!Array.isArray(value)) throw new Error(`Expected ${key} in scoring seed config.`);
  return value.map(readRecord);
}

async function findVariable(db: RepositoryExecutor, key: string) {
  return (
    await db.select().from(variableDefinitions).where(eq(variableDefinitions.key, key)).limit(1)
  )[0];
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new Error(`Expected string ${key}`);
  return value;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number') throw new Error(`Expected number ${key}`);
  return value;
}

function readArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`Expected array ${key}`);
  return value;
}

function readRange(value: unknown): readonly [number, number] {
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    return [value[0], value[1]];
  }
  throw new Error('Expected score range.');
}

function readSubjectType(value: unknown): 'organization' | 'contact' {
  if (value === 'organization' || value === 'contact') return value;
  throw new Error('Expected subject_type.');
}

function readDefinitionStatus(value: unknown): 'draft' | 'active' | 'retired' {
  if (value === 'draft' || value === 'active' || value === 'retired') return value;
  throw new Error('Expected status.');
}

function readApprovalStatus(
  value: unknown,
): 'draft_unapproved' | 'pending' | 'approved' | 'rejected' {
  if (
    value === 'draft_unapproved' ||
    value === 'pending' ||
    value === 'approved' ||
    value === 'rejected'
  ) {
    return value;
  }
  throw new Error('Expected approval_status.');
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Expected object.');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected row.');
  return row;
}
