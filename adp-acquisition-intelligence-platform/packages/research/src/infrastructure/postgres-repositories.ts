import {
  approvedSources,
  collectionAttempts,
  collectionRuns,
  extractedClaims,
  extractionRuns,
  organizations,
  outboxEvents,
  populationImports,
  rawCandidates,
  researchPriorityAssessments,
  sourceRateLimitStates,
  sourceSnapshots,
  type RepositoryExecutor,
} from '@adp/database';
import type { DuplicateCandidate } from '@adp/collection';
import { and, eq, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { normalizeDomain, normalizeOrgName } from '../domain/normalize.js';
import type { RateLimitState } from '../domain/rate-limit.js';
import type { ResearchPriorityAssessment } from '../domain/research-priority.js';
import type { ClaimReviewStatus } from '../domain/claim-review.js';
import type {
  ClaimRecord,
  ClaimRepository,
  OrganizationLookupPort,
  OutboxPort,
  PopulationImportRecord,
  PopulationRepository,
  PriorityRepository,
  RawCandidateRecord,
} from '../domain/ports.js';
import type {
  ApprovedSourceRecord,
  ApprovedSourceRepository,
  CollectionAttemptInsertInput,
  CollectionAttemptRecord,
  CollectionAttemptRepository,
  CollectionAttemptStatus,
  CollectionRunRecord,
  CollectionRunRepository,
  CollectionRunStatus,
  ConcurrencyGatePort,
  ExtractionRunRecord,
  ExtractionRunRepository,
  RateLimitStateRepository,
  ResearchUnitOfWork,
  SnapshotInsertInput,
  SnapshotRecord,
  SnapshotRepository,
  TransactionRunner,
} from '../domain/persistence-ports.js';
import { InProcessConcurrencyGate } from './concurrency-gate.js';

type Db = RepositoryExecutor;

type SubjectAggregateType = 'organization' | 'opportunity' | 'contact' | 'user' | 'system';

function one<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function required<T>(row: T | null | undefined, message: string): T {
  if (row == null) throw new Error(message);
  return row;
}

function mapAggregateType(value: string): SubjectAggregateType {
  if (
    value === 'organization' ||
    value === 'opportunity' ||
    value === 'contact' ||
    value === 'user' ||
    value === 'system'
  ) {
    return value;
  }
  return 'system';
}

function mapImport(row: typeof populationImports.$inferSelect): PopulationImportRecord {
  return {
    id: row.id,
    populationSourceId: row.populationSourceId,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    dryRun: row.dryRun,
    rowCount: row.rowCount,
    report: (row.report ?? {}) as Record<string, unknown>,
  };
}

function mapCandidate(row: typeof rawCandidates.$inferSelect): RawCandidateRecord {
  return {
    id: row.id,
    identityKey: row.identityKey,
    displayName: row.displayName,
    legalName: row.legalName,
    domain: row.domain,
    website: row.website,
    phone: row.phone,
    addressLine1: row.addressLine1,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    aliases: row.aliases ?? [],
    status: row.status,
    organizationId: row.organizationId,
  };
}

function mapClaim(row: typeof extractedClaims.$inferSelect): ClaimRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    variableKey: row.variableKey,
    reviewStatus: row.reviewStatus as ClaimReviewStatus,
    proposedValue: row.proposedValue,
    originalExcerpt: row.originalExcerpt,
    sourceUrl: row.sourceUrl,
    sourceSnapshotId: row.sourceSnapshotId,
  };
}

function mapSnapshot(row: typeof sourceSnapshots.$inferSelect): SnapshotRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    approvedSourceId: row.approvedSourceId,
    collectionJobId: row.collectionJobId,
    requestedUrl: row.requestedUrl,
    finalUrl: row.finalUrl,
    domain: row.domain,
    adapterVersion: row.adapterVersion,
    policyVersion: row.policyVersion,
    retrievedAt: row.retrievedAt,
    httpStatus: row.httpStatus,
    contentType: row.contentType,
    contentLength: row.contentLength,
    contentHash: row.contentHash,
    etag: row.etag,
    lastModified: row.lastModified,
    redirectChain: row.redirectChain ?? [],
    parserVersion: row.parserVersion,
    storageKey: row.storageKey,
    retentionExpiresAt: row.retentionExpiresAt,
    unchangedFromSnapshotId: row.unchangedFromSnapshotId,
  };
}

function mapExtractionRun(row: typeof extractionRuns.$inferSelect): ExtractionRunRecord {
  return {
    id: row.id,
    sourceSnapshotId: row.sourceSnapshotId,
    extractorVersion: row.extractorVersion,
    mappingVersion: row.mappingVersion,
    status: row.status,
    summary: (row.summary ?? {}) as Record<string, unknown>,
  };
}

function mapAttempt(row: typeof collectionAttempts.$inferSelect): CollectionAttemptRecord {
  return {
    id: row.id,
    collectionRunId: row.collectionRunId,
    collectionJobId: row.collectionJobId,
    organizationId: row.organizationId,
    approvedSourceId: row.approvedSourceId,
    requestedUrl: row.requestedUrl,
    finalUrl: row.finalUrl,
    domain: row.domain,
    status: row.status as CollectionAttemptStatus,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    httpStatus: row.httpStatus,
    contentHash: row.contentHash,
    redirectChain: row.redirectChain ?? [],
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
  };
}

function mapCollectionRun(row: typeof collectionRuns.$inferSelect): CollectionRunRecord {
  return {
    id: row.id,
    status: row.status as CollectionRunStatus,
    approvedSourceId: row.approvedSourceId,
    policyVersion: row.policyVersion,
    idempotencyKey: row.idempotencyKey,
    killSwitchObserved: row.killSwitchObserved,
    targetCount: row.targetCount,
    completedCount: row.completedCount,
    failedCount: row.failedCount,
    blockedCount: row.blockedCount,
    summary: (row.summary ?? {}) as Record<string, unknown>,
    requestedByUserId: row.requestedByUserId,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
  };
}

function mapApprovedSource(row: typeof approvedSources.$inferSelect): ApprovedSourceRecord {
  return {
    id: row.id,
    sourceKey: row.sourceKey,
    displayName: row.displayName,
    domains: row.domains ?? [],
    adapterType: row.adapterType,
    classification: row.classification,
    businessPurpose: row.businessPurpose,
    permittedOrganizationTypes: row.permittedOrganizationTypes ?? [],
    permittedFields: row.permittedFields ?? [],
    prohibitedFields: row.prohibitedFields ?? [],
    termsReviewStatus: row.termsReviewStatus,
    robotsBehavior: row.robotsBehavior,
    privacyReviewStatus: row.privacyReviewStatus,
    legalReviewStatus: row.legalReviewStatus,
    securityReviewStatus: row.securityReviewStatus,
    rateLimitPerMinute: row.rateLimitPerMinute,
    concurrencyLimit: row.concurrencyLimit,
    pageLimit: row.pageLimit,
    responseSizeLimitBytes: row.responseSizeLimitBytes,
    timeoutMs: row.timeoutMs,
    redirectPolicy: row.redirectPolicy,
    refreshIntervalHours: row.refreshIntervalHours,
    snapshotRetentionDays: row.snapshotRetentionDays,
    parserVersion: row.parserVersion,
    owner: row.owner,
    lifecycle: row.lifecycle,
    killSwitchActive: row.killSwitchActive,
    approvalEvidence: (row.approvalEvidence ?? {}) as Record<string, unknown>,
  };
}

export class PostgresPopulationRepository implements PopulationRepository {
  private lastImportId: string | null = null;

  constructor(private readonly db: Db) {}

  async findImportByIdempotency(key: string): Promise<PopulationImportRecord | null> {
    const row = one(
      await this.db
        .select()
        .from(populationImports)
        .where(eq(populationImports.idempotencyKey, key))
        .limit(1),
    );
    return row ? mapImport(row) : null;
  }

  async createImport(
    input: Omit<PopulationImportRecord, 'report'> & { report?: Record<string, unknown> },
  ): Promise<PopulationImportRecord> {
    const rows = await this.db
      .insert(populationImports)
      .values({
        id: input.id,
        populationSourceId: input.populationSourceId,
        status: input.status as typeof populationImports.$inferInsert.status,
        idempotencyKey: input.idempotencyKey,
        dryRun: input.dryRun,
        rowCount: input.rowCount,
        report: input.report ?? {},
      })
      .returning();
    const created = mapImport(required(rows[0], 'population_import_insert_failed'));
    this.lastImportId = created.id;
    return created;
  }

  async updateImport(
    id: string,
    patch: Partial<PopulationImportRecord>,
  ): Promise<PopulationImportRecord> {
    const report = patch.report;
    const acceptedCount =
      report && typeof report.acceptedCount === 'number' ? report.acceptedCount : undefined;
    const rejectedCount =
      report && typeof report.rejectedCount === 'number' ? report.rejectedCount : undefined;
    const matchedCount =
      report && typeof report.matchedCount === 'number' ? report.matchedCount : undefined;
    const createdCount =
      report && typeof report.createdCount === 'number' ? report.createdCount : undefined;
    const ambiguousCount =
      report && typeof report.ambiguousCount === 'number' ? report.ambiguousCount : undefined;

    const rows = await this.db
      .update(populationImports)
      .set({
        ...(patch.status !== undefined
          ? { status: patch.status as typeof populationImports.$inferInsert.status }
          : {}),
        ...(patch.dryRun !== undefined ? { dryRun: patch.dryRun } : {}),
        ...(patch.rowCount !== undefined ? { rowCount: patch.rowCount } : {}),
        ...(report !== undefined ? { report } : {}),
        ...(acceptedCount !== undefined ? { acceptedCount } : {}),
        ...(rejectedCount !== undefined ? { rejectedCount } : {}),
        ...(matchedCount !== undefined ? { matchedCount } : {}),
        ...(createdCount !== undefined ? { createdCount } : {}),
        ...(ambiguousCount !== undefined ? { ambiguousCount } : {}),
        ...(patch.status === 'committed' ? { committedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(populationImports.id, id))
      .returning();
    return mapImport(required(rows[0], 'population_import_not_found'));
  }

  async insertCandidates(
    candidates: Omit<RawCandidateRecord, 'id'>[],
  ): Promise<RawCandidateRecord[]> {
    if (candidates.length === 0) return [];
    const importId = this.lastImportId;
    const inserted = await this.db
      .insert(rawCandidates)
      .values(
        candidates.map((c) => ({
          populationImportId: importId,
          identityKey: c.identityKey,
          displayName: c.displayName,
          legalName: c.legalName,
          domain: c.domain,
          website: c.website,
          phone: c.phone,
          addressLine1: c.addressLine1,
          city: c.city,
          region: c.region,
          postalCode: c.postalCode,
          aliases: c.aliases,
          status: c.status as typeof rawCandidates.$inferInsert.status,
          organizationId: c.organizationId,
        })),
      )
      .returning();
    return inserted.map(mapCandidate);
  }

  async listCandidates(importId: string): Promise<RawCandidateRecord[]> {
    const rows = await this.db
      .select()
      .from(rawCandidates)
      .where(eq(rawCandidates.populationImportId, importId));
    return rows.map(mapCandidate);
  }
}

export class PostgresOrganizationLookup implements OrganizationLookupPort {
  constructor(private readonly db: Db) {}

  async findDuplicateCandidates(input: {
    domain?: string | null;
    displayName?: string | null;
    legalName?: string | null;
  }): Promise<DuplicateCandidate[]> {
    const domain = normalizeDomain(input.domain);
    const name = normalizeOrgName(input.displayName ?? input.legalName);
    const filters = [];
    if (domain) filters.push(eq(organizations.normalizedDomain, domain));
    if (name) filters.push(eq(organizations.normalizedName, name));
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
      aliases: [],
      phone: null,
      externalId: null,
    }));
  }

  async createOrganization(input: {
    displayName: string;
    legalName?: string | null;
    domain?: string | null;
  }): Promise<{ id: string }> {
    const normalizedName =
      normalizeOrgName(input.displayName) ??
      normalizeOrgName(input.legalName) ??
      input.displayName.trim().toLowerCase();
    const domain = normalizeDomain(input.domain);
    const rows = await this.db
      .insert(organizations)
      .values({
        displayName: input.displayName,
        legalName: input.legalName ?? null,
        normalizedName,
        domain: input.domain ?? domain,
        normalizedDomain: domain,
        prospectStage: 'raw',
        researchStatus: 'not_started',
        outreachStatus: 'not_started',
        dataFreshnessStatus: 'unknown',
        recordStatus: 'active',
      })
      .returning({ id: organizations.id });
    return { id: required(rows[0], 'organization_insert_failed').id };
  }

  async linkCandidate(candidateId: string, organizationId: string): Promise<void> {
    await this.db
      .update(rawCandidates)
      .set({
        organizationId,
        status: 'resolved',
        updatedAt: new Date(),
      })
      .where(eq(rawCandidates.id, candidateId));
  }
}

export class PostgresOutboxAdapter implements OutboxPort {
  constructor(private readonly db: Db) {}

  async insert(event: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.db
      .insert(outboxEvents)
      .values({
        aggregateType: mapAggregateType(event.aggregateType),
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        idempotencyKey: event.idempotencyKey,
        payload: event.payload,
        metadata: { logicalAggregateType: event.aggregateType },
        status: 'pending',
      })
      .onConflictDoNothing({ target: outboxEvents.idempotencyKey });
  }
}

export class PostgresClaimRepository implements ClaimRepository {
  constructor(private readonly db: Db) {}

  private async ensureSnapshotAndExtraction(input: {
    sourceSnapshotId: string;
    extractionRunId: string;
    organizationId: string;
    sourceUrl: string;
    extractorVersion: string;
    mappingVersion: string;
  }): Promise<void> {
    const existingSnapshot = one(
      await this.db
        .select({ id: sourceSnapshots.id })
        .from(sourceSnapshots)
        .where(eq(sourceSnapshots.id, input.sourceSnapshotId))
        .limit(1),
    );
    if (!existingSnapshot) {
      let domain = 'unknown.invalid';
      try {
        domain = new URL(input.sourceUrl).hostname.toLowerCase();
      } catch {
        // keep fallback domain
      }
      await this.db.insert(sourceSnapshots).values({
        id: input.sourceSnapshotId,
        organizationId: input.organizationId,
        requestedUrl: input.sourceUrl,
        finalUrl: input.sourceUrl,
        domain,
        adapterVersion: 'fixture-v1',
        policyVersion: 'collection-policy-v1',
        retrievedAt: new Date(),
        httpStatus: 200,
        contentType: 'text/html',
        contentHash: `stub:${input.sourceSnapshotId}`,
        parserVersion: 'v1',
        redirectChain: [],
      });
    }

    const existingRun = one(
      await this.db
        .select({ id: extractionRuns.id })
        .from(extractionRuns)
        .where(eq(extractionRuns.id, input.extractionRunId))
        .limit(1),
    );
    if (!existingRun) {
      await this.db.insert(extractionRuns).values({
        id: input.extractionRunId,
        sourceSnapshotId: input.sourceSnapshotId,
        extractorVersion: input.extractorVersion,
        mappingVersion: input.mappingVersion,
        status: 'completed',
        summary: { stub: true },
      });
    }
  }

  async insertProposals(
    proposals: Parameters<ClaimRepository['insertProposals']>[0],
  ): Promise<ClaimRecord[]> {
    if (proposals.length === 0) return [];
    const ensured = new Set<string>();
    for (const proposal of proposals) {
      const key = `${proposal.sourceSnapshotId}:${proposal.extractionRunId}`;
      if (ensured.has(key)) continue;
      await this.ensureSnapshotAndExtraction({
        sourceSnapshotId: proposal.sourceSnapshotId,
        extractionRunId: proposal.extractionRunId,
        organizationId: proposal.organizationId,
        sourceUrl: proposal.sourceUrl,
        extractorVersion: proposal.extractorVersion,
        mappingVersion: proposal.mappingVersion,
      });
      ensured.add(key);
    }
    const inserted = await this.db
      .insert(extractedClaims)
      .values(
        proposals.map((p) => ({
          extractionRunId: p.extractionRunId,
          organizationId: p.organizationId,
          variableKey: p.variableKey,
          originalExcerpt: p.originalExcerpt,
          proposedValue: p.proposedValue as object,
          sourceUrl: p.sourceUrl,
          sourceSnapshotId: p.sourceSnapshotId,
          extractorVersion: p.extractorVersion,
          mappingVersion: p.mappingVersion,
          confidenceComponents: p.confidenceComponents,
          explanation: p.explanation,
          affectedCompletenessPurposes: p.affectedCompletenessPurposes,
          affectedScores: p.affectedScores,
          reviewStatus: 'proposed' as const,
        })),
      )
      .returning();
    return inserted.map(mapClaim);
  }

  async get(id: string): Promise<ClaimRecord | null> {
    const row = one(
      await this.db.select().from(extractedClaims).where(eq(extractedClaims.id, id)).limit(1),
    );
    return row ? mapClaim(row) : null;
  }

  async updateReview(
    id: string,
    patch: Parameters<ClaimRepository['updateReview']>[1],
  ): Promise<ClaimRecord> {
    const rows = await this.db
      .update(extractedClaims)
      .set({
        reviewStatus: patch.reviewStatus,
        reviewedByUserId: patch.reviewedByUserId,
        reviewedAt: new Date(),
        reviewRationale: patch.rationale ?? null,
        ...(patch.correctedValue !== undefined
          ? { correctedValue: patch.correctedValue as object }
          : {}),
        ...(patch.canonicalEvidenceId !== undefined
          ? { canonicalEvidenceId: patch.canonicalEvidenceId }
          : {}),
        ...(patch.canonicalVariableValueId !== undefined
          ? { canonicalVariableValueId: patch.canonicalVariableValueId }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(extractedClaims.id, id))
      .returning();
    return mapClaim(required(rows[0], 'claim_not_found'));
  }
}

export class PostgresPriorityRepository implements PriorityRepository {
  constructor(private readonly db: Db) {}

  async save(organizationId: string, assessment: ResearchPriorityAssessment): Promise<void> {
    await this.db.insert(researchPriorityAssessments).values({
      organizationId,
      policyVersion: assessment.policyVersion,
      tier: assessment.tier,
      explanation: assessment.explanation,
      highImpactMissingVariables: assessment.highImpactMissingVariables,
      recommendedSources: assessment.recommendedSources,
      estimatedWork: assessment.estimatedWork,
      nextEligibleResearchAt: assessment.nextEligibleResearchDate
        ? new Date(assessment.nextEligibleResearchDate)
        : null,
      blockingReasons: assessment.blockingReasons,
      factors: {
        ...assessment.factors,
        productionActivationGated: assessment.productionActivationGated,
      },
      assessedAt: new Date(),
    });
  }
}

export class PostgresSnapshotRepository implements SnapshotRepository {
  constructor(private readonly db: Db) {}

  async insert(input: SnapshotInsertInput): Promise<SnapshotRecord> {
    const rows = await this.db
      .insert(sourceSnapshots)
      .values({
        id: input.id ?? randomUUID(),
        organizationId: input.organizationId ?? null,
        approvedSourceId: input.approvedSourceId ?? null,
        collectionJobId: input.collectionJobId ?? null,
        requestedUrl: input.requestedUrl,
        finalUrl: input.finalUrl,
        domain: input.domain,
        adapterVersion: input.adapterVersion,
        policyVersion: input.policyVersion,
        retrievedAt: input.retrievedAt,
        httpStatus: input.httpStatus ?? null,
        contentType: input.contentType ?? null,
        contentLength: input.contentLength ?? null,
        contentHash: input.contentHash,
        etag: input.etag ?? null,
        lastModified: input.lastModified ?? null,
        redirectChain: input.redirectChain ?? [],
        parserVersion: input.parserVersion,
        storageKey: input.storageKey ?? null,
        retentionExpiresAt: input.retentionExpiresAt ?? null,
        unchangedFromSnapshotId: input.unchangedFromSnapshotId ?? null,
      })
      .returning();
    return mapSnapshot(required(rows[0], 'snapshot_insert_failed'));
  }

  async getById(id: string): Promise<SnapshotRecord | null> {
    const row = one(
      await this.db.select().from(sourceSnapshots).where(eq(sourceSnapshots.id, id)).limit(1),
    );
    return row ? mapSnapshot(row) : null;
  }
}

export class PostgresExtractionRunRepository implements ExtractionRunRepository {
  constructor(private readonly db: Db) {}

  async insert(
    input: Parameters<ExtractionRunRepository['insert']>[0],
  ): Promise<ExtractionRunRecord> {
    const rows = await this.db
      .insert(extractionRuns)
      .values({
        id: input.id ?? randomUUID(),
        sourceSnapshotId: input.sourceSnapshotId,
        extractorVersion: input.extractorVersion,
        mappingVersion: input.mappingVersion,
        status: input.status ?? 'completed',
        summary: input.summary ?? {},
      })
      .returning();
    return mapExtractionRun(required(rows[0], 'extraction_run_insert_failed'));
  }
}

export class PostgresCollectionAttemptRepository implements CollectionAttemptRepository {
  constructor(private readonly db: Db) {}

  async insert(input: CollectionAttemptInsertInput): Promise<CollectionAttemptRecord> {
    const rows = await this.db
      .insert(collectionAttempts)
      .values({
        id: input.id ?? randomUUID(),
        collectionRunId: input.collectionRunId,
        collectionJobId: input.collectionJobId ?? null,
        organizationId: input.organizationId ?? null,
        approvedSourceId: input.approvedSourceId ?? null,
        requestedUrl: input.requestedUrl,
        finalUrl: input.finalUrl ?? null,
        domain: input.domain ?? null,
        status: input.status,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        httpStatus: input.httpStatus ?? null,
        contentHash: input.contentHash ?? null,
        redirectChain: input.redirectChain ?? [],
        startedAt: input.startedAt ?? null,
        completedAt: input.completedAt ?? null,
      })
      .returning();
    return mapAttempt(required(rows[0], 'collection_attempt_insert_failed'));
  }

  async update(
    id: string,
    patch: Parameters<CollectionAttemptRepository['update']>[1],
  ): Promise<CollectionAttemptRecord> {
    const rows = await this.db
      .update(collectionAttempts)
      .set({
        ...(patch.collectionJobId !== undefined ? { collectionJobId: patch.collectionJobId } : {}),
        ...(patch.organizationId !== undefined ? { organizationId: patch.organizationId } : {}),
        ...(patch.approvedSourceId !== undefined
          ? { approvedSourceId: patch.approvedSourceId }
          : {}),
        ...(patch.requestedUrl !== undefined ? { requestedUrl: patch.requestedUrl } : {}),
        ...(patch.finalUrl !== undefined ? { finalUrl: patch.finalUrl } : {}),
        ...(patch.domain !== undefined ? { domain: patch.domain } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
        ...(patch.errorMessage !== undefined ? { errorMessage: patch.errorMessage } : {}),
        ...(patch.httpStatus !== undefined ? { httpStatus: patch.httpStatus } : {}),
        ...(patch.contentHash !== undefined ? { contentHash: patch.contentHash } : {}),
        ...(patch.redirectChain !== undefined ? { redirectChain: patch.redirectChain } : {}),
        ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
        ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
      })
      .where(eq(collectionAttempts.id, id))
      .returning();
    return mapAttempt(required(rows[0], 'collection_attempt_not_found'));
  }
}

export class PostgresCollectionRunRepository implements CollectionRunRepository {
  constructor(private readonly db: Db) {}

  async create(
    input: Parameters<CollectionRunRepository['create']>[0],
  ): Promise<CollectionRunRecord> {
    const rows = await this.db
      .insert(collectionRuns)
      .values({
        id: input.id ?? randomUUID(),
        status: input.status ?? 'queued',
        approvedSourceId: input.approvedSourceId ?? null,
        policyVersion: input.policyVersion ?? 'collection-policy-v1',
        idempotencyKey: input.idempotencyKey,
        killSwitchObserved: input.killSwitchObserved ?? false,
        targetCount: input.targetCount ?? 0,
        summary: input.summary ?? {},
        requestedByUserId: input.requestedByUserId ?? null,
      })
      .returning();
    return mapCollectionRun(required(rows[0], 'collection_run_insert_failed'));
  }

  async get(id: string): Promise<CollectionRunRecord | null> {
    const row = one(
      await this.db.select().from(collectionRuns).where(eq(collectionRuns.id, id)).limit(1),
    );
    return row ? mapCollectionRun(row) : null;
  }

  async list(): Promise<CollectionRunRecord[]> {
    const rows = await this.db.select().from(collectionRuns);
    return rows.map(mapCollectionRun);
  }

  async updateStatus(
    id: string,
    status: CollectionRunStatus,
    patch: Parameters<CollectionRunRepository['updateStatus']>[2] = {},
  ): Promise<CollectionRunRecord> {
    const rows = await this.db
      .update(collectionRuns)
      .set({
        status,
        ...(patch.killSwitchObserved !== undefined
          ? { killSwitchObserved: patch.killSwitchObserved }
          : {}),
        ...(patch.completedCount !== undefined ? { completedCount: patch.completedCount } : {}),
        ...(patch.failedCount !== undefined ? { failedCount: patch.failedCount } : {}),
        ...(patch.blockedCount !== undefined ? { blockedCount: patch.blockedCount } : {}),
        ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
        ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
        ...(patch.cancelledAt !== undefined ? { cancelledAt: patch.cancelledAt } : {}),
        ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
        updatedAt: new Date(),
      })
      .where(eq(collectionRuns.id, id))
      .returning();
    return mapCollectionRun(required(rows[0], 'collection_run_not_found'));
  }

  async updateSummary(
    id: string,
    summary: Record<string, unknown>,
  ): Promise<CollectionRunRecord> {
    const rows = await this.db
      .update(collectionRuns)
      .set({ summary, updatedAt: new Date() })
      .where(eq(collectionRuns.id, id))
      .returning();
    return mapCollectionRun(required(rows[0], 'collection_run_not_found'));
  }
}

export class PostgresApprovedSourceRepository implements ApprovedSourceRepository {
  constructor(private readonly db: Db) {}

  async getByKey(sourceKey: string): Promise<ApprovedSourceRecord | null> {
    const row = one(
      await this.db
        .select()
        .from(approvedSources)
        .where(eq(approvedSources.sourceKey, sourceKey))
        .limit(1),
    );
    return row ? mapApprovedSource(row) : null;
  }

  async setKillSwitch(sourceKey: string, active: boolean): Promise<void> {
    await this.db
      .update(approvedSources)
      .set({ killSwitchActive: active, updatedAt: new Date() })
      .where(eq(approvedSources.sourceKey, sourceKey));
  }

  async getKillSwitch(sourceKey: string): Promise<boolean> {
    const row = one(
      await this.db
        .select({ killSwitchActive: approvedSources.killSwitchActive })
        .from(approvedSources)
        .where(eq(approvedSources.sourceKey, sourceKey))
        .limit(1),
    );
    return row?.killSwitchActive ?? false;
  }
}

export class PostgresRateLimitStateRepository implements RateLimitStateRepository {
  constructor(private readonly db: Db) {}

  async load(sourceId: string, domain: string): Promise<RateLimitState | null> {
    const row = one(
      await this.db
        .select()
        .from(sourceRateLimitStates)
        .where(
          and(
            eq(sourceRateLimitStates.approvedSourceId, sourceId),
            eq(sourceRateLimitStates.domain, domain),
          ),
        )
        .limit(1),
    );
    if (!row) return null;
    return {
      windowStartedAtMs: row.windowStartedAt.getTime(),
      requestCount: row.requestCount,
    };
  }

  async save(sourceId: string, domain: string, state: RateLimitState): Promise<void> {
    await this.db
      .insert(sourceRateLimitStates)
      .values({
        approvedSourceId: sourceId,
        domain,
        windowStartedAt: new Date(state.windowStartedAtMs),
        requestCount: state.requestCount,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [sourceRateLimitStates.approvedSourceId, sourceRateLimitStates.domain],
        set: {
          windowStartedAt: new Date(state.windowStartedAtMs),
          requestCount: state.requestCount,
          updatedAt: new Date(),
        },
      });
  }
}

export function createPostgresResearchUnitOfWork(
  db: Db,
  concurrency: ConcurrencyGatePort = new InProcessConcurrencyGate(),
): ResearchUnitOfWork {
  return {
    population: new PostgresPopulationRepository(db),
    claims: new PostgresClaimRepository(db),
    priority: new PostgresPriorityRepository(db),
    snapshots: new PostgresSnapshotRepository(db),
    extractionRuns: new PostgresExtractionRunRepository(db),
    collectionAttempts: new PostgresCollectionAttemptRepository(db),
    collectionRuns: new PostgresCollectionRunRepository(db),
    approvedSources: new PostgresApprovedSourceRepository(db),
    rateLimits: new PostgresRateLimitStateRepository(db),
    outbox: new PostgresOutboxAdapter(db),
    organizations: new PostgresOrganizationLookup(db),
    concurrency,
  };
}

export class PostgresTransactionRunner implements TransactionRunner {
  constructor(
    private readonly withTransaction: <T>(work: (tx: Db) => Promise<T>) => Promise<T>,
    private readonly concurrency: ConcurrencyGatePort = new InProcessConcurrencyGate(),
  ) {}

  async runInTransaction<T>(fn: (uow: ResearchUnitOfWork) => Promise<T>): Promise<T> {
    return this.withTransaction(async (tx) => {
      const uow = createPostgresResearchUnitOfWork(tx, this.concurrency);
      return fn(uow);
    });
  }
}
