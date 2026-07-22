import { createHash, randomUUID } from 'node:crypto';

import {
  contacts,
  importBatches,
  importRows,
  mergeEvents,
  organizationLocations,
  organizations,
  type RepositoryExecutor,
} from '@adp/database';
import { and, eq, inArray, or, sql } from 'drizzle-orm';

import type { DuplicateCandidate } from '../domain/duplicate-matcher.js';
import type { ImportStatus } from '../domain/import-lifecycle.js';
import { normalizeDomain, normalizeOrgName } from '../domain/normalizers.js';
import type {
  CollectionOrganizationPort,
  DuplicateCandidateRepository,
  DuplicateReviewRepository,
  ImportBatchRepository,
  ImportRowRepository,
  MergeEventRepository,
  MergeReadRepository,
  MergeWritePort,
} from '../domain/ports.js';
import type {
  DuplicateDisposition,
  DuplicateReview,
  ImportBatch,
  ImportDryRunReport,
  ImportRow,
  ImportRowStatus,
  MergeEvent,
} from '../domain/types.js';

type Db = RepositoryExecutor;

export class PostgresImportBatchRepository implements ImportBatchRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<ImportBatch | null> {
    const rows = await this.db.select().from(importBatches).where(eq(importBatches.id, id)).limit(1);
    return rows[0] === undefined ? null : mapBatch(rows[0]);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<ImportBatch | null> {
    const rows = await this.db
      .select()
      .from(importBatches)
      .where(eq(importBatches.idempotencyKey, idempotencyKey))
      .limit(1);
    return rows[0] === undefined ? null : mapBatch(rows[0]);
  }

  async create(input: Parameters<ImportBatchRepository['create']>[0]): Promise<ImportBatch> {
    const rows = await this.db
      .insert(importBatches)
      .values({
        filename: input.originalFilename,
        artifactRef: input.storageKey,
        contentHash: input.contentHash,
        fileSizeBytes: input.fileSizeBytes,
        contentType: input.contentType,
        delimiter: input.delimiter,
        actorUserId: input.createdByUserId,
        createdBy: input.createdByUserId,
        updatedBy: input.createdByUserId,
        source: 'csv_upload',
        idempotencyKey: input.idempotencyKey,
        rowCount: input.rowCount,
      })
      .returning();
    return mapBatch(rows[0] as typeof importBatches.$inferSelect);
  }

  async updateStatus(
    id: string,
    status: ImportStatus,
    patch: Partial<ImportBatch> = {},
  ): Promise<ImportBatch> {
    const rows = await this.db
      .update(importBatches)
      .set({
        status,
        updatedAt: new Date(),
        ...(patch.committedAt !== undefined && patch.committedAt !== null
          ? { commitReport: { committedAt: patch.committedAt.toISOString() } }
          : {}),
        ...(patch.reversedAt !== undefined && patch.reversedAt !== null
          ? { reversalReport: { reversedAt: patch.reversedAt.toISOString() } }
          : {}),
      })
      .where(eq(importBatches.id, id))
      .returning();
    return mapBatch(rows[0] as typeof importBatches.$inferSelect);
  }

  async saveMapping(id: string, mapping: Record<string, string>, registryVersion: string): Promise<ImportBatch> {
    const rows = await this.db
      .update(importBatches)
      .set({ mapping, mappingVersion: registryVersion, status: 'mapped', updatedAt: new Date() })
      .where(eq(importBatches.id, id))
      .returning();
    return mapBatch(rows[0] as typeof importBatches.$inferSelect);
  }

  async saveDryRunReport(id: string, report: ImportDryRunReport): Promise<ImportBatch> {
    const rows = await this.db
      .update(importBatches)
      .set({ previewReport: report, updatedAt: new Date() })
      .where(eq(importBatches.id, id))
      .returning();
    return mapBatch(rows[0] as typeof importBatches.$inferSelect);
  }
}

export class PostgresImportRowRepository implements ImportRowRepository {
  constructor(private readonly db: Db) {}

  async insertMany(rows: Array<Omit<ImportRow, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ImportRow[]> {
    if (rows.length === 0) return [];
    const inserted = await this.db
      .insert(importRows)
      .values(
        rows.map((row) => ({
          batchId: row.batchId,
          sourceRowNumber: row.rowNumber,
          rawRowHash: hashStable(row.raw),
          mappedFields: row.mapped,
          normalizedFields: row.normalized,
          validationResults: { raw: row.raw, errors: row.errors, status: row.status },
          duplicateDisposition: 'pending' as const,
          commitResult: 'pending' as const,
          createdEntityRefs: createdRefs(row),
        })),
      )
      .returning();
    return inserted.map(mapRow);
  }

  async listByBatch(batchId: string): Promise<ImportRow[]> {
    const rows = await this.db
      .select()
      .from(importRows)
      .where(eq(importRows.batchId, batchId))
      .orderBy(importRows.sourceRowNumber);
    return rows.map(mapRow);
  }

  async update(rowId: string, patch: Parameters<ImportRowRepository['update']>[1]): Promise<ImportRow> {
    const current = await this.db.select().from(importRows).where(eq(importRows.id, rowId)).limit(1);
    const existing = current[0] === undefined ? null : mapRow(current[0]);
    const nextStatus = patch.status ?? existing?.status ?? 'pending';
    const rows = await this.db
      .update(importRows)
      .set({
        ...(patch.mapped !== undefined ? { mappedFields: patch.mapped } : {}),
        ...(patch.normalized !== undefined ? { normalizedFields: patch.normalized } : {}),
        validationResults: {
          ...(metadataObject(current[0]?.validationResults).raw !== undefined
            ? { raw: metadataObject(current[0]?.validationResults).raw }
            : {}),
          errors: patch.errors ?? existing?.errors ?? [],
          status: nextStatus,
          duplicateReviews: metadataObject(current[0]?.validationResults).duplicateReviews ?? [],
        },
        duplicateDisposition:
          nextStatus === 'duplicate_blocked' ? 'skip' : current[0]?.duplicateDisposition ?? 'pending',
        commitResult: commitResultForStatus(nextStatus, current[0]?.commitResult ?? 'pending'),
        createdEntityRefs: createdRefs({
          createdOrganizationId: patch.createdOrganizationId ?? existing?.createdOrganizationId ?? null,
          createdLocationId: patch.createdLocationId ?? existing?.createdLocationId ?? null,
          createdContactId: patch.createdContactId ?? existing?.createdContactId ?? null,
        }),
        updatedAt: new Date(),
      })
      .where(eq(importRows.id, rowId))
      .returning();
    return mapRow(rows[0] as typeof importRows.$inferSelect);
  }

  async updateManyStatus(rowIds: readonly string[], status: ImportRowStatus): Promise<void> {
    if (rowIds.length === 0) return;
    await this.db
      .update(importRows)
      .set({
        validationResults: sql`jsonb_set(validation_results, '{status}', ${JSON.stringify(status)}::jsonb, true)`,
        commitResult: commitResultForStatus(status, 'pending'),
        updatedAt: new Date(),
      })
      .where(inArray(importRows.id, [...rowIds]));
  }
}

export class PostgresDuplicateReviewRepository implements DuplicateReviewRepository {
  constructor(private readonly db: Db) {}

  async insertCandidates(input: Parameters<DuplicateReviewRepository['insertCandidates']>[0]): Promise<DuplicateReview[]> {
    const created: DuplicateReview[] = [];
    for (const candidate of input) {
      const rows = await this.db.select().from(importRows).where(eq(importRows.id, candidate.rowId)).limit(1);
      const row = rows[0];
      if (row === undefined) continue;
      const metadata = metadataObject(row.validationResults);
      const reviews = duplicateReviewsFromMetadata(metadata);
      if (reviews.some((review) => review.candidateOrganizationId === candidate.candidateOrganizationId)) {
        continue;
      }
      const review: DuplicateReview = {
        id: randomUUID(),
        batchId: candidate.batchId,
        rowId: candidate.rowId,
        candidateOrganizationId: candidate.candidateOrganizationId,
        tier: candidate.tier,
        features: candidate.features,
        disposition: null,
        reviewedByUserId: null,
        reviewedAt: null,
        createdAt: new Date(),
      };
      reviews.push(review);
      await this.db
        .update(importRows)
        .set({
          validationResults: { ...metadata, duplicateReviews: reviews },
          updatedAt: new Date(),
        })
        .where(eq(importRows.id, candidate.rowId));
      created.push(review);
    }
    return created;
  }

  async listByBatch(batchId: string): Promise<DuplicateReview[]> {
    const rows = await this.db.select().from(importRows).where(eq(importRows.batchId, batchId));
    return rows.flatMap((row) => duplicateReviewsFromMetadata(metadataObject(row.validationResults)));
  }

  async setDisposition(input: Parameters<DuplicateReviewRepository['setDisposition']>[0]): Promise<DuplicateReview> {
    const rows = await this.db.select().from(importRows);
    for (const row of rows) {
      const metadata = metadataObject(row.validationResults);
      const reviews = duplicateReviewsFromMetadata(metadata);
      const index = reviews.findIndex((review) => review.id === input.reviewId);
      if (index === -1) continue;
      const updated: DuplicateReview = {
        ...(reviews[index] as DuplicateReview),
        disposition: input.disposition,
        reviewedByUserId: input.reviewedByUserId,
        reviewedAt: input.reviewedAt,
      };
      reviews[index] = updated;
      await this.db
        .update(importRows)
        .set({
          validationResults: { ...metadata, duplicateReviews: reviews },
          duplicateDisposition: dispositionToDb(input.disposition),
          updatedAt: new Date(),
        })
        .where(eq(importRows.id, row.id));
      return updated;
    }
    throw new Error('Duplicate review not found');
  }
}

export class PostgresDuplicateCandidateRepository implements DuplicateCandidateRepository {
  constructor(private readonly db: Db) {}

  async findCandidates(input: DuplicateCandidate): Promise<DuplicateCandidate[]> {
    const normalizedDomain = normalizeDomain(input.domain).normalized;
    const normalizedName = normalizeOrgName(input.displayName ?? input.legalName).normalized;
    const filters = [];
    if (normalizedDomain !== null) filters.push(eq(organizations.normalizedDomain, normalizedDomain));
    if (normalizedName !== null) filters.push(eq(organizations.normalizedName, normalizedName));
    if (filters.length === 0) return [];
    const rows = await this.db
      .select()
      .from(organizations)
      .where(and(eq(organizations.recordStatus, 'active'), or(...filters)))
      .limit(25);
    return rows.map((row) => ({
      organizationId: row.id,
      displayName: row.displayName,
      legalName: row.legalName,
      domain: row.domain,
      externalId: null,
      phone: null,
      aliases: [],
      contactEmails: [],
      contactPhones: [],
    }));
  }
}

export class PostgresCollectionOrganizationPort implements CollectionOrganizationPort {
  constructor(private readonly db: Db) {}

  async createOrganization(input: Parameters<CollectionOrganizationPort['createOrganization']>[0]) {
    const rows = await this.db.insert(organizations).values(input).returning({
      id: organizations.id,
      recordVersion: organizations.recordVersion,
    });
    return rows[0] as { id: string; recordVersion: number };
  }

  async createLocation(input: Parameters<CollectionOrganizationPort['createLocation']>[0]) {
    const rows = await this.db.insert(organizationLocations).values(input).returning({
      id: organizationLocations.id,
    });
    return rows[0] as { id: string };
  }

  async createContact(input: Parameters<CollectionOrganizationPort['createContact']>[0]) {
    const rows = await this.db.insert(contacts).values(input).returning({ id: contacts.id });
    return rows[0] as { id: string };
  }

  async archiveBatchOnlyOrganization(input: Parameters<CollectionOrganizationPort['archiveBatchOnlyOrganization']>[0]) {
    await this.db
      .update(organizations)
      .set({
        recordStatus: 'archived',
        archivedByUserId: input.archivedByUserId,
        archivedAt: input.at,
        updatedAt: input.at,
      })
      .where(eq(organizations.id, input.organizationId));
  }
}

export class PostgresMergeEventRepository implements MergeEventRepository {
  constructor(private readonly db: Db) {}

  async findByIdempotencyKey(idempotencyKey: string): Promise<MergeEvent | null> {
    const rows = await this.db
      .select()
      .from(mergeEvents)
      .where(eq(mergeEvents.correlationId, uuidFromString(idempotencyKey)))
      .limit(1);
    return rows[0] === undefined ? null : mapMergeEvent(rows[0]);
  }

  async createPreview(input: Parameters<MergeEventRepository['createPreview']>[0]): Promise<MergeEvent> {
    const duplicate = input.duplicateOrganizationIds[0];
    if (duplicate === undefined) throw new Error('At least one duplicate organization is required');
    const rows = await this.db
      .insert(mergeEvents)
      .values({
        survivorOrganizationId: input.survivorOrganizationId,
        absorbedOrganizationId: duplicate,
        impactPreview: input.plan,
        movedChildren: input.plan.childReassignments,
        correlationId: uuidFromString(input.idempotencyKey),
      })
      .returning();
    return mapMergeEvent(rows[0] as typeof mergeEvents.$inferSelect);
  }

  async approve(input: Parameters<MergeEventRepository['approve']>[0]): Promise<MergeEvent> {
    const rows = await this.db
      .update(mergeEvents)
      .set({
        status: 'completed',
        approverUserId: input.approvedByUserId,
        completedAt: input.appliedAt,
        updatedAt: input.appliedAt,
      })
      .where(eq(mergeEvents.id, input.mergeEventId))
      .returning();
    return mapMergeEvent(rows[0] as typeof mergeEvents.$inferSelect);
  }

  async markReversed(input: Parameters<MergeEventRepository['markReversed']>[0]): Promise<MergeEvent> {
    const rows = await this.db
      .update(mergeEvents)
      .set({ status: 'reversed', reversedAt: input.reversedAt, updatedAt: input.reversedAt })
      .where(eq(mergeEvents.id, input.mergeEventId))
      .returning();
    return mapMergeEvent(rows[0] as typeof mergeEvents.$inferSelect);
  }
}

export class PostgresMergeReadRepository implements MergeReadRepository {
  constructor(private readonly db: Db) {}

  async getSnapshots(organizationIds: readonly string[]) {
    const rows = await this.db
      .select()
      .from(organizations)
      .where(inArray(organizations.id, [...organizationIds]));
    return rows.map((row) => ({
      organizationId: row.id,
      recordVersion: row.recordVersion,
      existingRelationshipFlag: row.existingRelationshipFlag,
      childCounts: {
        contacts: 0,
        locations: 0,
        evidence: 0,
        variableValues: 0,
        consentRecords: 0,
      },
    }));
  }

  async listPriorMergeEdges() {
    const rows = await this.db.select().from(mergeEvents);
    return rows.map((row) => ({
      fromOrganizationId: row.absorbedOrganizationId,
      toOrganizationId: row.survivorOrganizationId,
    }));
  }
}

export class NoopPostgresMergeWritePort implements MergeWritePort {
  async applyMergePlan(): Promise<void> {}
  async reverseMerge(): Promise<void> {}
}

function mapBatch(row: typeof importBatches.$inferSelect): ImportBatch {
  return {
    id: row.id,
    status: row.status as ImportStatus,
    originalFilename: row.filename,
    storageKey: row.artifactRef,
    contentType: row.contentType,
    idempotencyKey: row.idempotencyKey,
    mapping: Object.keys(metadataObject(row.mapping)).length === 0 ? null : (row.mapping as Record<string, string>),
    registryVersion: row.mappingVersion,
    dryRunReport: row.previewReport as ImportDryRunReport | null,
    rowCount: row.rowCount,
    createdByUserId: row.actorUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    committedAt: row.commitReport === null ? null : row.updatedAt,
    reversedAt: row.reversalReport === null ? null : row.updatedAt,
  };
}

function mapRow(row: typeof importRows.$inferSelect): ImportRow {
  const validation = metadataObject(row.validationResults);
  const refs = Array.isArray(row.createdEntityRefs) ? row.createdEntityRefs : [];
  return {
    id: row.id,
    batchId: row.batchId,
    rowNumber: row.sourceRowNumber,
    raw: metadataObject(validation.raw) as Record<string, string>,
    mapped: metadataObject(row.mappedFields) as Record<string, string | null>,
    normalized: metadataObject(row.normalizedFields),
    status: rowStatus(row, validation),
    errors: Array.isArray(validation.errors) ? validation.errors.map(String) : [],
    createdOrganizationId: refId(refs, 'organization'),
    createdLocationId: refId(refs, 'location'),
    createdContactId: refId(refs, 'contact'),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMergeEvent(row: typeof mergeEvents.$inferSelect): MergeEvent {
  const impact = metadataObject(row.impactPreview);
  const duplicateIds = Array.isArray(impact.duplicateOrganizationIds)
    ? impact.duplicateOrganizationIds.map(String)
    : [row.absorbedOrganizationId];
  return {
    id: row.id,
    survivorOrganizationId: row.survivorOrganizationId,
    duplicateOrganizationIds: duplicateIds,
    plan: row.impactPreview,
    status:
      row.status === 'completed'
        ? 'applied'
        : row.status === 'planned'
          ? 'previewed'
        : row.status === 'manual_remediation_required' || row.status === 'reversal_blocked'
            ? 'blocked'
            : row.status,
    idempotencyKey: row.correlationId ?? row.id,
    approvedByUserId: row.approverUserId,
    appliedAt: row.completedAt,
    reversedAt: row.reversedAt,
    createdAt: row.createdAt,
  };
}

function rowStatus(row: typeof importRows.$inferSelect, validation: Record<string, unknown>): ImportRowStatus {
  if (row.commitResult === 'created' || row.commitResult === 'linked' || row.commitResult === 'updated') return 'committed';
  if (row.commitResult === 'failed') return 'failed';
  if (row.commitResult === 'reverted') return 'reversed';
  if (row.duplicateDisposition === 'skip' || row.duplicateDisposition === 'rejected') return 'duplicate_blocked';
  return validation.status === 'valid' || validation.status === 'invalid' ? validation.status : 'pending';
}

function commitResultForStatus(status: ImportRowStatus, fallback: string) {
  if (status === 'committed') return 'created';
  if (status === 'failed') return 'failed';
  if (status === 'reversed') return 'reverted';
  return fallback as 'pending';
}

function dispositionToDb(disposition: DuplicateDisposition) {
  switch (disposition) {
    case 'new_record':
      return 'unique';
    case 'link_existing':
      return 'link';
    case 'skip':
      return 'skip';
    case 'needs_research':
      return 'merge_candidate';
  }
}

function duplicateReviewsFromMetadata(metadata: Record<string, unknown>): DuplicateReview[] {
  return Array.isArray(metadata.duplicateReviews) ? (metadata.duplicateReviews as DuplicateReview[]) : [];
}

function createdRefs(row: {
  createdOrganizationId: string | null;
  createdLocationId: string | null;
  createdContactId: string | null;
}) {
  return [
    row.createdOrganizationId === null ? null : { entityType: 'organization', entityId: row.createdOrganizationId },
    row.createdLocationId === null ? null : { entityType: 'location', entityId: row.createdLocationId },
    row.createdContactId === null ? null : { entityType: 'contact', entityId: row.createdContactId },
  ].filter(Boolean);
}

function refId(refs: unknown[], entityType: string): string | null {
  const ref = refs.find(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      (item as { entityType?: unknown }).entityType === entityType,
  );
  return typeof (ref as { entityId?: unknown } | undefined)?.entityId === 'string'
    ? ((ref as { entityId: string }).entityId)
    : null;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hashStable(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function uuidFromString(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
