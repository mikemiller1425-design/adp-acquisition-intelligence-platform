import {
  confidenceAssessments,
  evidenceRecords,
  permissionEvidenceLinks,
  researchObservations,
  sources,
  variableValueEvidence,
  variableValues,
  type RepositoryExecutor,
} from '@adp/database';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type {
  ConfidenceAssessment,
  ConfidenceAssessmentRepository,
  EvidenceCreateInput,
  EvidenceProvenanceRepository,
  EvidenceRecord,
  EvidenceRepository,
  PermissionEvidenceLink,
  PermissionEvidenceLinkRepository,
  ResearchObservation,
  ResearchObservationRepository,
  SourceRecord,
  SourceRepository,
} from '../domain/ports.js';

type Db = RepositoryExecutor;

function one<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function numeric(value: string | number | null): number | null {
  if (value === null) return null;
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

function mapSource(row: typeof sources.$inferSelect): SourceRecord {
  return {
    ...row,
    defaultReliability: numeric(row.defaultReliability),
    retrievalRestrictions: object(row.retrievalRestrictions),
  };
}

function mapEvidence(row: typeof evidenceRecords.$inferSelect): EvidenceRecord {
  const base = {
    id: row.id,
    sourceId: row.sourceId,
    claim: row.claim,
    structuredPayload: object(row.structuredPayload),
    evidenceType: row.evidenceType,
    observedAt: row.observedAt,
    retrievedAt: row.retrievedAt,
    effectiveAt: row.effectiveAt,
    expiresAt: row.expiresAt,
    confidenceComponents: {
      sourceReliability: numeric(row.sourceReliability),
      specificity: numeric(row.specificity),
      recency: numeric(row.recency),
      crossSourceAgreement: numeric(row.crossSourceAgreement),
      extractionCertainty: numeric(row.extractionCertainty),
    },
    reviewerStatus: row.reviewerStatus,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    supersededById: row.supersededById,
    contentHash: row.contentHash,
    actorUserId: row.actorUserId,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
  };
  return row.subjectType === 'organization'
    ? { ...base, subjectType: 'organization', organizationId: row.organizationId as string }
    : { ...base, subjectType: 'contact', contactId: row.contactId as string };
}

function mapObservation(row: typeof researchObservations.$inferSelect): ResearchObservation {
  const base = {
    id: row.id,
    claim: row.claim,
    evidenceId: row.evidenceId,
    proposedDefinitionVersionId: row.proposedDefinitionVersionId,
    proposedTypedValue: row.proposedTypedValue,
    normalizedInterpretation: row.normalizedInterpretation,
    proposingUserId: row.proposingUserId,
    reviewUserId: row.reviewUserId,
    lifecycleStatus: row.lifecycleStatus,
    decisionReason: row.decisionReason,
    decidedAt: row.decidedAt,
    resultingVariableValueId: row.resultingVariableValueId,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  return row.subjectType === 'organization'
    ? { ...base, subjectType: 'organization', organizationId: row.organizationId as string }
    : { ...base, subjectType: 'contact', contactId: row.contactId as string };
}

function mapAssessment(row: typeof confidenceAssessments.$inferSelect): ConfidenceAssessment {
  return {
    ...row,
    components: object(row.components),
    aggregateScore: numeric(row.aggregateScore),
  };
}

function mapPermissionLink(
  row: typeof permissionEvidenceLinks.$inferSelect,
): PermissionEvidenceLink {
  return row;
}

function evidenceColumns(input: EvidenceCreateInput) {
  return {
    subjectType: input.subjectType,
    organizationId: input.subjectType === 'organization' ? input.organizationId : null,
    contactId: input.subjectType === 'contact' ? input.contactId : null,
    sourceId: input.sourceId,
    claim: input.claim,
    structuredPayload: input.structuredPayload,
    evidenceType: input.evidenceType,
    observedAt: input.observedAt,
    retrievedAt: input.retrievedAt,
    effectiveAt: input.effectiveAt,
    expiresAt: input.expiresAt,
    sourceReliability: numericInput(input.confidenceComponents.sourceReliability),
    specificity: numericInput(input.confidenceComponents.specificity),
    recency: numericInput(input.confidenceComponents.recency),
    crossSourceAgreement: numericInput(input.confidenceComponents.crossSourceAgreement),
    extractionCertainty: numericInput(input.confidenceComponents.extractionCertainty),
    reviewerStatus: input.reviewerStatus,
    contentHash: input.contentHash,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
  };
}

function observationColumns(input: Parameters<ResearchObservationRepository['insert']>[0]) {
  return {
    subjectType: input.subjectType,
    organizationId: input.subjectType === 'organization' ? input.organizationId : null,
    contactId: input.subjectType === 'contact' ? input.contactId : null,
    claim: input.claim,
    evidenceId: input.evidenceId,
    proposedDefinitionVersionId: input.proposedDefinitionVersionId,
    proposedTypedValue: input.proposedTypedValue,
    normalizedInterpretation: input.normalizedInterpretation,
    proposingUserId: input.proposingUserId,
    correlationId: input.correlationId,
  };
}

export class PostgresSourceRepository implements SourceRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<SourceRecord | null> {
    const row = one(await this.db.select().from(sources).where(eq(sources.id, id)).limit(1));
    return row === null ? null : mapSource(row);
  }

  async findByTypeAndLocator(
    sourceType: Parameters<SourceRepository['findByTypeAndLocator']>[0],
    locator: string,
  ): Promise<SourceRecord | null> {
    const row = one(
      await this.db
        .select()
        .from(sources)
        .where(and(eq(sources.sourceType, sourceType), eq(sources.locator, locator)))
        .limit(1),
    );
    return row === null ? null : mapSource(row);
  }

  async insert(input: Parameters<SourceRepository['insert']>[0]): Promise<SourceRecord> {
    const rows = await this.db
      .insert(sources)
      .values({ ...input, defaultReliability: numericInput(input.defaultReliability) })
      .returning();
    return mapSource(rows[0] as typeof sources.$inferSelect);
  }

  async update(
    id: string,
    input: Parameters<SourceRepository['update']>[1],
  ): Promise<SourceRecord | null> {
    const { defaultReliability, ...patch } = input;
    const row = one(
      await this.db
        .update(sources)
        .set({
          ...patch,
          ...(defaultReliability !== undefined
            ? { defaultReliability: numericInput(defaultReliability) }
            : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(sources.id, id))
        .returning(),
    );
    return row === null ? null : mapSource(row);
  }

  async disable(id: string, updatedByUserId: string | null): Promise<SourceRecord | null> {
    const row = one(
      await this.db
        .update(sources)
        .set({ status: 'disabled', updatedByUserId, updatedAt: sql`now()` })
        .where(eq(sources.id, id))
        .returning(),
    );
    return row === null ? null : mapSource(row);
  }
}

export class PostgresEvidenceRepository implements EvidenceRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<EvidenceRecord | null> {
    const row = one(
      await this.db.select().from(evidenceRecords).where(eq(evidenceRecords.id, id)).limit(1),
    );
    return row === null ? null : mapEvidence(row);
  }

  async findByContentHash(contentHash: string): Promise<EvidenceRecord | null> {
    const row = one(
      await this.db
        .select()
        .from(evidenceRecords)
        .where(eq(evidenceRecords.contentHash, contentHash))
        .limit(1),
    );
    return row === null ? null : mapEvidence(row);
  }

  async insert(input: EvidenceCreateInput): Promise<EvidenceRecord> {
    const rows = await this.db.insert(evidenceRecords).values(evidenceColumns(input)).returning();
    return mapEvidence(rows[0] as typeof evidenceRecords.$inferSelect);
  }

  async review(
    id: string,
    input: Parameters<EvidenceRepository['review']>[1],
  ): Promise<EvidenceRecord | null> {
    const row = one(
      await this.db
        .update(evidenceRecords)
        .set(input)
        .where(eq(evidenceRecords.id, id))
        .returning(),
    );
    return row === null ? null : mapEvidence(row);
  }

  async supersede(existingId: string, replacement: EvidenceCreateInput): Promise<EvidenceRecord> {
    const replacementId = randomUUID();
    return this.db.transaction(async (tx) => {
      await tx
        .update(evidenceRecords)
        .set({ supersededById: sql`${evidenceRecords.id}` })
        .where(eq(evidenceRecords.id, existingId));
      const rows = await tx
        .insert(evidenceRecords)
        .values({ id: replacementId, ...evidenceColumns(replacement) })
        .returning();
      await tx
        .update(evidenceRecords)
        .set({ supersededById: replacementId })
        .where(eq(evidenceRecords.id, existingId));
      return mapEvidence(rows[0] as typeof evidenceRecords.$inferSelect);
    });
  }
}

export class PostgresResearchObservationRepository implements ResearchObservationRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<ResearchObservation | null> {
    const row = one(
      await this.db
        .select()
        .from(researchObservations)
        .where(eq(researchObservations.id, id))
        .limit(1),
    );
    return row === null ? null : mapObservation(row);
  }

  async findByCorrelationId(correlationId: string): Promise<ResearchObservation | null> {
    const row = one(
      await this.db
        .select()
        .from(researchObservations)
        .where(eq(researchObservations.correlationId, correlationId))
        .limit(1),
    );
    return row === null ? null : mapObservation(row);
  }

  async insert(
    input: Parameters<ResearchObservationRepository['insert']>[0],
  ): Promise<ResearchObservation> {
    const rows = await this.db
      .insert(researchObservations)
      .values(observationColumns(input))
      .returning();
    return mapObservation(rows[0] as typeof researchObservations.$inferSelect);
  }

  async decide(input: {
    id: string;
    lifecycleStatus: Parameters<ResearchObservationRepository['decide']>[0]['lifecycleStatus'];
    reviewUserId: string | null;
    decisionReason: string | null;
    decidedAt: Date;
    resultingVariableValueId: string | null;
  }): Promise<ResearchObservation | null> {
    const row = one(
      await this.db
        .update(researchObservations)
        .set({ ...input, updatedAt: sql`now()` })
        .where(eq(researchObservations.id, input.id))
        .returning(),
    );
    return row === null ? null : mapObservation(row);
  }
}

export class PostgresConfidenceAssessmentRepository implements ConfidenceAssessmentRepository {
  constructor(private readonly db: Db) {}

  async insert(
    input: Parameters<ConfidenceAssessmentRepository['insert']>[0],
  ): Promise<ConfidenceAssessment> {
    const rows = await this.db
      .insert(confidenceAssessments)
      .values({ ...input, aggregateScore: numericInput(input.aggregateScore) })
      .returning();
    return mapAssessment(rows[0] as typeof confidenceAssessments.$inferSelect);
  }
}

export class PostgresPermissionEvidenceLinkRepository implements PermissionEvidenceLinkRepository {
  constructor(private readonly db: Db) {}

  async link(input: {
    subjectType: Parameters<PermissionEvidenceLinkRepository['link']>[0]['subjectType'];
    subjectId: string;
    evidenceRecordId: string;
    createdBy: string | null;
  }): Promise<PermissionEvidenceLink> {
    const rows = await this.db
      .insert(permissionEvidenceLinks)
      .values(input)
      .onConflictDoNothing()
      .returning();
    if (rows[0] !== undefined) return mapPermissionLink(rows[0]);
    const existing = one(
      await this.db
        .select()
        .from(permissionEvidenceLinks)
        .where(
          and(
            eq(permissionEvidenceLinks.subjectType, input.subjectType),
            eq(permissionEvidenceLinks.subjectId, input.subjectId),
            eq(permissionEvidenceLinks.evidenceRecordId, input.evidenceRecordId),
          ),
        )
        .limit(1),
    );
    return mapPermissionLink(existing as typeof permissionEvidenceLinks.$inferSelect);
  }

  async listForSubject(input: {
    subjectType: Parameters<PermissionEvidenceLinkRepository['listForSubject']>[0]['subjectType'];
    subjectId: string;
  }): Promise<PermissionEvidenceLink[]> {
    const rows = await this.db
      .select()
      .from(permissionEvidenceLinks)
      .where(
        and(
          eq(permissionEvidenceLinks.subjectType, input.subjectType),
          eq(permissionEvidenceLinks.subjectId, input.subjectId),
        ),
      );
    return rows.map(mapPermissionLink);
  }
}

export class PostgresEvidenceProvenanceRepository implements EvidenceProvenanceRepository {
  constructor(private readonly db: Db) {}

  async listEvidenceForValue(valueId: string) {
    const rows = await this.db
      .select({ evidence: evidenceRecords, link: variableValueEvidence })
      .from(variableValueEvidence)
      .innerJoin(evidenceRecords, eq(variableValueEvidence.evidenceId, evidenceRecords.id))
      .where(eq(variableValueEvidence.valueId, valueId));
    return rows.map((row) => ({
      evidence: mapEvidence(row.evidence),
      relationshipType: row.link.relationshipType,
    }));
  }

  async listValuesForEvidence(evidenceRecordId: string) {
    const rows = await this.db
      .select({ value: variableValues, link: variableValueEvidence })
      .from(variableValueEvidence)
      .innerJoin(variableValues, eq(variableValueEvidence.valueId, variableValues.id))
      .where(eq(variableValueEvidence.evidenceId, evidenceRecordId));
    return rows.map((row) => ({
      valueId: row.value.id,
      variableDefinitionId: row.value.variableDefinitionId,
      relationshipType: row.link.relationshipType,
    }));
  }
}
