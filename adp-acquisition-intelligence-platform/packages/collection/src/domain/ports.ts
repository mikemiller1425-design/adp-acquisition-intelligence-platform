import type {
  CollectionActor,
  CollectionCapability,
  DuplicateDisposition,
  DuplicateReview,
  ImportBatch,
  ImportDryRunReport,
  ImportRow,
  ImportRowStatus,
  MergeEvent,
} from './types.js';
import type { DuplicateCandidate } from './duplicate-matcher.js';
import type { MergeEntitySnapshot, MergePlan } from './merge-planner.js';
import type { ImportStatus } from './import-lifecycle.js';

export type CapabilityChecker = {
  assertCan(actor: CollectionActor, capability: CollectionCapability): Promise<void> | void;
};

export type ImportBatchRepository = {
  findById(id: string): Promise<ImportBatch | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<ImportBatch | null>;
  create(input: {
    originalFilename: string;
    storageKey: string;
    contentType: string;
    contentHash: string;
    fileSizeBytes: number;
    delimiter: string;
    idempotencyKey: string;
    rowCount: number;
    createdByUserId: string | null;
  }): Promise<ImportBatch>;
  updateStatus(
    id: string,
    status: ImportStatus,
    patch?: Partial<ImportBatch>,
  ): Promise<ImportBatch>;
  saveMapping(
    id: string,
    mapping: Record<string, string>,
    registryVersion: string,
  ): Promise<ImportBatch>;
  saveDryRunReport(id: string, report: ImportDryRunReport): Promise<ImportBatch>;
};

export type ImportRowRepository = {
  insertMany(rows: Array<Omit<ImportRow, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ImportRow[]>;
  listByBatch(batchId: string): Promise<ImportRow[]>;
  update(
    rowId: string,
    patch: Partial<
      Pick<
        ImportRow,
        | 'mapped'
        | 'normalized'
        | 'status'
        | 'errors'
        | 'createdOrganizationId'
        | 'createdContactId'
        | 'createdLocationId'
      >
    >,
  ): Promise<ImportRow>;
  updateManyStatus(rowIds: readonly string[], status: ImportRowStatus): Promise<void>;
};

export type DuplicateReviewRepository = {
  insertCandidates(
    rows: Array<{
      batchId: string;
      rowId: string;
      candidateOrganizationId: string;
      tier: string;
      features: unknown;
    }>,
  ): Promise<DuplicateReview[]>;
  listByBatch(batchId: string): Promise<DuplicateReview[]>;
  setDisposition(input: {
    reviewId: string;
    disposition: DuplicateDisposition;
    reviewedByUserId: string | null;
    reviewedAt: Date;
  }): Promise<DuplicateReview>;
};

export type DuplicateCandidateRepository = {
  findCandidates(input: DuplicateCandidate): Promise<DuplicateCandidate[]>;
};

export type CollectionOrganizationPort = {
  createOrganization(input: {
    displayName: string;
    legalName: string | null;
    normalizedName: string;
    domain: string | null;
    normalizedDomain: string | null;
    firmType: string | null;
    createdByUserId: string | null;
  }): Promise<{ id: string; recordVersion: number }>;
  createLocation(input: {
    organizationId: string;
    addressLine1: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    countryCode: string | null;
    phone: string | null;
    normalizedPhone: string | null;
    createdByUserId: string | null;
  }): Promise<{ id: string }>;
  createContact(input: {
    organizationId: string;
    primaryLocationId: string | null;
    displayName: string;
    email: string | null;
    normalizedEmail: string | null;
    phone: string | null;
    normalizedPhone: string | null;
    createdByUserId: string | null;
  }): Promise<{ id: string }>;
  archiveBatchOnlyOrganization(input: {
    organizationId: string;
    archivedByUserId: string | null;
    at: Date;
  }): Promise<void>;
};

export type EvidenceProposalPort = {
  recordImportEvidence(input: {
    subjectType: 'organization' | 'contact';
    organizationId: string | null;
    contactId: string | null;
    claim: string;
    payload: Record<string, unknown>;
    actor: CollectionActor;
    correlationId: string | null;
  }): Promise<{ evidenceRecordId: string | null }>;
};

export type VariableProposalPort = {
  proposeImportVariable(input: {
    subjectType: 'organization' | 'contact';
    organizationId: string | null;
    contactId: string | null;
    fieldKey: string;
    value: unknown;
    evidenceRecordId: string | null;
    actor: CollectionActor;
    correlationId: string | null;
  }): Promise<void>;
};

export type ObservationProposalPort = {
  proposeImportObservation(input: {
    subjectType: 'organization' | 'contact';
    organizationId: string | null;
    contactId: string | null;
    claim: string;
    proposedTypedValue: unknown;
    normalizedInterpretation: string | null;
    evidenceRecordId: string | null;
    actor: CollectionActor;
    correlationId: string | null;
  }): Promise<{ observationId: string | null }>;
};

export type ConsentImportPort = {
  preserveOrApplyImportConsent(input: {
    contactId: string;
    organizationId: string;
    channel: 'email' | 'phone' | 'linkedin';
    importedState: 'allowed' | 'unknown' | 'restricted' | 'opted_out' | null;
    actor: CollectionActor;
    evidenceRecordId: string | null;
  }): Promise<{ applied: boolean; reason: string }>;
};

export type CollectionAuditPort = {
  append(event: {
    actorUserId: string | null;
    action: string;
    subjectType: string;
    subjectId: string | null;
    correlationId: string | null;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

export type CollectionOutboxPort = {
  insert(event: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

export type TransactionPort = {
  withTransaction<T>(work: (ports: CollectionTransactionPorts) => Promise<T>): Promise<T>;
};

export type CollectionTransactionPorts = {
  batches: ImportBatchRepository;
  rows: ImportRowRepository;
  duplicates: DuplicateReviewRepository;
  organizations: CollectionOrganizationPort;
  mergeEvents: MergeEventRepository;
};

export type MergeEventRepository = {
  findByIdempotencyKey(idempotencyKey: string): Promise<MergeEvent | null>;
  createPreview(input: {
    survivorOrganizationId: string;
    duplicateOrganizationIds: string[];
    plan: MergePlan;
    idempotencyKey: string;
  }): Promise<MergeEvent>;
  approve(input: {
    mergeEventId: string;
    approvedByUserId: string | null;
    appliedAt: Date;
  }): Promise<MergeEvent>;
  markReversed(input: { mergeEventId: string; reversedAt: Date }): Promise<MergeEvent>;
};

export type MergeReadRepository = {
  getSnapshots(organizationIds: readonly string[]): Promise<MergeEntitySnapshot[]>;
  listPriorMergeEdges(): Promise<Array<{ fromOrganizationId: string; toOrganizationId: string }>>;
};

export type MergeWritePort = {
  applyMergePlan(plan: MergePlan, actor: CollectionActor): Promise<void>;
  reverseMerge(mergeEventId: string, actor: CollectionActor): Promise<void>;
};

export type MergeReversalReadPort = {
  getMergeReversalInput(mergeEventId: string): Promise<{
    mergeStatus: string;
    survivorTouchedAfterMerge: boolean;
    duplicateArchivedOnly: boolean;
    movedChildrenTouchedCount: number;
    wouldOrphanHistory: boolean;
  }>;
};
