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
import type { ResearchPriorityAssessment } from '../domain/research-priority.js';
import type { ExtractedClaimProposal } from '../domain/extraction.js';
import type { ClaimReviewStatus } from '../domain/claim-review.js';

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
  async createEvidenceFromAcceptedClaim() {
    return { evidenceId: crypto.randomUUID() };
  }
}

export class InMemoryVariableIntegration implements VariableIntegrationPort {
  async proposeFromAcceptedClaim() {
    return { variableValueId: crypto.randomUUID() };
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
