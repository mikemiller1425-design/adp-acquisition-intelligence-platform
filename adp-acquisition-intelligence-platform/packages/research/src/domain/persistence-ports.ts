import type { RateLimitState } from './rate-limit.js';
import type { ApprovedSourceLifecycle } from './approved-source.js';
import type {
  ClaimRepository,
  OrganizationLookupPort,
  OutboxPort,
  PopulationRepository,
  PriorityRepository,
} from './ports.js';

export type SnapshotRecord = {
  id: string;
  organizationId: string | null;
  approvedSourceId: string | null;
  collectionJobId: string | null;
  requestedUrl: string;
  finalUrl: string;
  domain: string;
  adapterVersion: string;
  policyVersion: string;
  retrievedAt: Date;
  httpStatus: number | null;
  contentType: string | null;
  contentLength: number | null;
  contentHash: string;
  etag: string | null;
  lastModified: string | null;
  redirectChain: string[];
  parserVersion: string;
  storageKey: string | null;
  retentionExpiresAt: Date | null;
  unchangedFromSnapshotId: string | null;
};

export type SnapshotInsertInput = {
  id?: string;
  organizationId?: string | null;
  approvedSourceId?: string | null;
  collectionJobId?: string | null;
  requestedUrl: string;
  finalUrl: string;
  domain: string;
  adapterVersion: string;
  policyVersion: string;
  retrievedAt: Date;
  httpStatus?: number | null;
  contentType?: string | null;
  contentLength?: number | null;
  contentHash: string;
  etag?: string | null;
  lastModified?: string | null;
  redirectChain?: string[];
  parserVersion: string;
  storageKey?: string | null;
  retentionExpiresAt?: Date | null;
  unchangedFromSnapshotId?: string | null;
};

export type SnapshotRepository = {
  insert(input: SnapshotInsertInput): Promise<SnapshotRecord>;
  getById(id: string): Promise<SnapshotRecord | null>;
};

export type ExtractionRunRecord = {
  id: string;
  sourceSnapshotId: string;
  extractorVersion: string;
  mappingVersion: string;
  status: string;
  summary: Record<string, unknown>;
};

export type ExtractionRunRepository = {
  insert(input: {
    id?: string;
    sourceSnapshotId: string;
    extractorVersion: string;
    mappingVersion: string;
    status?: string;
    summary?: Record<string, unknown>;
  }): Promise<ExtractionRunRecord>;
};

export type CollectionAttemptStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'cancelled';

export type CollectionAttemptRecord = {
  id: string;
  collectionRunId: string;
  collectionJobId: string | null;
  organizationId: string | null;
  approvedSourceId: string | null;
  requestedUrl: string;
  finalUrl: string | null;
  domain: string | null;
  status: CollectionAttemptStatus;
  errorCode: string | null;
  errorMessage: string | null;
  httpStatus: number | null;
  contentHash: string | null;
  redirectChain: string[];
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export type CollectionAttemptInsertInput = {
  id?: string;
  collectionRunId: string;
  collectionJobId?: string | null;
  organizationId?: string | null;
  approvedSourceId?: string | null;
  requestedUrl: string;
  finalUrl?: string | null;
  domain?: string | null;
  status: CollectionAttemptStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  httpStatus?: number | null;
  contentHash?: string | null;
  redirectChain?: string[];
  startedAt?: Date | null;
  completedAt?: Date | null;
};

export type CollectionAttemptRepository = {
  insert(input: CollectionAttemptInsertInput): Promise<CollectionAttemptRecord>;
  update(
    id: string,
    patch: Partial<Omit<CollectionAttemptRecord, 'id' | 'collectionRunId' | 'createdAt'>>,
  ): Promise<CollectionAttemptRecord>;
};

export type CollectionRunStatus =
  'draft' | 'queued' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed' | 'blocked';

export type CollectionRunRecord = {
  id: string;
  status: CollectionRunStatus;
  approvedSourceId: string | null;
  policyVersion: string;
  idempotencyKey: string;
  killSwitchObserved: boolean;
  targetCount: number;
  completedCount: number;
  failedCount: number;
  blockedCount: number;
  summary: Record<string, unknown>;
  requestedByUserId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
};

export type CollectionRunCreateInput = {
  id?: string;
  status?: CollectionRunStatus;
  approvedSourceId?: string | null;
  policyVersion?: string;
  idempotencyKey: string;
  killSwitchObserved?: boolean;
  targetCount?: number;
  requestedByUserId?: string | null;
  summary?: Record<string, unknown>;
};

export type CollectionRunRepository = {
  create(input: CollectionRunCreateInput): Promise<CollectionRunRecord>;
  get(id: string): Promise<CollectionRunRecord | null>;
  list(): Promise<CollectionRunRecord[]>;
  updateStatus(
    id: string,
    status: CollectionRunStatus,
    patch?: Partial<
      Pick<
        CollectionRunRecord,
        | 'killSwitchObserved'
        | 'completedCount'
        | 'failedCount'
        | 'blockedCount'
        | 'startedAt'
        | 'completedAt'
        | 'cancelledAt'
        | 'summary'
      >
    >,
  ): Promise<CollectionRunRecord>;
  updateSummary(id: string, summary: Record<string, unknown>): Promise<CollectionRunRecord>;
};

export type ApprovedSourceRecord = {
  id: string;
  sourceKey: string;
  displayName: string;
  domains: string[];
  adapterType: string;
  classification: string;
  businessPurpose: string;
  permittedOrganizationTypes: string[];
  permittedFields: string[];
  prohibitedFields: string[];
  termsReviewStatus: string;
  robotsBehavior: string;
  privacyReviewStatus: string;
  legalReviewStatus: string;
  securityReviewStatus: string;
  rateLimitPerMinute: number;
  concurrencyLimit: number;
  pageLimit: number;
  responseSizeLimitBytes: number;
  timeoutMs: number;
  redirectPolicy: string;
  refreshIntervalHours: number;
  snapshotRetentionDays: number;
  parserVersion: string;
  owner: string;
  lifecycle: ApprovedSourceLifecycle;
  killSwitchActive: boolean;
  approvalEvidence: Record<string, unknown>;
};

export type ApprovedSourceRepository = {
  getByKey(sourceKey: string): Promise<ApprovedSourceRecord | null>;
  setKillSwitch(sourceKey: string, active: boolean): Promise<void>;
  getKillSwitch(sourceKey: string): Promise<boolean>;
};

export type RateLimitStateRepository = {
  load(sourceId: string, domain: string): Promise<RateLimitState | null>;
  save(sourceId: string, domain: string, state: RateLimitState): Promise<void>;
};

export type ConcurrencyGatePort = {
  tryAcquire(sourceId: string, limit: number): Promise<boolean>;
  release(sourceId: string): Promise<void>;
};

/** Repositories bound to a single transactional executor. */
export type ResearchUnitOfWork = {
  population: PopulationRepository;
  claims: ClaimRepository;
  priority: PriorityRepository;
  snapshots: SnapshotRepository;
  extractionRuns: ExtractionRunRepository;
  collectionAttempts: CollectionAttemptRepository;
  collectionRuns: CollectionRunRepository;
  approvedSources: ApprovedSourceRepository;
  rateLimits: RateLimitStateRepository;
  outbox: OutboxPort;
  organizations: OrganizationLookupPort;
  concurrency: ConcurrencyGatePort;
};

export type UnitOfWorkPort = {
  runInTransaction<T>(fn: (uow: ResearchUnitOfWork) => Promise<T>): Promise<T>;
};

export type TransactionRunner = UnitOfWorkPort;
