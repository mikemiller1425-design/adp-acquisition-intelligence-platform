import type { DuplicateCandidate } from '@adp/collection';
import type { ResolutionDecision } from './entity-resolution.js';
import type { ResearchPriorityAssessment } from './research-priority.js';
import type { ExtractedClaimProposal } from './extraction.js';
import type { ClaimReviewStatus } from './claim-review.js';

export type PopulationImportRecord = {
  id: string;
  populationSourceId: string;
  status: string;
  idempotencyKey: string;
  dryRun: boolean;
  rowCount: number;
  report: Record<string, unknown>;
};

export type RawCandidateRecord = {
  id: string;
  identityKey: string;
  displayName: string | null;
  legalName: string | null;
  domain: string | null;
  website: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  aliases: string[];
  status: string;
  organizationId: string | null;
};

export type PopulationRepository = {
  findImportByIdempotency(key: string): Promise<PopulationImportRecord | null>;
  createImport(
    input: Omit<PopulationImportRecord, 'report'> & { report?: Record<string, unknown> },
  ): Promise<PopulationImportRecord>;
  updateImport(id: string, patch: Partial<PopulationImportRecord>): Promise<PopulationImportRecord>;
  insertCandidates(candidates: Omit<RawCandidateRecord, 'id'>[]): Promise<RawCandidateRecord[]>;
  listCandidates(importId: string): Promise<RawCandidateRecord[]>;
};

export type OrganizationLookupPort = {
  findDuplicateCandidates(input: {
    domain?: string | null;
    displayName?: string | null;
    legalName?: string | null;
  }): Promise<DuplicateCandidate[]>;
  createOrganization(input: {
    displayName: string;
    legalName?: string | null;
    domain?: string | null;
  }): Promise<{ id: string }>;
  linkCandidate(candidateId: string, organizationId: string): Promise<void>;
};

export type OutboxPort = {
  insert(event: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
};

export type EvidenceIntegrationPort = {
  createEvidenceFromAcceptedClaim(input: {
    organizationId: string;
    claim: string;
    excerpt: string;
    sourceUrl: string;
    snapshotId: string;
    actorUserId: string;
  }): Promise<{ evidenceId: string }>;
};

export type VariableIntegrationPort = {
  proposeFromAcceptedClaim(input: {
    organizationId: string;
    variableKey: string;
    value: unknown;
    evidenceId: string;
    actorUserId: string;
  }): Promise<{ variableValueId: string }>;
  /** Collectors must NEVER call confirm — only human review services after accept. */
};

export type ScoreRecalcPort = {
  requestRecalculation(organizationId: string, reason: string): Promise<void>;
};

export type RetrievalResponse = {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  etag: string | null;
  lastModified: string | null;
  redirectChain: string[];
};

export type RetrievalPort = {
  retrieve(
    url: string,
    options: { timeoutMs: number; maxBytes: number },
  ): Promise<RetrievalResponse>;
};

export type ClaimRecord = {
  id: string;
  organizationId: string;
  variableKey: string;
  reviewStatus: ClaimReviewStatus;
  proposedValue: unknown;
  originalExcerpt: string;
  sourceUrl: string;
  sourceSnapshotId: string;
};

export type ClaimRepository = {
  insertProposals(
    proposals: Array<
      ExtractedClaimProposal & {
        organizationId: string;
        sourceUrl: string;
        sourceSnapshotId: string;
        extractionRunId: string;
        extractorVersion: string;
        mappingVersion: string;
      }
    >,
  ): Promise<ClaimRecord[]>;
  get(id: string): Promise<ClaimRecord | null>;
  updateReview(
    id: string,
    patch: {
      reviewStatus: ClaimReviewStatus;
      reviewedByUserId: string;
      rationale?: string;
      correctedValue?: unknown;
      canonicalEvidenceId?: string;
      canonicalVariableValueId?: string;
    },
  ): Promise<ClaimRecord>;
};

export type PriorityRepository = {
  save(organizationId: string, assessment: ResearchPriorityAssessment): Promise<void>;
};

export type ResolutionWritePort = {
  saveDecision(input: {
    rawCandidateId: string;
    decision: ResolutionDecision;
    organizationId: string | null;
    matchConfidence: number;
    explanation: string;
  }): Promise<void>;
};

export type {
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
  UnitOfWorkPort,
} from './persistence-ports.js';
