import { createHash } from 'node:crypto';

import type { MalwareScanPort, ObjectStoragePort } from '@adp/platform';
import { AppError } from '@adp/platform';

import { validateCsvArtifact, type CsvSecurityLimits, sanitizeReportCell } from '../domain/csv-security.js';
import {
  findDuplicateCandidates,
  MATCH_POLICY_VERSION,
  type DuplicateCandidate,
} from '../domain/duplicate-matcher.js';
import {
  embeddedFieldRegistry,
  loadFieldRegistry,
  lookupRegistryField,
  type FieldRegistry,
} from '../domain/field-registry.js';
import { transitionImportStatus } from '../domain/import-lifecycle.js';
import { planOrganizationMerge } from '../domain/merge-planner.js';
import { normalizeDomain, normalizeEmail, normalizeOrgName, normalizePhone } from '../domain/normalizers.js';
import { evaluateImportReversal, evaluateMergeReversal } from '../domain/reversal.js';
import { AllowListCollectionCapabilityChecker } from '../domain/authz.js';
import type {
  CapabilityChecker,
  CollectionAuditPort,
  CollectionOrganizationPort,
  CollectionOutboxPort,
  ConsentImportPort,
  DuplicateCandidateRepository,
  DuplicateReviewRepository,
  EvidenceProposalPort,
  ImportBatchRepository,
  ImportRowRepository,
  MergeEventRepository,
  MergeReadRepository,
  MergeReversalReadPort,
  MergeWritePort,
  TransactionPort,
  VariableProposalPort,
} from '../domain/ports.js';
import type {
  CollectionActor,
  DuplicateDisposition,
  ImportCommitReport,
  ImportDryRunReport,
  ImportRow,
} from '../domain/types.js';
import { parseCsvObjects } from '../infrastructure/csv-parser.js';
import { applyMappingToRawRow } from './import-row-normalization.js';

const defaultAuthz = new AllowListCollectionCapabilityChecker();

export class ManualEntryService {
  constructor(
    private readonly organizations: CollectionOrganizationPort,
    private readonly authz: CapabilityChecker = defaultAuthz,
  ) {}

  async preview(command: {
    actor: CollectionActor;
    organization: { displayName: string; legalName?: string | null; domain?: string | null; firmType?: string | null };
    location?: { addressLine1?: string | null; city?: string | null; region?: string | null; postalCode?: string | null; countryCode?: string | null; phone?: string | null };
    contact?: { displayName: string; email?: string | null; phone?: string | null };
  }) {
    await this.authz.assertCan(command.actor, 'manual_entry:create');
    return buildEntityInputs(command.organization, command.location, command.contact, command.actor.userId);
  }

  async confirm(command: Parameters<ManualEntryService['preview']>[0]) {
    const preview = await this.preview(command);
    const organization = await this.organizations.createOrganization(preview.organization);
    const location =
      preview.location === null
        ? null
        : await this.organizations.createLocation({
            ...preview.location,
            organizationId: organization.id,
          });
    const contact =
      preview.contact === null
        ? null
        : await this.organizations.createContact({
            ...preview.contact,
            organizationId: organization.id,
            primaryLocationId: location?.id ?? null,
          });
    return { organizationId: organization.id, locationId: location?.id ?? null, contactId: contact?.id ?? null };
  }
}

export class ImportUploadService {
  constructor(
    private readonly batches: ImportBatchRepository,
    private readonly rows: ImportRowRepository,
    private readonly storage: ObjectStoragePort,
    private readonly scanner: MalwareScanPort,
    private readonly limits: CsvSecurityLimits,
    private readonly authz: CapabilityChecker = defaultAuthz,
  ) {}

  async upload(command: {
    actor: CollectionActor;
    filename: string;
    contentType: string;
    bytes: Uint8Array;
    idempotencyKey: string;
  }) {
    await this.authz.assertCan(command.actor, 'import:upload');
    const existing = await this.batches.findByIdempotencyKey(command.idempotencyKey);
    if (existing !== null) return existing;
    const csv = validateCsvArtifact({
      filename: command.filename,
      contentType: command.contentType,
      bytes: command.bytes,
      limits: this.limits,
    });
    const scan = await this.scanner.scan({
      filename: csv.filename,
      contentType: csv.contentType,
      bytes: command.bytes,
    });
    if (scan.verdict !== 'allowed') {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'CSV upload failed malware scan',
        details: { reason: scan.reason },
      });
    }
    const storageKey = `imports/${command.idempotencyKey}/${csv.filename}`;
    await this.storage.putPrivate({
      key: storageKey,
      body: command.bytes,
      contentType: csv.contentType,
      metadata: { originalFilename: csv.filename },
    });
    const batch = await this.batches.create({
      originalFilename: csv.filename,
      storageKey,
      contentType: csv.contentType,
      contentHash: createHash('sha256').update(command.bytes).digest('hex'),
      fileSizeBytes: command.bytes.byteLength,
      delimiter: csv.delimiter,
      idempotencyKey: command.idempotencyKey,
      rowCount: Math.max(0, csv.rowCount - 1),
      createdByUserId: command.actor.userId,
    });
    const objects = await parseCsvObjects(csv.text, csv.delimiter);
    await this.rows.insertMany(
      objects.map((row) => ({
        batchId: batch.id,
        rowNumber: row.rowNumber,
        raw: row.raw,
        mapped: {},
        normalized: {},
        status: 'pending',
        errors: [],
        createdOrganizationId: null,
        createdContactId: null,
        createdLocationId: null,
      })),
    );
    return this.batches.updateStatus(
      batch.id,
      transitionImportStatus(batch.status, 'mapping_required', { hasArtifact: true }),
    );
  }
}

export class ImportMappingService {
  constructor(
    private readonly batches: ImportBatchRepository,
    private readonly authz: CapabilityChecker = defaultAuthz,
    private readonly registry: FieldRegistry = embeddedFieldRegistry,
  ) {}

  async applyMapping(command: {
    actor: CollectionActor;
    batchId: string;
    mapping: Record<string, string>;
    registryOverride?: unknown;
  }) {
    await this.authz.assertCan(command.actor, 'import:map');
    const batch = await requireBatch(this.batches, command.batchId);
    const registry = loadFieldRegistry(command.registryOverride ?? this.registry);
    const normalizedMapping: Record<string, string> = {};
    for (const [column, keyOrAlias] of Object.entries(command.mapping)) {
      const field = lookupRegistryField(registry, keyOrAlias);
      if (field === null) {
        throw new AppError({
          code: 'VALIDATION_FAILED',
          message: 'Column mapping references an unknown field',
          details: { column, keyOrAlias },
        });
      }
      normalizedMapping[column] = field.key;
    }
    transitionImportStatus(batch.status, 'mapped', { hasMapping: true });
    return this.batches.saveMapping(batch.id, normalizedMapping, registry.version);
  }
}

export class ImportValidationService {
  constructor(
    private readonly batches: ImportBatchRepository,
    private readonly rows: ImportRowRepository,
    private readonly authz: CapabilityChecker = defaultAuthz,
    private readonly registry: FieldRegistry = embeddedFieldRegistry,
  ) {}

  async validate(command: { actor: CollectionActor; batchId: string }) {
    await this.authz.assertCan(command.actor, 'import:validate');
    const batch = await requireBatch(this.batches, command.batchId);
    if (batch.mapping === null) throw validation('Import mapping is required');
    const registry = loadFieldRegistry(this.registry);
    const rowRecords = await this.rows.listByBatch(batch.id);
    let invalidRows = 0;
    for (const row of rowRecords) {
      const mapped = applyMappingToRawRow({ raw: row.raw, mapping: batch.mapping, registry });
      const status = mapped.errors.length === 0 ? 'valid' : 'invalid';
      if (status === 'invalid') invalidRows += 1;
      await this.rows.update(row.id, { ...mapped, status });
    }
    const validating = transitionImportStatus(batch.status, 'validating', { hasMapping: true });
    await this.batches.updateStatus(batch.id, validating);
    const validRows = rowRecords.length - invalidRows;
    const next = validRows > 0 ? 'preview_ready' : 'validation_failed';
    return this.batches.updateStatus(
      batch.id,
      transitionImportStatus(validating, next, {
        hasMapping: true,
        hasValidRows: validRows > 0,
        hasValidationErrors: invalidRows > 0,
      }),
    );
  }
}

export class ImportDryRunService {
  constructor(
    private readonly batches: ImportBatchRepository,
    private readonly rows: ImportRowRepository,
    private readonly duplicateCandidates: DuplicateCandidateRepository,
    private readonly duplicates: DuplicateReviewRepository,
    private readonly authz: CapabilityChecker = defaultAuthz,
  ) {}

  async dryRun(command: { actor: CollectionActor; batchId: string }) {
    await this.authz.assertCan(command.actor, 'import:dry_run');
    const batch = await requireBatch(this.batches, command.batchId);
    const rowRecords = (await this.rows.listByBatch(batch.id)).filter((row) => row.status === 'valid');
    let duplicateCount = 0;
    for (const row of rowRecords) {
      const incoming = duplicateInputFromRow(row);
      const candidates = await this.duplicateCandidates.findCandidates({
        ...incoming,
        organizationId: 'incoming',
      });
      const matches = findDuplicateCandidates(incoming, candidates);
      duplicateCount += matches.length;
      await this.duplicates.insertCandidates(
        matches.map((match) => ({
          batchId: batch.id,
          rowId: row.id,
          candidateOrganizationId: match.candidateOrganizationId,
          tier: match.tier,
          features: match.features,
        })),
      );
    }
    const report: ImportDryRunReport = {
      generatedAt: new Date().toISOString(),
      validRows: rowRecords.length,
      invalidRows: (await this.rows.listByBatch(batch.id)).filter((row) => row.status === 'invalid').length,
      duplicateCandidates: duplicateCount,
      duplicatePolicyVersion: MATCH_POLICY_VERSION,
      proposedCreates: {
        organizations: rowRecords.length,
        locations: rowRecords.filter((row) => row.normalized['location.address_line_1'] !== null).length,
        contacts: rowRecords.filter((row) => row.normalized['contact.display_name'] !== null).length,
        variableProposals: rowRecords.reduce(
          (sum, row) => sum + Object.keys(row.normalized).filter((key) => key.startsWith('variable.')).length,
          0,
        ),
      },
    };
    await this.batches.saveDryRunReport(batch.id, report);
    return this.batches.updateStatus(
      batch.id,
      transitionImportStatus(batch.status, duplicateCount > 0 ? 'duplicate_review_required' : 'ready_to_commit', {
        hasPreviewReport: true,
      }),
    );
  }
}

export class DuplicateReviewService {
  constructor(
    private readonly duplicates: DuplicateReviewRepository,
    private readonly authz: CapabilityChecker = defaultAuthz,
  ) {}

  async setDisposition(command: {
    actor: CollectionActor;
    reviewId: string;
    disposition: DuplicateDisposition;
  }) {
    await this.authz.assertCan(command.actor, 'duplicate:review');
    return this.duplicates.setDisposition({
      reviewId: command.reviewId,
      disposition: command.disposition,
      reviewedByUserId: command.actor.userId,
      reviewedAt: new Date(),
    });
  }
}

export class ImportCommitService {
  constructor(
    private readonly batches: ImportBatchRepository,
    private readonly rows: ImportRowRepository,
    private readonly duplicates: DuplicateReviewRepository,
    private readonly organizations: CollectionOrganizationPort,
    private readonly evidence: EvidenceProposalPort,
    private readonly variables: VariableProposalPort,
    private readonly consent: ConsentImportPort,
    private readonly authz: CapabilityChecker = defaultAuthz,
    private readonly audit?: CollectionAuditPort,
    private readonly outbox?: CollectionOutboxPort,
    private readonly transactions?: TransactionPort,
  ) {}

  async commit(command: {
    actor: CollectionActor;
    batchId: string;
    idempotencyKey: string;
    maxRowsPerTransaction?: number;
  }): Promise<ImportCommitReport> {
    await this.authz.assertCan(command.actor, 'import:commit');
    const batch = await requireBatch(this.batches, command.batchId);
    if (batch.status === 'committed') return this.reportForCommittedRows(batch.id);
    const duplicateReviews = await this.duplicates.listByBatch(batch.id);
    const unresolved = duplicateReviews.filter((review) => review.disposition === null);
    if (unresolved.length > 0) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Duplicate reviews must be resolved before commit',
        details: { unresolved: unresolved.length },
      });
    }
    const readyStatus =
      batch.status === 'duplicate_review_required'
        ? transitionImportStatus(batch.status, 'ready_to_commit', {
            hasUnresolvedDuplicates: false,
            hasPreviewReport: true,
          })
        : batch.status;
    if (readyStatus !== batch.status) {
      await this.batches.updateStatus(batch.id, readyStatus);
    }
    transitionImportStatus(readyStatus, 'committing', {
      hasUnresolvedDuplicates: false,
    });
    await this.batches.updateStatus(batch.id, 'committing');

    const work = async (ports?: {
      rows: ImportRowRepository;
      organizations: CollectionOrganizationPort;
      batches: ImportBatchRepository;
    }) =>
      this.commitRows({
        actor: command.actor,
        batchId: batch.id,
        idempotencyKey: command.idempotencyKey,
        maxRows: command.maxRowsPerTransaction ?? 500,
        duplicateReviews,
        rows: ports?.rows ?? this.rows,
        organizations: ports?.organizations ?? this.organizations,
      });
    const report =
      this.transactions === undefined
        ? await work()
        : await this.transactions.withTransaction((ports) =>
            work({ rows: ports.rows, organizations: ports.organizations, batches: ports.batches }),
          );
    await this.batches.updateStatus(batch.id, report.failedRows === 0 ? 'committed' : 'partially_committed', {
      committedAt: new Date(),
    });
    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'import_committed',
      subjectType: 'import_batch',
      subjectId: batch.id,
      correlationId: command.idempotencyKey,
      metadata: { committedRows: report.committedRows, failedRows: report.failedRows },
    });
    await this.outbox?.insert({
      aggregateType: 'import_batch',
      aggregateId: batch.id,
      eventType: 'collection.import_committed',
      idempotencyKey: command.idempotencyKey,
      payload: report as unknown as Record<string, unknown>,
      metadata: { envelopeVersion: 1 },
    });
    return report;
  }

  private async commitRows(input: {
    actor: CollectionActor;
    batchId: string;
    idempotencyKey: string;
    maxRows: number;
    duplicateReviews: Awaited<ReturnType<DuplicateReviewRepository['listByBatch']>>;
    rows: ImportRowRepository;
    organizations: CollectionOrganizationPort;
  }): Promise<ImportCommitReport> {
    const rows = (await input.rows.listByBatch(input.batchId)).filter((row) =>
      ['valid', 'failed'].includes(row.status),
    );
    const rowReports: ImportCommitReport['rowReports'] = [];
    let committedRows = 0;
    let linkedExistingRows = 0;
    let failedRows = 0;
    for (const row of rows.slice(0, input.maxRows)) {
      try {
        const review = input.duplicateReviews.find((item) => item.rowId === row.id);
        if (review?.disposition === 'skip' || review?.disposition === 'needs_research') {
          await input.rows.update(row.id, { status: 'duplicate_blocked' });
          rowReports.push({ rowId: row.id, status: 'duplicate_blocked', organizationId: null, contactId: null, errors: [] });
          continue;
        }
        const ids =
          review?.disposition === 'link_existing'
            ? { organizationId: review.candidateOrganizationId, locationId: null, contactId: null, linked: true }
            : await createEntitiesFromRow(row, input.actor, input.organizations);
        if (ids.linked) linkedExistingRows += 1;
        const evidenceRecord = await this.evidence.recordImportEvidence({
          subjectType: 'organization',
          organizationId: ids.organizationId,
          contactId: null,
          claim: 'Import source-derived organization row',
          payload: { rowId: row.id, normalized: row.normalized, source: 'import' },
          actor: input.actor,
          correlationId: input.idempotencyKey,
        });
        await proposeVariables(row, ids, evidenceRecord.evidenceRecordId, input.actor, input.idempotencyKey, this.variables);
        if (ids.contactId !== null) {
          await this.consent.preserveOrApplyImportConsent({
            contactId: ids.contactId,
            organizationId: ids.organizationId,
            channel: 'email',
            importedState: consentState(row),
            actor: input.actor,
            evidenceRecordId: evidenceRecord.evidenceRecordId,
          });
        }
        await input.rows.update(row.id, {
          status: 'committed',
          createdOrganizationId: ids.linked ? null : ids.organizationId,
          createdLocationId: ids.linked ? null : ids.locationId,
          createdContactId: ids.linked ? null : ids.contactId,
        });
        committedRows += 1;
        rowReports.push({ rowId: row.id, status: 'committed', organizationId: ids.organizationId, contactId: ids.contactId, errors: [] });
      } catch (error) {
        failedRows += 1;
        const message = error instanceof Error ? error.message : 'Unknown commit failure';
        await input.rows.update(row.id, { status: 'failed', errors: [message] });
        rowReports.push({ rowId: row.id, status: 'failed', organizationId: null, contactId: null, errors: [message] });
      }
    }
    return { batchId: input.batchId, committedRows, failedRows, linkedExistingRows, rowReports };
  }

  private async reportForCommittedRows(batchId: string): Promise<ImportCommitReport> {
    const rows = await this.rows.listByBatch(batchId);
    return {
      batchId,
      committedRows: rows.filter((row) => row.status === 'committed').length,
      failedRows: rows.filter((row) => row.status === 'failed').length,
      linkedExistingRows: rows.filter((row) => row.status === 'committed' && row.createdOrganizationId === null).length,
      rowReports: rows.map((row) => ({
        rowId: row.id,
        status: row.status,
        organizationId: row.createdOrganizationId,
        contactId: row.createdContactId,
        errors: row.errors,
      })),
    };
  }
}

export class ImportRetryService {
  constructor(
    private readonly rows: ImportRowRepository,
    private readonly authz: CapabilityChecker = defaultAuthz,
  ) {}

  async resetFailedRows(command: { actor: CollectionActor; batchId: string }) {
    await this.authz.assertCan(command.actor, 'import:commit');
    const failed = (await this.rows.listByBatch(command.batchId)).filter((row) => row.status === 'failed');
    await this.rows.updateManyStatus(
      failed.map((row) => row.id),
      'valid',
    );
    return { resetRows: failed.length };
  }
}

export class ImportReportService {
  constructor(
    private readonly batches: ImportBatchRepository,
    private readonly rows: ImportRowRepository,
    private readonly duplicates: DuplicateReviewRepository,
    private readonly authz: CapabilityChecker = defaultAuthz,
  ) {}

  async getReport(command: { actor: CollectionActor; batchId: string }) {
    await this.authz.assertCan(command.actor, 'import:report');
    const batch = await requireBatch(this.batches, command.batchId);
    const rows = await this.rows.listByBatch(batch.id);
    const duplicates = await this.duplicates.listByBatch(batch.id);
    return {
      batch,
      rows: rows.map((row) => ({
        ...row,
        raw: Object.fromEntries(Object.entries(row.raw).map(([key, value]) => [key, sanitizeReportCell(value)])),
        mapped: Object.fromEntries(Object.entries(row.mapped).map(([key, value]) => [key, sanitizeReportCell(value)])),
      })),
      duplicates,
    };
  }
}

export class ImportReversalService {
  constructor(
    private readonly batches: ImportBatchRepository,
    private readonly rows: ImportRowRepository,
    private readonly organizations: CollectionOrganizationPort,
    private readonly authz: CapabilityChecker = defaultAuthz,
  ) {}

  async preview(command: { actor: CollectionActor; batchId: string }) {
    await this.authz.assertCan(command.actor, 'import:reverse');
    const batch = await requireBatch(this.batches, command.batchId);
    const rows = await this.rows.listByBatch(batch.id);
    return evaluateImportReversal({
      batchStatus: batch.status,
      createdEntityCount: rows.filter((row) => row.createdOrganizationId !== null).length,
      touchedAfterImportCount: 0,
      hasExternalReferences: false,
      hasConsentWeakeningRisk: false,
    });
  }

  async reverse(command: { actor: CollectionActor; batchId: string }) {
    const eligibility = await this.preview(command);
    if (!eligibility.eligible) return eligibility;
    const batch = await requireBatch(this.batches, command.batchId);
    const rows = await this.rows.listByBatch(batch.id);
    for (const row of rows) {
      if (row.createdOrganizationId !== null) {
        await this.organizations.archiveBatchOnlyOrganization({
          organizationId: row.createdOrganizationId,
          archivedByUserId: command.actor.userId,
          at: new Date(),
        });
        await this.rows.update(row.id, { status: 'reversed' });
      }
    }
    await this.batches.updateStatus(batch.id, 'reverted', { reversedAt: new Date() });
    return { ...eligibility, reversedRows: rows.filter((row) => row.createdOrganizationId !== null).length };
  }
}

export class OrganizationMergeService {
  constructor(
    private readonly mergeReads: MergeReadRepository,
    private readonly mergeEvents: MergeEventRepository,
    private readonly mergeWrites: MergeWritePort,
    private readonly authz: CapabilityChecker = defaultAuthz,
  ) {}

  async preview(command: {
    actor: CollectionActor;
    survivorOrganizationId: string;
    duplicateOrganizationIds: string[];
    idempotencyKey: string;
  }) {
    await this.authz.assertCan(command.actor, 'merge:preview');
    const existing = await this.mergeEvents.findByIdempotencyKey(command.idempotencyKey);
    if (existing !== null) return existing;
    const snapshots = await this.mergeReads.getSnapshots([
      command.survivorOrganizationId,
      ...command.duplicateOrganizationIds,
    ]);
    const plan = planOrganizationMerge({
      survivorOrganizationId: command.survivorOrganizationId,
      duplicateOrganizationIds: command.duplicateOrganizationIds,
      snapshots,
      priorMergeEdges: await this.mergeReads.listPriorMergeEdges(),
      idempotencyKey: command.idempotencyKey,
    });
    return this.mergeEvents.createPreview({
      survivorOrganizationId: command.survivorOrganizationId,
      duplicateOrganizationIds: command.duplicateOrganizationIds,
      plan,
      idempotencyKey: command.idempotencyKey,
    });
  }

  async approve(command: {
    actor: CollectionActor;
    mergeEventId: string;
    plan: ReturnType<typeof planOrganizationMerge>;
  }) {
    await this.authz.assertCan(command.actor, 'merge:approve');
    await this.mergeWrites.applyMergePlan(command.plan, command.actor);
    return this.mergeEvents.approve({
      mergeEventId: command.mergeEventId,
      approvedByUserId: command.actor.userId,
      appliedAt: new Date(),
    });
  }
}

export class MergeReversalService {
  constructor(
    private readonly read: MergeReversalReadPort,
    private readonly writes: MergeWritePort,
    private readonly mergeEvents: MergeEventRepository,
    private readonly authz: CapabilityChecker = defaultAuthz,
  ) {}

  async preview(command: { actor: CollectionActor; mergeEventId: string }) {
    await this.authz.assertCan(command.actor, 'merge:reverse');
    const input = await this.read.getMergeReversalInput(command.mergeEventId);
    return evaluateMergeReversal(input);
  }

  async reverse(command: { actor: CollectionActor; mergeEventId: string }) {
    const eligibility = await this.preview(command);
    if (!eligibility.eligible) return eligibility;
    await this.writes.reverseMerge(command.mergeEventId, command.actor);
    await this.mergeEvents.markReversed({ mergeEventId: command.mergeEventId, reversedAt: new Date() });
    return eligibility;
  }
}

async function requireBatch(batches: ImportBatchRepository, batchId: string) {
  const batch = await batches.findById(batchId);
  if (batch === null) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Import batch not found', details: { batchId } });
  }
  return batch;
}

function validation(message: string): AppError {
  return new AppError({ code: 'VALIDATION_FAILED', message });
}

function duplicateInputFromRow(row: ImportRow): DuplicateCandidate {
  return {
    organizationId: 'incoming',
    displayName: stringValue(row.normalized['organization.display_name']),
    legalName: stringValue(row.normalized['organization.legal_name']),
    domain: stringValue(row.normalized['organization.domain']),
    externalId: stringValue(row.normalized['organization.external_id']),
    addressLine1: stringValue(row.normalized['location.address_line_1']),
    city: stringValue(row.normalized['location.city']),
    region: stringValue(row.normalized['location.region']),
    postalCode: stringValue(row.normalized['location.postal_code']),
    phone: stringValue(row.normalized['location.phone']),
    contactEmails: [stringValue(row.normalized['contact.email'])].filter((value): value is string => value !== null),
    contactPhones: [stringValue(row.normalized['contact.phone'])].filter((value): value is string => value !== null),
  };
}

function buildEntityInputs(
  organization: { displayName: string; legalName?: string | null; domain?: string | null; firmType?: string | null },
  location: { addressLine1?: string | null; city?: string | null; region?: string | null; postalCode?: string | null; countryCode?: string | null; phone?: string | null } | undefined,
  contact: { displayName: string; email?: string | null; phone?: string | null } | undefined,
  createdByUserId: string | null,
) {
  const displayName = normalizeOrgName(organization.displayName);
  if (displayName.normalized === null) throw validation('Organization display name is required');
  const domain = normalizeDomain(organization.domain ?? null);
  const phone = normalizePhone(location?.phone ?? null);
  const email = normalizeEmail(contact?.email ?? null);
  const contactPhone = normalizePhone(contact?.phone ?? null);
  return {
    organization: {
      displayName: organization.displayName.trim(),
      legalName: organization.legalName ?? null,
      normalizedName: displayName.normalized,
      domain: organization.domain ?? null,
      normalizedDomain: domain.normalized,
      firmType: organization.firmType ?? null,
      createdByUserId,
    },
    location:
      location === undefined
        ? null
        : {
            organizationId: '',
            addressLine1: location.addressLine1 ?? null,
            city: location.city ?? null,
            region: location.region ?? null,
            postalCode: location.postalCode ?? null,
            countryCode: location.countryCode ?? null,
            phone: location.phone ?? null,
            normalizedPhone: phone.normalized,
            createdByUserId,
          },
    contact:
      contact === undefined
        ? null
        : {
            organizationId: '',
            primaryLocationId: null,
            displayName: contact.displayName,
            email: contact.email ?? null,
            normalizedEmail: email.normalized,
            phone: contact.phone ?? null,
            normalizedPhone: contactPhone.normalized,
            createdByUserId,
          },
  };
}

async function createEntitiesFromRow(
  row: ImportRow,
  actor: CollectionActor,
  organizations: CollectionOrganizationPort,
): Promise<{ organizationId: string; locationId: string | null; contactId: string | null; linked: false }> {
  const orgName = stringValue(row.mapped['organization.display_name']);
  if (orgName === null) throw validation('Organization display name is required');
  const normalizedName = normalizeOrgName(orgName).normalized;
  if (normalizedName === null) throw validation('Organization display name is required');
  const org = await organizations.createOrganization({
    displayName: orgName,
    legalName: stringValue(row.mapped['organization.legal_name']),
    normalizedName,
    domain: stringValue(row.mapped['organization.domain']),
    normalizedDomain: stringValue(row.normalized['organization.domain']) ?? normalizeDomain(stringValue(row.mapped['organization.domain'])).normalized,
    firmType: stringValue(row.normalized['organization.firm_type']),
    createdByUserId: actor.userId,
  });
  const hasLocation = row.mapped['location.address_line_1'] !== undefined && row.mapped['location.address_line_1'] !== null;
  const location = hasLocation
    ? await organizations.createLocation({
        organizationId: org.id,
        addressLine1: stringValue(row.mapped['location.address_line_1']),
        city: stringValue(row.mapped['location.city']),
        region: stringValue(row.mapped['location.region']),
        postalCode: stringValue(row.mapped['location.postal_code']),
        countryCode: stringValue(row.normalized['location.country_code']),
        phone: stringValue(row.mapped['location.phone']),
        normalizedPhone: stringValue(row.normalized['location.phone']),
        createdByUserId: actor.userId,
      })
    : null;
  const contactName = stringValue(row.mapped['contact.display_name']);
  const contact =
    contactName === null
      ? null
      : await organizations.createContact({
          organizationId: org.id,
          primaryLocationId: location?.id ?? null,
          displayName: contactName,
          email: stringValue(row.mapped['contact.email']),
          normalizedEmail: stringValue(row.normalized['contact.email']),
          phone: stringValue(row.mapped['contact.phone']),
          normalizedPhone: stringValue(row.normalized['contact.phone']),
          createdByUserId: actor.userId,
        });
  return { organizationId: org.id, locationId: location?.id ?? null, contactId: contact?.id ?? null, linked: false };
}

async function proposeVariables(
  row: ImportRow,
  ids: { organizationId: string; contactId: string | null },
  evidenceRecordId: string | null,
  actor: CollectionActor,
  correlationId: string,
  variables: VariableProposalPort,
) {
  for (const [key, value] of Object.entries(row.normalized)) {
    if (!key.startsWith('variable.') || key.endsWith('.__original') || key.endsWith('.__blank')) continue;
    await variables.proposeImportVariable({
      subjectType: 'organization',
      organizationId: ids.organizationId,
      contactId: null,
      fieldKey: key,
      value,
      evidenceRecordId,
      actor,
      correlationId,
    });
  }
}

function consentState(row: ImportRow): 'allowed' | 'unknown' | 'restricted' | 'opted_out' | null {
  const value = row.normalized['consent.email_state'];
  if (value === 'allowed' || value === 'unknown' || value === 'restricted' || value === 'opted_out') return value;
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
