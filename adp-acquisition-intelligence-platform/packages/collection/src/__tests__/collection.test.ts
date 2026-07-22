import { randomUUID } from 'node:crypto';

import { AllowAllMalwareScanPort, LocalPrivateObjectStorage } from '@adp/platform';
import { describe, expect, it } from 'vitest';

import {
  AllowListCollectionCapabilityChecker,
  DuplicateReviewService,
  ImportCommitService,
  ImportDryRunService,
  ImportMappingService,
  ImportReportService,
  ImportReversalService,
  ImportUploadService,
  ImportValidationService,
  MATCH_POLICY_VERSION,
  applyMappingToRawRow,
  embeddedFieldRegistry,
  evaluateImportReversal,
  evaluateMergeReversal,
  findDuplicateCandidates,
  loadFieldRegistry,
  normalizeBoolean,
  normalizeCurrency,
  normalizeDomain,
  normalizeEmail,
  normalizeOrgName,
  normalizePercentage,
  normalizePhone,
  normalizeRange,
  normalizeState,
  planOrganizationMerge,
  sanitizeReportCell,
  transitionImportStatus,
  validateCsvArtifact,
  type CollectionActor,
  type CollectionOrganizationPort,
  type DuplicateCandidate,
  type DuplicateReview,
  type DuplicateReviewRepository,
  type EvidenceProposalPort,
  type ImportBatch,
  type ImportBatchRepository,
  type ImportRow,
  type ImportRowRepository,
  type VariableProposalPort,
  type ConsentImportPort,
} from '../index.js';

const reviewer: CollectionActor = { userId: null, roles: ['reviewer'] };
const researcher: CollectionActor = { userId: null, roles: ['researcher'] };
const admin: CollectionActor = { userId: null, roles: ['admin'] };

describe('collection domain', () => {
  it('normalizes deterministic identity values without inventing blanks', () => {
    expect(normalizeOrgName('  Acme HOA, LLC ').normalized).toBe('acme hoa');
    expect(normalizeDomain('https://www.Example.com/path').normalized).toBe('example.com');
    expect(normalizeEmail(' Person@Example.COM ').normalized).toBe('person@example.com');
    expect(normalizePhone('(303) 555-0101').normalized).toBe('+13035550101');
    expect(normalizeState('Colorado').normalized).toBe('CO');
    expect(normalizeBoolean('yes').normalized).toBe(true);
    expect(normalizePercentage('25%').normalized).toBe(0.25);
    expect(normalizeCurrency('$1,200.50').normalized).toBe(1200.5);
    expect(normalizeRange('10 - 20').normalized).toEqual({ min: 10, max: 20 });
    expect(normalizeEmail('   ').normalized).toBeNull();
  });

  it('validates mappings and keeps blank distinct from unknown', () => {
    const registry = loadFieldRegistry();
    const mapped = applyMappingToRawRow({
      raw: { Company: 'Acme HOA', 'Email Consent': '' },
      mapping: {
        Company: 'organization.display_name',
        'Email Consent': 'consent.email_state',
      },
      registry,
    });
    expect(mapped.errors).toEqual([]);
    expect(mapped.mapped['consent.email_state']).toBeNull();
    expect(mapped.normalized['consent.email_state']).toBeNull();
    expect(mapped.normalized['consent.email_state.__blank']).toBe(true);
    expect(embeddedFieldRegistry.version).toContain('collection-field-registry');
  });

  it('guards lifecycle transitions and reversal eligibility', () => {
    expect(
      transitionImportStatus('validating', 'preview_ready', {
        hasMapping: true,
        hasValidRows: true,
        hasValidationErrors: true,
      }),
    ).toBe('preview_ready');
    expect(() => transitionImportStatus('uploaded', 'committed')).toThrow();
    expect(evaluateImportReversal({
      batchStatus: 'committed',
      createdEntityCount: 1,
      touchedAfterImportCount: 1,
      hasExternalReferences: false,
      hasConsentWeakeningRisk: false,
    })).toMatchObject({ eligible: false, manualRemediationRequired: true });
    expect(evaluateMergeReversal({
      mergeStatus: 'applied',
      survivorTouchedAfterMerge: false,
      duplicateArchivedOnly: true,
      movedChildrenTouchedCount: 0,
      wouldOrphanHistory: false,
    })).toMatchObject({ eligible: true });
  });

  it('returns explainable duplicate features without auto-merge', () => {
    const matches = findDuplicateCandidates(
      {
        displayName: 'Acme HOA LLC',
        domain: 'acme.example',
        addressLine1: '1 Main Street',
        city: 'Denver',
      },
      [
        {
          organizationId: 'org-1',
          displayName: 'Acme HOA',
          domain: 'https://www.acme.example',
          addressLine1: '1 Main St',
          city: 'Denver',
        },
      ],
    );
    expect(matches[0]?.tier).toBe('exact');
    expect(matches[0]?.matchPolicyVersion).toBe(MATCH_POLICY_VERSION);
    expect(matches[0]?.features.some((feature) => feature.key === 'normalized_domain')).toBe(true);
  });

  it('plans merges and rejects self/cycle merges', () => {
    const plan = planOrganizationMerge({
      survivorOrganizationId: 'survivor',
      duplicateOrganizationIds: ['duplicate'],
      snapshots: [
        snapshot('survivor', false, 0),
        snapshot('duplicate', false, 2),
      ],
      idempotencyKey: 'merge-key',
    });
    expect(plan.childReassignments).toContainEqual({
      childType: 'contacts',
      fromOrganizationId: 'duplicate',
      toOrganizationId: 'survivor',
      count: 2,
    });
    expect(() =>
      planOrganizationMerge({
        survivorOrganizationId: 'same',
        duplicateOrganizationIds: ['same'],
        snapshots: [snapshot('same', false, 0)],
        idempotencyKey: 'bad',
      }),
    ).toThrow();
  });

  it('rejects unsafe CSV uploads and sanitizes report formulas', () => {
    const limits = { maxBytes: 100, maxRows: 10, maxColumns: 5, maxCellBytes: 20 };
    expect(() =>
      validateCsvArtifact({
        filename: '../evil.csv',
        contentType: 'text/csv',
        bytes: new TextEncoder().encode('a\n1'),
        limits,
      }),
    ).toThrow();
    expect(() =>
      validateCsvArtifact({
        filename: 'file.csv',
        contentType: 'text/csv',
        bytes: new Uint8Array([0, 1, 2, 3, 4]),
        limits,
      }),
    ).toThrow();
    expect(() =>
      validateCsvArtifact({
        filename: 'file.csv',
        contentType: 'text/csv',
        bytes: new TextEncoder().encode('"unterminated'),
        limits,
      }),
    ).toThrow();
    expect(sanitizeReportCell('=IMPORTXML("x")')).toBe('\'=IMPORTXML("x")');
  });

  it('denies unauthorized capabilities', async () => {
    expect(() =>
      new AllowListCollectionCapabilityChecker().assertCan({ roles: ['sales'] }, 'merge:approve'),
    ).toThrow();
  });
});

describe('collection services e2e with fakes', () => {
  it('runs upload to dry-run, duplicate review, commit, report, and reversal for mixed rows', async () => {
    const batches = new InMemoryBatchRepo();
    const rows = new InMemoryRowRepo();
    const duplicates = new InMemoryDuplicateRepo();
    const orgs = new InMemoryOrgPort();
    const evidence = new InMemoryEvidencePort();
    const variables = new InMemoryVariablePort();
    const consent = new InMemoryConsentPort();
    const duplicateSearch = {
      async findCandidates(input: DuplicateCandidate): Promise<DuplicateCandidate[]> {
        return input.domain === 'existing.example'
          ? [
              {
                organizationId: orgs.existingOrganizationId,
                displayName: 'Existing HOA',
                domain: 'existing.example',
              },
            ]
          : [];
      },
    };
    const storage = new LocalPrivateObjectStorage(`/tmp/adp-collection-test-${randomUUID()}`);
    const csv = buildCsv(25);

    const upload = await new ImportUploadService(
      batches,
      rows,
      storage,
      new AllowAllMalwareScanPort(),
      { maxBytes: 100_000, maxRows: 100, maxColumns: 20, maxCellBytes: 1_000 },
    ).upload({
      actor: researcher,
      filename: 'mixed.csv',
      contentType: 'text/csv',
      bytes: new TextEncoder().encode(csv),
      idempotencyKey: 'upload-1',
    });
    expect(upload.status).toBe('mapping_required');
    expect((await new ImportUploadService(
      batches,
      rows,
      storage,
      new AllowAllMalwareScanPort(),
      { maxBytes: 100_000, maxRows: 100, maxColumns: 20, maxCellBytes: 1_000 },
    ).upload({
      actor: researcher,
      filename: 'mixed.csv',
      contentType: 'text/csv',
      bytes: new TextEncoder().encode(csv),
      idempotencyKey: 'upload-1',
    })).id).toBe(upload.id);

    await new ImportMappingService(batches).applyMapping({
      actor: researcher,
      batchId: upload.id,
      mapping: {
        Company: 'organization.display_name',
        Domain: 'organization.domain',
        Contact: 'contact.display_name',
        Email: 'contact.email',
        Consent: 'consent.email_state',
        Note: 'variable.import_note',
      },
    });
    const validated = await new ImportValidationService(batches, rows).validate({
      actor: researcher,
      batchId: upload.id,
    });
    expect(validated.status).toBe('preview_ready');
    expect((await rows.listByBatch(upload.id)).filter((row) => row.status === 'invalid')).toHaveLength(1);

    const dryRun = await new ImportDryRunService(
      batches,
      rows,
      duplicateSearch,
      duplicates,
    ).dryRun({ actor: researcher, batchId: upload.id });
    expect(dryRun.status).toBe('duplicate_review_required');

    const review = (await duplicates.listByBatch(upload.id))[0];
    expect(review).toBeDefined();
    await new DuplicateReviewService(duplicates).setDisposition({
      actor: reviewer,
      reviewId: (review as DuplicateReview).id,
      disposition: 'link_existing',
    });

    const commit = await new ImportCommitService(
      batches,
      rows,
      duplicates,
      orgs,
      evidence,
      variables,
      consent,
    ).commit({
      actor: reviewer,
      batchId: upload.id,
      idempotencyKey: 'commit-1',
    });
    expect(commit.committedRows).toBe(25);
    expect(commit.linkedExistingRows).toBe(1);
    expect(evidence.records.length).toBeGreaterThan(0);
    expect(variables.proposals.length).toBeGreaterThan(0);
    expect(consent.decisions.every((decision) => decision.reason !== 'weakened')).toBe(true);

    const report = await new ImportReportService(batches, rows, duplicates).getReport({
      actor: reviewer,
      batchId: upload.id,
    });
    expect(report.rows).toHaveLength(26);
    const reversal = await new ImportReversalService(batches, rows, orgs).reverse({
      actor: admin,
      batchId: upload.id,
    });
    expect(reversal.eligible).toBe(true);
    expect(orgs.archivedIds.length).toBeGreaterThan(0);
  });
});

function snapshot(organizationId: string, existingRelationshipFlag: boolean, contacts: number) {
  return {
    organizationId,
    recordVersion: 1,
    existingRelationshipFlag,
    childCounts: { contacts, locations: 0, evidence: 0, variableValues: 0, consentRecords: 0 },
  };
}

function buildCsv(count: number): string {
  const rows = ['Company,Domain,Contact,Email,Consent,Note'];
  rows.push('Existing HOA,existing.example,Jane Existing,jane@existing.example,allowed,=formula');
  for (let index = 0; index < count - 1; index += 1) {
    rows.push(`Org ${index},org${index}.example,Person ${index},person${index}@org${index}.example,unknown,note ${index}`);
  }
  rows.push('Broken,,No Email,not-an-email,unknown,note');
  return `${rows.join('\n')}\n`;
}

class InMemoryBatchRepo implements ImportBatchRepository {
  batches = new Map<string, ImportBatch>();

  async findById(id: string) {
    return this.batches.get(id) ?? null;
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    return [...this.batches.values()].find((batch) => batch.idempotencyKey === idempotencyKey) ?? null;
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
    const batch = this.batches.get(id);
    if (batch === undefined) throw new Error('missing batch');
    Object.assign(batch, patch, { status, updatedAt: new Date() });
    return batch;
  }

  async saveMapping(id: string, mapping: Record<string, string>, registryVersion: string) {
    const batch = this.batches.get(id);
    if (batch === undefined) throw new Error('missing batch');
    batch.mapping = mapping;
    batch.registryVersion = registryVersion;
    batch.status = 'mapped';
    return batch;
  }

  async saveDryRunReport(id: string, report: ImportBatch['dryRunReport']) {
    const batch = this.batches.get(id);
    if (batch === undefined) throw new Error('missing batch');
    batch.dryRunReport = report;
    return batch;
  }
}

class InMemoryRowRepo implements ImportRowRepository {
  rows: ImportRow[] = [];

  async insertMany(rows: Array<Omit<ImportRow, 'id' | 'createdAt' | 'updatedAt'>>) {
    const now = new Date();
    const inserted = rows.map((row) => ({ ...row, id: randomUUID(), createdAt: now, updatedAt: now }));
    this.rows.push(...inserted);
    return inserted;
  }

  async listByBatch(batchId: string) {
    return this.rows.filter((row) => row.batchId === batchId);
  }

  async update(rowId: string, patch: Parameters<ImportRowRepository['update']>[1]) {
    const row = this.rows.find((item) => item.id === rowId);
    if (row === undefined) throw new Error('missing row');
    Object.assign(row, patch, { updatedAt: new Date() });
    return row;
  }

  async updateManyStatus(rowIds: readonly string[], status: ImportRow['status']) {
    for (const row of this.rows) {
      if (rowIds.includes(row.id)) row.status = status;
    }
  }
}

class InMemoryDuplicateRepo implements DuplicateReviewRepository {
  reviews: DuplicateReview[] = [];

  async insertCandidates(input: Parameters<DuplicateReviewRepository['insertCandidates']>[0]) {
    const created = input.map((candidate) => ({
      id: randomUUID(),
      ...candidate,
      disposition: null,
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: new Date(),
    }));
    this.reviews.push(...created);
    return created;
  }

  async listByBatch(batchId: string) {
    return this.reviews.filter((review) => review.batchId === batchId);
  }

  async setDisposition(input: Parameters<DuplicateReviewRepository['setDisposition']>[0]) {
    const review = this.reviews.find((item) => item.id === input.reviewId);
    if (review === undefined) throw new Error('missing review');
    Object.assign(review, input);
    return review;
  }
}

class InMemoryOrgPort implements CollectionOrganizationPort {
  existingOrganizationId = randomUUID();
  organizations = new Set<string>([this.existingOrganizationId]);
  archivedIds: string[] = [];

  async createOrganization() {
    const id = randomUUID();
    this.organizations.add(id);
    return { id, recordVersion: 1 };
  }

  async createLocation() {
    return { id: randomUUID() };
  }

  async createContact() {
    return { id: randomUUID() };
  }

  async archiveBatchOnlyOrganization(input: { organizationId: string }) {
    this.archivedIds.push(input.organizationId);
  }
}

class InMemoryEvidencePort implements EvidenceProposalPort {
  records: unknown[] = [];

  async recordImportEvidence(input: Parameters<EvidenceProposalPort['recordImportEvidence']>[0]) {
    this.records.push(input);
    return { evidenceRecordId: randomUUID() };
  }
}

class InMemoryVariablePort implements VariableProposalPort {
  proposals: unknown[] = [];

  async proposeImportVariable(input: Parameters<VariableProposalPort['proposeImportVariable']>[0]) {
    this.proposals.push(input);
  }
}

class InMemoryConsentPort implements ConsentImportPort {
  decisions: Array<{ applied: boolean; reason: string }> = [];

  async preserveOrApplyImportConsent(input: Parameters<ConsentImportPort['preserveOrApplyImportConsent']>[0]) {
    const decision = input.importedState === 'allowed'
      ? { applied: false, reason: 'missing_is_not_allowed' }
      : { applied: input.importedState !== null, reason: 'preserved_restrictions' };
    this.decisions.push(decision);
    return decision;
  }
}
