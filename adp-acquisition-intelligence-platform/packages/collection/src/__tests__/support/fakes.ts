import { randomUUID } from 'node:crypto';

import {
  type CollectionActor,
  type CollectionAuditPort,
  type CollectionOrganizationPort,
  type CollectionOutboxPort,
  type ConsentImportPort,
  type DuplicateCandidate,
  type DuplicateCandidateRepository,
  type DuplicateReview,
  type DuplicateReviewRepository,
  type EvidenceProposalPort,
  type ImportBatch,
  type ImportBatchRepository,
  type ImportRow,
  type ImportRowRepository,
  type MergeEntitySnapshot,
  type MergeEvent,
  type MergeEventRepository,
  type MergeReadRepository,
  type MergeReversalReadPort,
  type MergeWritePort,
  type ObservationProposalPort,
  type VariableProposalPort,
} from '../../index.js';

export const researcher: CollectionActor = { userId: null, roles: ['researcher'] };
export const reviewer: CollectionActor = { userId: null, roles: ['reviewer'] };
export const admin: CollectionActor = { userId: null, roles: ['admin'] };
export const sales: CollectionActor = { userId: null, roles: ['sales'] };

export class InMemoryBatchRepo implements ImportBatchRepository {
  batches = new Map<string, ImportBatch>();

  async findById(id: string) {
    return this.batches.get(id) ?? null;
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    return (
      [...this.batches.values()].find((batch) => batch.idempotencyKey === idempotencyKey) ?? null
    );
  }

  async create(input: Parameters<ImportBatchRepository['create']>[0]) {
    const now = new Date();
    const batch: ImportBatch = {
      id: randomUUID(),
      status: 'uploaded',
      originalFilename: input.originalFilename,
      storageKey: input.storageKey,
      contentType: input.contentType,
      idempotencyKey: input.idempotencyKey,
      mapping: null,
      registryVersion: null,
      dryRunReport: null,
      rowCount: input.rowCount,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
      committedAt: null,
      reversedAt: null,
    };
    this.batches.set(batch.id, batch);
    return batch;
  }

  async updateStatus(id: string, status: ImportBatch['status'], patch: Partial<ImportBatch> = {}) {
    const batch = this.require(id);
    Object.assign(batch, patch, { status, updatedAt: new Date() });
    return batch;
  }

  async saveMapping(id: string, mapping: Record<string, string>, registryVersion: string) {
    const batch = this.require(id);
    batch.mapping = mapping;
    batch.registryVersion = registryVersion;
    batch.status = 'mapped';
    batch.updatedAt = new Date();
    return batch;
  }

  async saveDryRunReport(id: string, report: ImportBatch['dryRunReport']) {
    const batch = this.require(id);
    batch.dryRunReport = report;
    batch.updatedAt = new Date();
    return batch;
  }

  private require(id: string) {
    const batch = this.batches.get(id);
    if (batch === undefined) throw new Error(`Missing batch ${id}`);
    return batch;
  }
}

export class InMemoryRowRepo implements ImportRowRepository {
  rows: ImportRow[] = [];

  async insertMany(rows: Array<Omit<ImportRow, 'id' | 'createdAt' | 'updatedAt'>>) {
    const now = new Date();
    const inserted = rows.map((row) => ({
      ...row,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    }));
    this.rows.push(...inserted);
    return inserted;
  }

  async listByBatch(batchId: string) {
    return this.rows
      .filter((row) => row.batchId === batchId)
      .sort((left, right) => left.rowNumber - right.rowNumber);
  }

  async update(rowId: string, patch: Parameters<ImportRowRepository['update']>[1]) {
    const row = this.rows.find((item) => item.id === rowId);
    if (row === undefined) throw new Error(`Missing row ${rowId}`);
    Object.assign(row, patch, { updatedAt: new Date() });
    return row;
  }

  async updateManyStatus(rowIds: readonly string[], status: ImportRow['status']) {
    const ids = new Set(rowIds);
    for (const row of this.rows) {
      if (ids.has(row.id)) row.status = status;
    }
  }
}

export class InMemoryDuplicateRepo implements DuplicateReviewRepository {
  reviews: DuplicateReview[] = [];

  async insertCandidates(input: Parameters<DuplicateReviewRepository['insertCandidates']>[0]) {
    const created: DuplicateReview[] = [];
    for (const candidate of input) {
      if (
        this.reviews.some(
          (review) =>
            review.rowId === candidate.rowId &&
            review.candidateOrganizationId === candidate.candidateOrganizationId,
        )
      ) {
        continue;
      }
      const review: DuplicateReview = {
        id: randomUUID(),
        ...candidate,
        disposition: null,
        reviewedByUserId: null,
        reviewedAt: null,
        createdAt: new Date(),
      };
      this.reviews.push(review);
      created.push(review);
    }
    return created;
  }

  async listByBatch(batchId: string) {
    return this.reviews.filter((review) => review.batchId === batchId);
  }

  async setDisposition(input: Parameters<DuplicateReviewRepository['setDisposition']>[0]) {
    const review = this.reviews.find((item) => item.id === input.reviewId);
    if (review === undefined) throw new Error(`Missing review ${input.reviewId}`);
    Object.assign(review, input);
    return review;
  }
}

export class InMemoryDuplicateCandidateRepo implements DuplicateCandidateRepository {
  constructor(
    private readonly find: (
      input: DuplicateCandidate,
    ) => DuplicateCandidate[] | Promise<DuplicateCandidate[]>,
  ) {}

  async findCandidates(input: DuplicateCandidate) {
    return this.find(input);
  }
}

export class InMemoryOrgPort implements CollectionOrganizationPort {
  existingOrganizationId = randomUUID();
  createdOrganizations: Array<
    Parameters<CollectionOrganizationPort['createOrganization']>[0] & { id: string }
  > = [];
  createdLocations: Array<
    Parameters<CollectionOrganizationPort['createLocation']>[0] & { id: string }
  > = [];
  createdContacts: Array<
    Parameters<CollectionOrganizationPort['createContact']>[0] & { id: string }
  > = [];
  archivedIds: string[] = [];

  async createOrganization(input: Parameters<CollectionOrganizationPort['createOrganization']>[0]) {
    const id = randomUUID();
    this.createdOrganizations.push({ ...input, id });
    return { id, recordVersion: 1 };
  }

  async createLocation(input: Parameters<CollectionOrganizationPort['createLocation']>[0]) {
    const id = randomUUID();
    this.createdLocations.push({ ...input, id });
    return { id };
  }

  async createContact(input: Parameters<CollectionOrganizationPort['createContact']>[0]) {
    const id = randomUUID();
    this.createdContacts.push({ ...input, id });
    return { id };
  }

  async archiveBatchOnlyOrganization(
    input: Parameters<CollectionOrganizationPort['archiveBatchOnlyOrganization']>[0],
  ) {
    this.archivedIds.push(input.organizationId);
  }
}

export class InMemoryEvidencePort implements EvidenceProposalPort {
  records: Array<Parameters<EvidenceProposalPort['recordImportEvidence']>[0]> = [];

  async recordImportEvidence(input: Parameters<EvidenceProposalPort['recordImportEvidence']>[0]) {
    this.records.push(input);
    return { evidenceRecordId: randomUUID() };
  }
}

export class InMemoryObservationPort implements ObservationProposalPort {
  observations: Array<Parameters<ObservationProposalPort['proposeImportObservation']>[0]> = [];

  async proposeImportObservation(
    input: Parameters<ObservationProposalPort['proposeImportObservation']>[0],
  ) {
    this.observations.push(input);
    return { observationId: randomUUID() };
  }
}

export class InMemoryVariablePort implements VariableProposalPort {
  proposals: Array<Parameters<VariableProposalPort['proposeImportVariable']>[0]> = [];

  async proposeImportVariable(input: Parameters<VariableProposalPort['proposeImportVariable']>[0]) {
    this.proposals.push(input);
  }
}

export class InMemoryConsentPort implements ConsentImportPort {
  decisions: Array<{ contactId: string; applied: boolean; reason: string }> = [];
  restrictedContactIds = new Set<string>();

  async preserveOrApplyImportConsent(
    input: Parameters<ConsentImportPort['preserveOrApplyImportConsent']>[0],
  ) {
    const decision =
      input.importedState === null
        ? { contactId: input.contactId, applied: false, reason: 'no_imported_consent' }
        : input.importedState === 'allowed' && this.restrictedContactIds.has(input.contactId)
          ? { contactId: input.contactId, applied: false, reason: 'preserved_existing_restriction' }
          : { contactId: input.contactId, applied: true, reason: 'applied_imported_state' };
    this.decisions.push(decision);
    return decision;
  }
}

export class InMemoryAuditPort implements CollectionAuditPort {
  events: Array<Parameters<CollectionAuditPort['append']>[0]> = [];

  async append(event: Parameters<CollectionAuditPort['append']>[0]) {
    this.events.push(event);
  }
}

export class InMemoryOutboxPort implements CollectionOutboxPort {
  events: Array<Parameters<CollectionOutboxPort['insert']>[0]> = [];

  async insert(event: Parameters<CollectionOutboxPort['insert']>[0]) {
    this.events.push(event);
  }
}

export class InMemoryMergeReadRepo implements MergeReadRepository {
  constructor(
    public snapshots: MergeEntitySnapshot[],
    public priorMergeEdges: Array<{ fromOrganizationId: string; toOrganizationId: string }> = [],
  ) {}

  async getSnapshots(organizationIds: readonly string[]) {
    const ids = new Set(organizationIds);
    return this.snapshots.filter((snapshot) => ids.has(snapshot.organizationId));
  }

  async listPriorMergeEdges() {
    return this.priorMergeEdges;
  }
}

export class InMemoryMergeEventRepo implements MergeEventRepository {
  events = new Map<string, MergeEvent>();

  async findByIdempotencyKey(idempotencyKey: string) {
    return (
      [...this.events.values()].find((event) => event.idempotencyKey === idempotencyKey) ?? null
    );
  }

  async createPreview(input: Parameters<MergeEventRepository['createPreview']>[0]) {
    const event: MergeEvent = {
      id: randomUUID(),
      survivorOrganizationId: input.survivorOrganizationId,
      duplicateOrganizationIds: input.duplicateOrganizationIds,
      plan: input.plan,
      status: 'previewed',
      idempotencyKey: input.idempotencyKey,
      approvedByUserId: null,
      appliedAt: null,
      reversedAt: null,
      createdAt: new Date(),
    };
    this.events.set(event.id, event);
    return event;
  }

  async approve(input: Parameters<MergeEventRepository['approve']>[0]) {
    const event = this.require(input.mergeEventId);
    event.status = 'applied';
    event.approvedByUserId = input.approvedByUserId;
    event.appliedAt = input.appliedAt;
    return event;
  }

  async markReversed(input: Parameters<MergeEventRepository['markReversed']>[0]) {
    const event = this.require(input.mergeEventId);
    event.status = 'reversed';
    event.reversedAt = input.reversedAt;
    return event;
  }

  private require(id: string) {
    const event = this.events.get(id);
    if (event === undefined) throw new Error(`Missing merge event ${id}`);
    return event;
  }
}

export class InMemoryMergeWritePort implements MergeWritePort {
  appliedPlans: Array<Parameters<MergeWritePort['applyMergePlan']>[0]> = [];
  reversedMergeEventIds: string[] = [];

  async applyMergePlan(plan: Parameters<MergeWritePort['applyMergePlan']>[0]) {
    this.appliedPlans.push(plan);
  }

  async reverseMerge(mergeEventId: string) {
    this.reversedMergeEventIds.push(mergeEventId);
  }
}

export class StaticMergeReversalReadPort implements MergeReversalReadPort {
  constructor(
    private readonly input: Awaited<ReturnType<MergeReversalReadPort['getMergeReversalInput']>>,
  ) {}

  async getMergeReversalInput() {
    return this.input;
  }
}

export function mergeSnapshot(
  organizationId: string,
  childCounts: Partial<MergeEntitySnapshot['childCounts']> = {},
  existingRelationshipFlag = false,
): MergeEntitySnapshot {
  return {
    organizationId,
    recordVersion: 1,
    existingRelationshipFlag,
    childCounts: {
      contacts: 0,
      locations: 0,
      evidence: 0,
      variableValues: 0,
      consentRecords: 0,
      ...childCounts,
    },
  };
}
