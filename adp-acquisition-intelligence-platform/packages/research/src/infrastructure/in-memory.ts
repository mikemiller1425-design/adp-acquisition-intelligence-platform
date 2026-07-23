import type { DuplicateCandidate } from '@adp/collection';
import type {
  ClaimRecord,
  ClaimRepository,
  EvidenceIntegrationPort,
  OrganizationLookupPort,
  OutboxPort,
  PopulationImportRecord,
  PopulationRepository,
  PriorityRepository,
  RawCandidateRecord,
  ScoreRecalcPort,
  VariableIntegrationPort,
} from '../domain/ports.js';
import type {
  ApprovedSourceRecord,
  ApprovedSourceRepository,
  CollectionAttemptInsertInput,
  CollectionAttemptRecord,
  CollectionAttemptRepository,
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
import type { ResearchPriorityAssessment } from '../domain/research-priority.js';
import type { ExtractedClaimProposal } from '../domain/extraction.js';
import type { ClaimReviewStatus } from '../domain/claim-review.js';
import type { RateLimitState } from '../domain/rate-limit.js';
import { InProcessConcurrencyGate } from './concurrency-gate.js';

export class InMemoryOutbox implements OutboxPort {
  readonly events: Array<Record<string, unknown>> = [];
  async insert(event: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (this.events.some((e) => e.idempotencyKey === event.idempotencyKey)) return;
    this.events.push(event);
  }
}

export class InMemoryPopulationRepository implements PopulationRepository {
  imports = new Map<string, PopulationImportRecord>();
  byIdempotency = new Map<string, string>();
  candidates = new Map<string, RawCandidateRecord[]>();

  async findImportByIdempotency(key: string) {
    const id = this.byIdempotency.get(key);
    return id ? (this.imports.get(id) ?? null) : null;
  }

  async createImport(
    input: Omit<PopulationImportRecord, 'report'> & { report?: Record<string, unknown> },
  ) {
    const record: PopulationImportRecord = { ...input, report: input.report ?? {} };
    this.imports.set(record.id, record);
    this.byIdempotency.set(record.idempotencyKey, record.id);
    this.candidates.set(record.id, []);
    return record;
  }

  async updateImport(id: string, patch: Partial<PopulationImportRecord>) {
    const current = this.imports.get(id);
    if (!current) throw new Error('import_not_found');
    const next = { ...current, ...patch };
    this.imports.set(id, next);
    return next;
  }

  async insertCandidates(candidates: Omit<RawCandidateRecord, 'id'>[]) {
    const withIds = candidates.map((c) => ({ ...c, id: crypto.randomUUID() }));
    // attach to latest import heuristically via empty buckets — tests pass import via list
    const importId = [...this.imports.keys()].at(-1);
    if (importId) {
      this.candidates.set(importId, [...(this.candidates.get(importId) ?? []), ...withIds]);
    }
    return withIds;
  }

  async listCandidates(importId: string) {
    return this.candidates.get(importId) ?? [];
  }
}

export class InMemoryOrganizationLookup implements OrganizationLookupPort {
  orgs: DuplicateCandidate[] = [];
  links = new Map<string, string>();

  seed(orgs: DuplicateCandidate[]) {
    this.orgs = orgs;
  }

  async findDuplicateCandidates(input: {
    domain?: string | null;
    displayName?: string | null;
    legalName?: string | null;
  }) {
    void input;
    return this.orgs;
  }

  async createOrganization(input: {
    displayName: string;
    legalName?: string | null;
    domain?: string | null;
  }) {
    const id = crypto.randomUUID();
    this.orgs.push({
      organizationId: id,
      displayName: input.displayName,
      legalName: input.legalName ?? null,
      domain: input.domain ?? null,
    });
    return { id };
  }

  async linkCandidate(candidateId: string, organizationId: string) {
    this.links.set(candidateId, organizationId);
  }
}

export class InMemoryClaimRepository implements ClaimRepository {
  claims = new Map<string, ClaimRecord>();

  async insertProposals(
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
  ) {
    const records: ClaimRecord[] = proposals.map((p) => {
      const id = crypto.randomUUID();
      const record: ClaimRecord = {
        id,
        organizationId: p.organizationId,
        variableKey: p.variableKey,
        reviewStatus: 'proposed',
        proposedValue: p.proposedValue,
        originalExcerpt: p.originalExcerpt,
        sourceUrl: p.sourceUrl,
        sourceSnapshotId: p.sourceSnapshotId,
      };
      this.claims.set(id, record);
      return record;
    });
    return records;
  }

  async get(id: string) {
    return this.claims.get(id) ?? null;
  }

  async updateReview(
    id: string,
    patch: {
      reviewStatus: ClaimReviewStatus;
      reviewedByUserId: string;
      rationale?: string;
      correctedValue?: unknown;
      canonicalEvidenceId?: string;
      canonicalVariableValueId?: string;
    },
  ) {
    const current = this.claims.get(id);
    if (!current) throw new Error('claim_not_found');
    const next = { ...current, reviewStatus: patch.reviewStatus };
    this.claims.set(id, next);
    return next;
  }
}

export class InMemoryEvidenceIntegration implements EvidenceIntegrationPort {
  readonly records: Array<{ evidenceId: string; organizationId: string; claim: string }> = [];

  async createEvidenceFromAcceptedClaim(input: {
    organizationId: string;
    claim: string;
    excerpt: string;
    sourceUrl: string;
    snapshotId: string;
    actorUserId: string;
  }) {
    void input.excerpt;
    void input.sourceUrl;
    void input.snapshotId;
    void input.actorUserId;
    const evidenceId = crypto.randomUUID();
    this.records.push({
      evidenceId,
      organizationId: input.organizationId,
      claim: input.claim,
    });
    return { evidenceId };
  }
}

export class InMemoryVariableIntegration implements VariableIntegrationPort {
  readonly records: Array<{
    variableValueId: string;
    organizationId: string;
    variableKey: string;
    evidenceId: string;
  }> = [];

  async proposeFromAcceptedClaim(input: {
    organizationId: string;
    variableKey: string;
    value: unknown;
    evidenceId: string;
    actorUserId: string;
  }) {
    void input.value;
    void input.actorUserId;
    const variableValueId = crypto.randomUUID();
    this.records.push({
      variableValueId,
      organizationId: input.organizationId,
      variableKey: input.variableKey,
      evidenceId: input.evidenceId,
    });
    return { variableValueId };
  }
}

export class InMemoryScoreRecalc implements ScoreRecalcPort {
  requests: string[] = [];
  async requestRecalculation(organizationId: string) {
    this.requests.push(organizationId);
  }
}

export class InMemoryPriorityRepository implements PriorityRepository {
  assessments = new Map<string, ResearchPriorityAssessment>();
  async save(organizationId: string, assessment: ResearchPriorityAssessment) {
    this.assessments.set(organizationId, assessment);
  }
}

export class InMemorySnapshotRepository implements SnapshotRepository {
  snapshots = new Map<string, SnapshotRecord>();

  async insert(input: SnapshotInsertInput): Promise<SnapshotRecord> {
    const record: SnapshotRecord = {
      id: input.id ?? crypto.randomUUID(),
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
    };
    this.snapshots.set(record.id, record);
    return record;
  }

  async getById(id: string): Promise<SnapshotRecord | null> {
    return this.snapshots.get(id) ?? null;
  }
}

export class InMemoryExtractionRunRepository implements ExtractionRunRepository {
  runs = new Map<string, ExtractionRunRecord>();

  async insert(
    input: Parameters<ExtractionRunRepository['insert']>[0],
  ): Promise<ExtractionRunRecord> {
    const record: ExtractionRunRecord = {
      id: input.id ?? crypto.randomUUID(),
      sourceSnapshotId: input.sourceSnapshotId,
      extractorVersion: input.extractorVersion,
      mappingVersion: input.mappingVersion,
      status: input.status ?? 'completed',
      summary: input.summary ?? {},
    };
    this.runs.set(record.id, record);
    return record;
  }
}

export class InMemoryCollectionAttemptRepository implements CollectionAttemptRepository {
  attempts = new Map<string, CollectionAttemptRecord>();

  async insert(input: CollectionAttemptInsertInput): Promise<CollectionAttemptRecord> {
    const record: CollectionAttemptRecord = {
      id: input.id ?? crypto.randomUUID(),
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
      createdAt: new Date(),
    };
    this.attempts.set(record.id, record);
    return record;
  }

  async update(
    id: string,
    patch: Parameters<CollectionAttemptRepository['update']>[1],
  ): Promise<CollectionAttemptRecord> {
    const current = this.attempts.get(id);
    if (!current) throw new Error('collection_attempt_not_found');
    const next = { ...current, ...patch };
    this.attempts.set(id, next);
    return next;
  }
}

export class InMemoryCollectionRunRepository implements CollectionRunRepository {
  runs = new Map<string, CollectionRunRecord>();

  seed(run: CollectionRunRecord) {
    this.runs.set(run.id, run);
  }

  async create(
    input: Parameters<CollectionRunRepository['create']>[0],
  ): Promise<CollectionRunRecord> {
    const record: CollectionRunRecord = {
      id: input.id ?? crypto.randomUUID(),
      status: input.status ?? 'queued',
      approvedSourceId: input.approvedSourceId ?? null,
      policyVersion: input.policyVersion ?? 'collection-policy-v1',
      idempotencyKey: input.idempotencyKey,
      killSwitchObserved: input.killSwitchObserved ?? false,
      targetCount: input.targetCount ?? 0,
      completedCount: 0,
      failedCount: 0,
      blockedCount: 0,
      summary: input.summary ?? {},
      requestedByUserId: input.requestedByUserId ?? null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
    };
    this.runs.set(record.id, record);
    return record;
  }

  async get(id: string): Promise<CollectionRunRecord | null> {
    return this.runs.get(id) ?? null;
  }

  async list(): Promise<CollectionRunRecord[]> {
    return [...this.runs.values()];
  }

  async updateStatus(
    id: string,
    status: CollectionRunStatus,
    patch: Parameters<CollectionRunRepository['updateStatus']>[2] = {},
  ): Promise<CollectionRunRecord> {
    const current = this.runs.get(id);
    if (!current) throw new Error('collection_run_not_found');
    const next = { ...current, status, ...patch };
    this.runs.set(id, next);
    return next;
  }

  async updateSummary(id: string, summary: Record<string, unknown>): Promise<CollectionRunRecord> {
    const current = this.runs.get(id);
    if (!current) throw new Error('collection_run_not_found');
    const next = { ...current, summary };
    this.runs.set(id, next);
    return next;
  }
}

export class InMemoryApprovedSourceRepository implements ApprovedSourceRepository {
  sources = new Map<string, ApprovedSourceRecord>();

  seed(source: ApprovedSourceRecord) {
    this.sources.set(source.sourceKey, source);
  }

  async getByKey(sourceKey: string): Promise<ApprovedSourceRecord | null> {
    return this.sources.get(sourceKey) ?? null;
  }

  async setKillSwitch(sourceKey: string, active: boolean): Promise<void> {
    const current = this.sources.get(sourceKey);
    if (!current) return;
    this.sources.set(sourceKey, { ...current, killSwitchActive: active });
  }

  async getKillSwitch(sourceKey: string): Promise<boolean> {
    return this.sources.get(sourceKey)?.killSwitchActive ?? false;
  }
}

export class InMemoryRateLimitStateRepository implements RateLimitStateRepository {
  states = new Map<string, RateLimitState>();

  private key(sourceId: string, domain: string) {
    return `${sourceId}:${domain}`;
  }

  async load(sourceId: string, domain: string): Promise<RateLimitState | null> {
    return this.states.get(this.key(sourceId, domain)) ?? null;
  }

  async save(sourceId: string, domain: string, state: RateLimitState): Promise<void> {
    this.states.set(this.key(sourceId, domain), state);
  }
}

export function createInMemoryResearchUnitOfWork(
  concurrency: ConcurrencyGatePort = new InProcessConcurrencyGate(),
  evidence: EvidenceIntegrationPort = new InMemoryEvidenceIntegration(),
  variables: VariableIntegrationPort = new InMemoryVariableIntegration(),
): ResearchUnitOfWork {
  return {
    population: new InMemoryPopulationRepository(),
    claims: new InMemoryClaimRepository(),
    priority: new InMemoryPriorityRepository(),
    snapshots: new InMemorySnapshotRepository(),
    extractionRuns: new InMemoryExtractionRunRepository(),
    collectionAttempts: new InMemoryCollectionAttemptRepository(),
    collectionRuns: new InMemoryCollectionRunRepository(),
    approvedSources: new InMemoryApprovedSourceRepository(),
    rateLimits: new InMemoryRateLimitStateRepository(),
    outbox: new InMemoryOutbox(),
    organizations: new InMemoryOrganizationLookup(),
    concurrency,
    evidence,
    variables,
  };
}

export class InMemoryTransactionRunner implements TransactionRunner {
  constructor(private readonly uow: ResearchUnitOfWork) {}

  async runInTransaction<T>(fn: (uow: ResearchUnitOfWork) => Promise<T>): Promise<T> {
    const evidence = this.uow.evidence as Partial<InMemoryEvidenceIntegration>;
    const variables = this.uow.variables as Partial<InMemoryVariableIntegration>;
    const claims = this.uow.claims as InMemoryClaimRepository;
    const outbox = this.uow.outbox as InMemoryOutbox;

    const snapshot = {
      evidence: Array.isArray(evidence.records) ? evidence.records.map((r) => ({ ...r })) : null,
      variables: Array.isArray(variables.records)
        ? variables.records.map((r) => ({ ...r }))
        : null,
      claims: new Map([...claims.claims.entries()].map(([k, v]) => [k, { ...v }])),
      outbox: outbox.events.map((e) => ({ ...e })),
    };

    try {
      return await fn(this.uow);
    } catch (error) {
      if (snapshot.evidence && Array.isArray(evidence.records)) {
        evidence.records.length = 0;
        evidence.records.push(...snapshot.evidence);
      }
      if (snapshot.variables && Array.isArray(variables.records)) {
        variables.records.length = 0;
        variables.records.push(...snapshot.variables);
      }
      claims.claims.clear();
      for (const [k, v] of snapshot.claims) claims.claims.set(k, v);
      outbox.events.length = 0;
      outbox.events.push(...snapshot.outbox);
      throw error;
    }
  }
}
