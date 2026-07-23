import {
  completenessDefinitions,
  completenessDefinitionVersions,
  scoreComponents,
  scoreDefinitions,
  scoreDefinitionVersions,
  scoreFactors,
  scoreInputSnapshots,
  scoreRecalculationJobs,
  scoreResults,
  variableDefinitions,
  variableValues,
  type RepositoryExecutor,
} from '@adp/database';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type {
  CompletenessDefinitionRepository,
  RecalculationJobRepository,
  ScoreDefinitionRepository,
  ScoreInputRepository,
  ScoreResultRepository,
} from '../domain/ports.js';
import type {
  CompletenessDefinitionVersion,
  ScoreComponentDefinition,
  ScoreDefinitionVersion,
  ScoringInput,
  SubjectRef,
} from '../domain/types.js';

type Db = RepositoryExecutor;

export class PostgresScoreDefinitionRepository implements ScoreDefinitionRepository {
  constructor(private readonly db: Db) {}

  async upsertDraft(definition: ScoreDefinitionVersion): Promise<ScoreDefinitionVersion> {
    return this.db.transaction(async (tx) => {
      const definitionRow = first(
        await tx
          .insert(scoreDefinitions)
          .values({
            key: definition.key,
            displayName: definition.displayName,
            description: definition.description,
            family: definition.family,
            subjectType: definition.subjectType,
            status: 'draft',
            approvalStatus: 'draft_unapproved',
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: scoreDefinitions.key,
            set: {
              displayName: definition.displayName,
              description: definition.description,
              family: definition.family,
              subjectType: definition.subjectType,
              status: 'draft',
              approvalStatus: 'draft_unapproved',
              updatedAt: sql`now()`,
            },
          })
          .returning(),
      );
      const versionRow = first(
        await tx
          .insert(scoreDefinitionVersions)
          .values({
            definitionId: definitionRow.id,
            version: definition.version,
            rangeMin: String(definition.range[0]),
            rangeMax: String(definition.range[1]),
            minimumCompleteness: String(definition.minimumCompleteness),
            tiers: definition.tiers,
            confidencePolicy: definition.confidencePolicy,
            recommendationPolicy: definition.recommendationPolicy,
            allowOptionalWeightRenormalization: definition.allowOptionalWeightRenormalization,
            status: 'draft',
            approvalStatus: 'draft_unapproved',
          })
          .onConflictDoUpdate({
            target: [scoreDefinitionVersions.definitionId, scoreDefinitionVersions.version],
            set: {
              rangeMin: String(definition.range[0]),
              rangeMax: String(definition.range[1]),
              minimumCompleteness: String(definition.minimumCompleteness),
              tiers: definition.tiers,
              confidencePolicy: definition.confidencePolicy,
              recommendationPolicy: definition.recommendationPolicy,
              allowOptionalWeightRenormalization: definition.allowOptionalWeightRenormalization,
              status: 'draft',
              approvalStatus: 'draft_unapproved',
            },
          })
          .returning(),
      );
      await tx
        .delete(scoreComponents)
        .where(eq(scoreComponents.scoreDefinitionVersionId, versionRow.id));
      for (const [index, component] of definition.components.entries()) {
        const variable = component.variableKey
          ? await findVariableDefinition(tx, component.variableKey)
          : null;
        await tx.insert(scoreComponents).values({
          scoreDefinitionVersionId: versionRow.id,
          key: component.key,
          variableDefinitionId: variable?.id ?? null,
          variableDefinitionVersionId: variable?.currentVersionId ?? null,
          weight: String(component.weight),
          transform: component.transform,
          transformConfig: component.transformConfig ?? {},
          required: component.required === true,
          missingImpact: component.missingImpact ?? 'normal',
          displayOrder: component.displayOrder ?? index,
        });
      }
      return {
        ...definition,
        id: versionRow.id,
        definitionId: definitionRow.id,
        status: 'draft',
        approvalStatus: 'draft_unapproved',
      };
    });
  }

  async findByKey(key: string): Promise<ScoreDefinitionVersion | null> {
    return this.findByKeyAndStatus(key);
  }

  async findActiveByKey(key: string): Promise<ScoreDefinitionVersion | null> {
    return this.findByKeyAndStatus(key, 'active');
  }

  async publish(
    input: Parameters<ScoreDefinitionRepository['publish']>[0],
  ): Promise<ScoreDefinitionVersion> {
    return this.db.transaction(async (tx) => {
      const current = await findScoreDefinitionVersion(tx, input.key, input.version);
      if (current === null)
        throw new Error(`Score definition version not found: ${input.key}@${input.version}`);
      await tx
        .update(scoreDefinitionVersions)
        .set({ status: 'retired' })
        .where(
          and(
            eq(scoreDefinitionVersions.definitionId, current.definitionId as string),
            eq(scoreDefinitionVersions.status, 'active'),
          ),
        );
      await tx
        .update(scoreDefinitionVersions)
        .set({
          status: 'active',
          approvalStatus: input.approvalStatus,
          approvalMetadata: input.approvalMetadata,
          publishedAt: new Date(),
          publishedBy: input.actorUserId,
        })
        .where(eq(scoreDefinitionVersions.id, current.id as string));
      await tx
        .update(scoreDefinitions)
        .set({
          status: 'active',
          approvalStatus: input.approvalStatus,
          approvalMetadata: input.approvalMetadata,
          currentVersionId: current.id,
          updatedAt: sql`now()`,
        })
        .where(eq(scoreDefinitions.id, current.definitionId as string));
      const published = await this.findByKeyAndStatus(input.key, 'active', tx);
      if (published === null) throw new Error(`Published score definition not found: ${input.key}`);
      return published;
    });
  }

  private async findByKeyAndStatus(
    key: string,
    status?: 'active',
    db: Db = this.db,
  ): Promise<ScoreDefinitionVersion | null> {
    const rows = await db
      .select({ definition: scoreDefinitions, version: scoreDefinitionVersions })
      .from(scoreDefinitions)
      .innerJoin(
        scoreDefinitionVersions,
        eq(scoreDefinitionVersions.definitionId, scoreDefinitions.id),
      )
      .where(
        status === undefined
          ? eq(scoreDefinitions.key, key)
          : and(eq(scoreDefinitions.key, key), eq(scoreDefinitionVersions.status, status)),
      )
      .orderBy(desc(scoreDefinitionVersions.createdAt))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    const components = await db
      .select()
      .from(scoreComponents)
      .where(eq(scoreComponents.scoreDefinitionVersionId, row.version.id))
      .orderBy(scoreComponents.displayOrder);
    return mapScoreDefinition(row.definition, row.version, components);
  }
}

export class PostgresCompletenessDefinitionRepository implements CompletenessDefinitionRepository {
  constructor(private readonly db: Db) {}

  async upsertDraft(
    definition: CompletenessDefinitionVersion,
  ): Promise<CompletenessDefinitionVersion> {
    return this.db.transaction(async (tx) => {
      const definitionRow = first(
        await tx
          .insert(completenessDefinitions)
          .values({
            key: definition.key,
            displayName: definition.displayName,
            description: definition.description,
            purpose: definition.purpose,
            subjectType: definition.subjectType,
            status: 'draft',
            approvalStatus: 'draft_unapproved',
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: completenessDefinitions.key,
            set: {
              displayName: definition.displayName,
              description: definition.description,
              purpose: definition.purpose,
              subjectType: definition.subjectType,
              status: 'draft',
              approvalStatus: 'draft_unapproved',
              updatedAt: sql`now()`,
            },
          })
          .returning(),
      );
      const versionRow = first(
        await tx
          .insert(completenessDefinitionVersions)
          .values({
            definitionId: definitionRow.id,
            version: definition.version,
            definition: {
              variables: definition.variables,
              minimumCompleteness: definition.minimumCompleteness,
            },
            status: 'draft',
            approvalStatus: 'draft_unapproved',
          })
          .onConflictDoUpdate({
            target: [
              completenessDefinitionVersions.definitionId,
              completenessDefinitionVersions.version,
            ],
            set: {
              definition: {
                variables: definition.variables,
                minimumCompleteness: definition.minimumCompleteness,
              },
              status: 'draft',
              approvalStatus: 'draft_unapproved',
            },
          })
          .returning({ id: completenessDefinitionVersions.id }),
      );
      return {
        ...definition,
        id: versionRow.id,
        definitionId: definitionRow.id,
        status: 'draft',
        approvalStatus: 'draft_unapproved',
      };
    });
  }

  async findByKey(key: string): Promise<CompletenessDefinitionVersion | null> {
    const rows = await this.db
      .select({ definition: completenessDefinitions, version: completenessDefinitionVersions })
      .from(completenessDefinitions)
      .innerJoin(
        completenessDefinitionVersions,
        eq(completenessDefinitionVersions.definitionId, completenessDefinitions.id),
      )
      .where(eq(completenessDefinitions.key, key))
      .orderBy(desc(completenessDefinitionVersions.createdAt))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    return mapCompletenessDefinition(row.definition, row.version);
  }
}

export class PostgresScoreInputRepository implements ScoreInputRepository {
  constructor(private readonly db: Db) {}

  async listInputs(subject: SubjectRef, score: ScoreDefinitionVersion): Promise<ScoringInput[]> {
    const variableKeys = score.components
      .map((component) => component.variableKey ?? component.key)
      .filter((key): key is string => typeof key === 'string');
    if (variableKeys.length === 0) return [];
    const definitions = await this.db
      .select()
      .from(variableDefinitions)
      .where(inArray(variableDefinitions.key, variableKeys));
    if (definitions.length === 0) return [];
    const values = await this.db
      .select({ value: variableValues, definition: variableDefinitions })
      .from(variableValues)
      .innerJoin(
        variableDefinitions,
        eq(variableDefinitions.id, variableValues.variableDefinitionId),
      )
      .where(
        and(
          subjectWhere(subject),
          inArray(variableDefinitions.key, variableKeys),
          eq(variableValues.lifecycle, 'current'),
        ),
      );
    return score.components.flatMap((component) => {
      const key = component.variableKey ?? component.key;
      const row = values.find((value) => value.definition.key === key);
      if (row === undefined) return [];
      return [
        {
          componentKey: component.key,
          variableKey: key,
          value: unwrapValue(row.value.typedValue),
          normalizedValue: unwrapValue(row.value.normalizedValue ?? row.value.typedValue),
          valueStatus: row.value.valueStatus,
          valueId: row.value.id,
          evidenceIds: [],
          confidenceStatus: row.value.confidenceStatus,
          freshnessResult: row.value.freshnessResult,
          observedAt: row.value.observedAt,
        },
      ];
    });
  }
}

export class PostgresScoreResultRepository implements ScoreResultRepository {
  constructor(private readonly db: Db) {}

  async latest(
    subject: SubjectRef,
    scoreKey: string,
  ): Promise<{ id: string; score: number | null } | null> {
    const rows = await this.db
      .select({ result: scoreResults })
      .from(scoreResults)
      .innerJoin(scoreDefinitions, eq(scoreDefinitions.id, scoreResults.scoreDefinitionId))
      .where(and(scoreResultSubjectWhere(subject), eq(scoreDefinitions.key, scoreKey)))
      .orderBy(desc(scoreResults.calculatedAt))
      .limit(1);
    const row = rows[0]?.result;
    return row === undefined ? null : { id: row.id, score: numeric(row.score) };
  }

  async insert(
    input: Parameters<ScoreResultRepository['insert']>[0],
  ): Promise<{ id: string; inputSnapshotId: string }> {
    return this.db.transaction(async (tx) => {
      const snapshot = first(
        await tx
          .insert(scoreInputSnapshots)
          .values({
            scoreDefinitionId: input.definition.definitionId as string,
            scoreDefinitionVersionId: input.definition.id as string,
            ...subjectColumns(input.subject),
            normalizedInputs: input.normalizedInputs,
            valueRefs: input.valueRefs,
            evidenceRefs: input.evidenceRefs,
            definitionRefs: input.definition.components.map((component) => ({
              componentKey: component.key,
              variableDefinitionId: component.variableDefinitionId ?? null,
              variableDefinitionVersionId: component.variableDefinitionVersionId ?? null,
            })),
            definitionDigest: input.definitionDigest,
          })
          .returning({ id: scoreInputSnapshots.id }),
      );
      const result = first(
        await tx
          .insert(scoreResults)
          .values({
            scoreDefinitionId: input.definition.definitionId as string,
            scoreDefinitionVersionId: input.definition.id as string,
            ...subjectColumns(input.subject),
            inputSnapshotId: snapshot.id,
            status: input.result.status,
            score: numericInput(input.result.score),
            tier: input.result.tier,
            confidence: numericInput(input.result.confidence),
            completeness: numericInput(input.result.completeness),
            explanation: input.result.explanation,
            recommendation: input.result.recommendation,
            calculationDurationMs: input.durationMs,
            previousScoreResultId: input.previousScoreResultId ?? null,
          })
          .returning({ id: scoreResults.id }),
      );
      if (input.result.factors.length > 0) {
        await tx.insert(scoreFactors).values(
          input.result.factors.map((factor) => ({
            scoreResultId: result.id,
            componentKey: factor.componentKey,
            variableValueId: factor.variableValueId,
            rawValue: factor.rawValue,
            normalizedValue: factor.normalizedValue,
            transformedScore: numericInput(factor.transformedScore),
            weight: String(factor.weight),
            contribution: numericInput(factor.contribution),
            status: factor.status,
            explanation: factor.explanation,
          })),
        );
      }
      return { id: result.id, inputSnapshotId: snapshot.id };
    });
  }

  async insertRecommendationOverride(
    input: Parameters<ScoreResultRepository['insertRecommendationOverride']>[0],
  ): Promise<{ id: string }> {
    const computed = first(
      await this.db
        .select()
        .from(scoreResults)
        .where(eq(scoreResults.id, input.computedResultId))
        .limit(1),
    );
    const inserted = first(
      await this.db
        .insert(scoreResults)
        .values({
          scoreDefinitionId: computed.scoreDefinitionId,
          scoreDefinitionVersionId: computed.scoreDefinitionVersionId,
          ...subjectColumns(input.subject),
          inputSnapshotId: computed.inputSnapshotId,
          status: computed.status,
          score: computed.score,
          tier: computed.tier,
          confidence: computed.confidence,
          completeness: computed.completeness,
          explanation: computed.explanation,
          recommendation: computed.recommendation,
          previousScoreResultId: computed.id,
          overrideRecommendation: input.recommendation,
          overrideActorUserId: input.actorUserId,
          overrideReasonCode: input.reasonCode,
          overrideReasonNote: input.reasonNote ?? null,
          overrideAt: new Date(),
        })
        .returning({ id: scoreResults.id }),
    );
    return { id: inserted.id };
  }
}

export class PostgresRecalculationJobRepository implements RecalculationJobRepository {
  constructor(private readonly db: Db) {}

  async createPending(input: Parameters<RecalculationJobRepository['createPending']>[0]) {
    const existing = await this.db
      .select({ id: scoreRecalculationJobs.id })
      .from(scoreRecalculationJobs)
      .where(eq(scoreRecalculationJobs.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing[0] !== undefined) return { id: existing[0].id, created: false };
    const inserted = first(
      await this.db
        .insert(scoreRecalculationJobs)
        .values({
          idempotencyKey: input.idempotencyKey,
          eventType: input.eventType,
          ...subjectColumns(input.subject),
          scoreKey: input.scoreKey ?? null,
        })
        .returning({ id: scoreRecalculationJobs.id }),
    );
    return { id: inserted.id, created: true };
  }

  async markRunning(id: string): Promise<void> {
    await this.db
      .update(scoreRecalculationJobs)
      .set({ status: 'running', startedAt: new Date() })
      .where(eq(scoreRecalculationJobs.id, id));
  }

  async markCompleted(
    id: string,
    resultId: string | null,
    previousResultId: string | null,
  ): Promise<void> {
    await this.db
      .update(scoreRecalculationJobs)
      .set({ status: 'completed', completedAt: new Date(), resultId, previousResultId })
      .where(eq(scoreRecalculationJobs.id, id));
  }

  async markFailed(id: string, message: string): Promise<void> {
    await this.db
      .update(scoreRecalculationJobs)
      .set({ status: 'failed', completedAt: new Date(), errorMessage: message })
      .where(eq(scoreRecalculationJobs.id, id));
  }
}

function mapScoreDefinition(
  definition: typeof scoreDefinitions.$inferSelect,
  version: typeof scoreDefinitionVersions.$inferSelect,
  components: Array<typeof scoreComponents.$inferSelect>,
): ScoreDefinitionVersion {
  return {
    id: version.id,
    definitionId: definition.id,
    key: definition.key,
    displayName: definition.displayName,
    description: definition.description,
    family: definition.family,
    subjectType: definition.subjectType as 'organization' | 'contact',
    version: version.version,
    status: version.status,
    approvalStatus: version.approvalStatus,
    range: [numeric(version.rangeMin) ?? 0, numeric(version.rangeMax) ?? 100],
    minimumCompleteness: numeric(version.minimumCompleteness) ?? 0.55,
    tiers: object(version.tiers) as Record<string, number>,
    confidencePolicy: object(version.confidencePolicy),
    recommendationPolicy: object(version.recommendationPolicy),
    allowOptionalWeightRenormalization: version.allowOptionalWeightRenormalization,
    components: components.map(mapComponent),
  };
}

function mapComponent(row: typeof scoreComponents.$inferSelect): ScoreComponentDefinition {
  return {
    key: row.key,
    variableDefinitionId: row.variableDefinitionId,
    variableDefinitionVersionId: row.variableDefinitionVersionId,
    weight: numeric(row.weight) ?? 0,
    transform: row.transform as ScoreComponentDefinition['transform'],
    transformConfig: object(row.transformConfig),
    required: row.required,
    missingImpact: row.missingImpact === 'high' ? 'high' : 'normal',
    displayOrder: row.displayOrder,
  };
}

function mapCompletenessDefinition(
  definition: typeof completenessDefinitions.$inferSelect,
  version: typeof completenessDefinitionVersions.$inferSelect,
): CompletenessDefinitionVersion {
  const payload = object(version.definition);
  return {
    id: version.id,
    definitionId: definition.id,
    key: definition.key,
    displayName: definition.displayName,
    description: definition.description,
    purpose: definition.purpose,
    subjectType: definition.subjectType as 'organization' | 'contact',
    version: version.version,
    status: version.status,
    approvalStatus: version.approvalStatus,
    minimumCompleteness:
      numeric(payload['minimumCompleteness'] as string | number | null | undefined) ?? 0.55,
    variables: Array.isArray(payload['variables'])
      ? (payload['variables'] as CompletenessDefinitionVersion['variables'])
      : [],
  };
}

async function findVariableDefinition(db: Db, key: string) {
  return (
    await db.select().from(variableDefinitions).where(eq(variableDefinitions.key, key)).limit(1)
  )[0];
}

async function findScoreDefinitionVersion(db: Db, key: string, version: string) {
  const rows = await db
    .select({ definition: scoreDefinitions, version: scoreDefinitionVersions })
    .from(scoreDefinitions)
    .innerJoin(
      scoreDefinitionVersions,
      eq(scoreDefinitionVersions.definitionId, scoreDefinitions.id),
    )
    .where(and(eq(scoreDefinitions.key, key), eq(scoreDefinitionVersions.version, version)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : { ...row.version, definitionId: row.definition.id };
}

function subjectWhere(subject: SubjectRef) {
  return subject.subjectType === 'organization'
    ? and(
        eq(variableValues.subjectType, 'organization'),
        eq(variableValues.organizationId, subject.organizationId),
      )
    : and(
        eq(variableValues.subjectType, 'contact'),
        eq(variableValues.contactId, subject.contactId),
      );
}

function scoreResultSubjectWhere(subject: SubjectRef) {
  return subject.subjectType === 'organization'
    ? and(
        eq(scoreResults.subjectType, 'organization'),
        eq(scoreResults.organizationId, subject.organizationId),
      )
    : and(eq(scoreResults.subjectType, 'contact'), eq(scoreResults.contactId, subject.contactId));
}

function subjectColumns(subject: SubjectRef) {
  return subject.subjectType === 'organization'
    ? {
        subjectType: 'organization' as const,
        organizationId: subject.organizationId,
        contactId: null,
      }
    : { subjectType: 'contact' as const, organizationId: null, contactId: subject.contactId };
}

function unwrapValue(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'value' in value &&
    Object.keys(value).length === 1
  ) {
    return (value as { value: unknown }).value;
  }
  return value;
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected at least one row.');
  return row;
}

function numeric(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : Number(value);
}

function numericInput(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
