import {
  variableDefinitions,
  variableDefinitionVersions,
  variableValueEvidence,
  variableValues,
  type RepositoryExecutor,
} from '@adp/database';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type {
  VariableDefinition,
  VariableDefinitionRepository,
  VariableDefinitionVersion,
  VariableValue,
  VariableValueCreateInput,
  VariableValueRepository,
} from '../domain/ports.js';

type Db = RepositoryExecutor;

function one<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function mapDefinition(row: typeof variableDefinitions.$inferSelect): VariableDefinition {
  return {
    ...row,
    subjectType: row.subjectType as VariableDefinition['subjectType'],
  };
}

function mapVersion(
  row: typeof variableDefinitionVersions.$inferSelect,
): VariableDefinitionVersion {
  return row;
}

function mapValue(row: typeof variableValues.$inferSelect): VariableValue {
  const base = {
    id: row.id,
    variableDefinitionId: row.variableDefinitionId,
    definitionVersionId: row.definitionVersionId,
    typedValue: row.typedValue,
    normalizedValue: row.normalizedValue,
    valueStatus: row.valueStatus,
    evidenceType: row.evidenceType,
    confidenceStatus: row.confidenceStatus,
    confidenceAssessmentId: row.confidenceAssessmentId,
    lifecycle: row.lifecycle,
    freshnessResult: row.freshnessResult,
    effectiveAt: row.effectiveAt,
    observedAt: row.observedAt,
    verifiedAt: row.verifiedAt,
    expiresAt: row.expiresAt,
    sourceActorUserId: row.sourceActorUserId,
    calculationActor: row.calculationActor,
    supersededById: row.supersededById,
    manualOverrideFlag: row.manualOverrideFlag,
    overrideActor: row.overrideActor,
    overrideReasonCode: row.overrideReasonCode,
    overrideReasonNote: row.overrideReasonNote,
    overrideAt: row.overrideAt,
    originalValueId: row.originalValueId,
    recordVersion: row.recordVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  return row.subjectType === 'organization'
    ? { ...base, subjectType: 'organization', organizationId: row.organizationId as string }
    : { ...base, subjectType: 'contact', contactId: row.contactId as string };
}

function columnsForSubject(input: VariableValueCreateInput) {
  return input.subjectType === 'organization'
    ? {
        subjectType: 'organization' as const,
        organizationId: input.organizationId,
        contactId: null,
      }
    : { subjectType: 'contact' as const, organizationId: null, contactId: input.contactId };
}

function subjectWhere(
  subject:
    VariableValueCreateInput | Parameters<VariableValueRepository['findCurrent']>[0]['subject'],
) {
  return subject.subjectType === 'organization'
    ? and(
        eq(variableValues.subjectType, 'organization'),
        eq(variableValues.organizationId, subject.organizationId as string),
      )
    : and(
        eq(variableValues.subjectType, 'contact'),
        eq(variableValues.contactId, subject.contactId as string),
      );
}

export class PostgresVariableDefinitionRepository implements VariableDefinitionRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<VariableDefinition | null> {
    const row = one(
      await this.db
        .select()
        .from(variableDefinitions)
        .where(eq(variableDefinitions.id, id))
        .limit(1),
    );
    return row === null ? null : mapDefinition(row);
  }

  async findByKey(key: string): Promise<VariableDefinition | null> {
    const row = one(
      await this.db
        .select()
        .from(variableDefinitions)
        .where(eq(variableDefinitions.key, key))
        .limit(1),
    );
    return row === null ? null : mapDefinition(row);
  }

  async insertDefinition(
    input: Parameters<VariableDefinitionRepository['insertDefinition']>[0],
  ): Promise<VariableDefinition> {
    const rows = await this.db.insert(variableDefinitions).values(input).returning();
    return mapDefinition(rows[0] as typeof variableDefinitions.$inferSelect);
  }

  async updateDefinition(
    id: string,
    input: Parameters<VariableDefinitionRepository['updateDefinition']>[1],
  ): Promise<VariableDefinition | null> {
    const row = one(
      await this.db
        .update(variableDefinitions)
        .set({ ...input, updatedAt: sql`now()` })
        .where(eq(variableDefinitions.id, id))
        .returning(),
    );
    return row === null ? null : mapDefinition(row);
  }

  async findVersionById(id: string): Promise<VariableDefinitionVersion | null> {
    const row = one(
      await this.db
        .select()
        .from(variableDefinitionVersions)
        .where(eq(variableDefinitionVersions.id, id))
        .limit(1),
    );
    return row === null ? null : mapVersion(row);
  }

  async findLatestVersion(definitionId: string): Promise<VariableDefinitionVersion | null> {
    const row = one(
      await this.db
        .select()
        .from(variableDefinitionVersions)
        .where(eq(variableDefinitionVersions.definitionId, definitionId))
        .orderBy(desc(variableDefinitionVersions.version))
        .limit(1),
    );
    return row === null ? null : mapVersion(row);
  }

  async insertVersion(
    input: Parameters<VariableDefinitionRepository['insertVersion']>[0],
  ): Promise<VariableDefinitionVersion> {
    const rows = await this.db.insert(variableDefinitionVersions).values(input).returning();
    return mapVersion(rows[0] as typeof variableDefinitionVersions.$inferSelect);
  }

  async publishVersion(input: {
    definitionId: string;
    versionId: string;
    publishedBy: string | null;
    publishedAt: Date;
  }): Promise<{ definition: VariableDefinition; version: VariableDefinitionVersion } | null> {
    return this.db.transaction(async (tx) => {
      await tx
        .update(variableDefinitionVersions)
        .set({ lifecycleStatus: 'retired' })
        .where(
          and(
            eq(variableDefinitionVersions.definitionId, input.definitionId),
            eq(variableDefinitionVersions.lifecycleStatus, 'active'),
          ),
        );
      const version = one(
        await tx
          .update(variableDefinitionVersions)
          .set({
            lifecycleStatus: 'active',
            publishedAt: input.publishedAt,
            publishedBy: input.publishedBy,
          })
          .where(
            and(
              eq(variableDefinitionVersions.id, input.versionId),
              eq(variableDefinitionVersions.definitionId, input.definitionId),
            ),
          )
          .returning(),
      );
      if (version === null) return null;
      const definition = one(
        await tx
          .update(variableDefinitions)
          .set({ status: 'active', currentVersionId: input.versionId, updatedAt: sql`now()` })
          .where(eq(variableDefinitions.id, input.definitionId))
          .returning(),
      );
      if (definition === null) return null;
      return { definition: mapDefinition(definition), version: mapVersion(version) };
    });
  }
}

export class PostgresVariableValueRepository implements VariableValueRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<VariableValue | null> {
    const row = one(
      await this.db.select().from(variableValues).where(eq(variableValues.id, id)).limit(1),
    );
    return row === null ? null : mapValue(row);
  }

  async findCurrent(input: {
    subject: Parameters<VariableValueRepository['findCurrent']>[0]['subject'];
    variableDefinitionId: string;
  }): Promise<VariableValue | null> {
    const row = one(
      await this.db
        .select()
        .from(variableValues)
        .where(
          and(
            subjectWhere(input.subject),
            eq(variableValues.variableDefinitionId, input.variableDefinitionId),
            eq(variableValues.lifecycle, 'current'),
            ne(variableValues.valueStatus, 'contradicted'),
          ),
        )
        .limit(1),
    );
    return row === null ? null : mapValue(row);
  }

  async listHistory(input: {
    subject: Parameters<VariableValueRepository['listHistory']>[0]['subject'];
    variableDefinitionId: string;
  }): Promise<VariableValue[]> {
    const rows = await this.db
      .select()
      .from(variableValues)
      .where(
        and(
          subjectWhere(input.subject),
          eq(variableValues.variableDefinitionId, input.variableDefinitionId),
        ),
      )
      .orderBy(desc(variableValues.createdAt));
    return rows.map(mapValue);
  }

  async insert(input: VariableValueCreateInput): Promise<VariableValue> {
    const rows = await this.db
      .insert(variableValues)
      .values({ ...input, ...columnsForSubject(input) })
      .returning();
    return mapValue(rows[0] as typeof variableValues.$inferSelect);
  }

  async confirmCurrent(
    input: VariableValueCreateInput,
  ): Promise<{ value: VariableValue; superseded: VariableValue[] }> {
    const newId = randomUUID();
    return this.db.transaction(async (tx) => {
      const supersededRows = await tx
        .update(variableValues)
        .set({
          lifecycle: 'superseded',
          supersededById: sql`${variableValues.id}`,
          updatedAt: sql`now()`,
          recordVersion: sql`${variableValues.recordVersion} + 1`,
        })
        .where(
          and(
            subjectWhere(input),
            eq(variableValues.variableDefinitionId, input.variableDefinitionId),
            eq(variableValues.lifecycle, 'current'),
            ne(variableValues.valueStatus, 'contradicted'),
            isNull(variableValues.supersededById),
          ),
        )
        .returning();
      const insertedRows = await tx
        .insert(variableValues)
        .values({ id: newId, ...input, ...columnsForSubject(input) })
        .returning();
      if (supersededRows.length > 0) {
        await tx
          .update(variableValues)
          .set({ supersededById: newId, updatedAt: sql`now()` })
          .where(
            inArray(
              variableValues.id,
              supersededRows.map((row) => row.id),
            ),
          );
      }
      return {
        value: mapValue(insertedRows[0] as typeof variableValues.$inferSelect),
        superseded: supersededRows.map(mapValue),
      };
    });
  }

  async updateLifecycle(input: {
    valueId: string;
    lifecycle: Parameters<VariableValueRepository['updateLifecycle']>[0]['lifecycle'];
    valueStatus?: Parameters<VariableValueRepository['updateLifecycle']>[0]['valueStatus'];
    supersededById?: string | null;
  }): Promise<VariableValue | null> {
    const row = one(
      await this.db
        .update(variableValues)
        .set({
          lifecycle: input.lifecycle,
          ...(input.valueStatus !== undefined ? { valueStatus: input.valueStatus } : {}),
          ...(input.supersededById !== undefined ? { supersededById: input.supersededById } : {}),
          updatedAt: sql`now()`,
          recordVersion: sql`${variableValues.recordVersion} + 1`,
        })
        .where(eq(variableValues.id, input.valueId))
        .returning(),
    );
    return row === null ? null : mapValue(row);
  }

  async linkEvidence(input: {
    valueId: string;
    evidenceId: string;
    relationshipType: Parameters<VariableValueRepository['linkEvidence']>[0]['relationshipType'];
    contributionRole: string | null;
    actorUserId: string | null;
  }): Promise<void> {
    await this.db.insert(variableValueEvidence).values(input).onConflictDoNothing();
  }
}
