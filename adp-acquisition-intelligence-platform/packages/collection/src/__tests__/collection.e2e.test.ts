import { randomUUID } from 'node:crypto';

import { AllowAllMalwareScanPort, LocalPrivateObjectStorage } from '@adp/platform';
import { describe, expect, it } from 'vitest';

import {
  DuplicateReviewService,
  ImportCommitService,
  ImportDryRunService,
  ImportMappingService,
  ImportReportService,
  ImportReversalService,
  ImportUploadService,
  ImportValidationService,
} from '../index.js';
import {
  InMemoryBatchRepo,
  InMemoryConsentPort,
  InMemoryDuplicateCandidateRepo,
  InMemoryDuplicateRepo,
  InMemoryEvidencePort,
  InMemoryObservationPort,
  InMemoryOrgPort,
  InMemoryRowRepo,
  InMemoryVariablePort,
  admin,
  researcher,
  reviewer,
} from './support/fakes.js';

describe('collection e2e service flow', () => {
  it('imports 25+ organizations through duplicate review, commit, provenance, report, and reversal', async () => {
    const batches = new InMemoryBatchRepo();
    const rows = new InMemoryRowRepo();
    const duplicates = new InMemoryDuplicateRepo();
    const orgs = new InMemoryOrgPort();
    const evidence = new InMemoryEvidencePort();
    const observations = new InMemoryObservationPort();
    const variables = new InMemoryVariablePort();
    const consent = new InMemoryConsentPort();
    const storage = new LocalPrivateObjectStorage(`/tmp/adp-collection-e2e-${randomUUID()}`);
    const csv = buildE2eCsv(25);

    const upload = await new ImportUploadService(
      batches,
      rows,
      storage,
      new AllowAllMalwareScanPort(),
      { maxBytes: 250_000, maxRows: 100, maxColumns: 20, maxCellBytes: 2_000 },
    ).upload({
      actor: researcher,
      filename: 'prompt-4-e2e.csv',
      contentType: 'text/csv',
      bytes: new TextEncoder().encode(csv),
      idempotencyKey: 'prompt-4-e2e-upload',
    });
    expect(upload).toMatchObject({ status: 'mapping_required', rowCount: 29 });

    await new ImportMappingService(batches).applyMapping({
      actor: researcher,
      batchId: upload.id,
      mapping: {
        Company: 'organization.display_name',
        Domain: 'organization.domain',
        Address: 'location.address_line_1',
        City: 'location.city',
        Contact: 'contact.display_name',
        Email: 'contact.email',
        Consent: 'consent.email_state',
        Note: 'variable.import_note',
        Revenue: 'variable.estimated_contract_value',
      },
    });

    const validated = await new ImportValidationService(batches, rows).validate({
      actor: researcher,
      batchId: upload.id,
    });
    expect(validated.status).toBe('preview_ready');
    expect(
      (await rows.listByBatch(upload.id)).filter((row) => row.status === 'invalid'),
    ).toHaveLength(2);

    const duplicateSearch = new InMemoryDuplicateCandidateRepo((incoming) => {
      if (incoming.domain === 'exact.example') {
        return [
          {
            organizationId: orgs.existingOrganizationId,
            displayName: 'Exact HOA',
            domain: 'exact.example',
          },
        ];
      }
      if (incoming.displayName === 'Ambiguous HOA') {
        return [
          {
            organizationId: 'ambiguous-candidate',
            displayName: 'Ambiguous HOA',
            addressLine1: '5 Oak St',
            city: 'Denver',
          },
        ];
      }
      return [];
    });
    const dryRun = await new ImportDryRunService(batches, rows, duplicateSearch, duplicates).dryRun(
      {
        actor: researcher,
        batchId: upload.id,
      },
    );
    expect(dryRun.status).toBe('duplicate_review_required');
    expect((await duplicates.listByBatch(upload.id)).map((review) => review.tier).sort()).toEqual([
      'exact',
      'likely',
    ]);

    for (const review of await duplicates.listByBatch(upload.id)) {
      await new DuplicateReviewService(duplicates).setDisposition({
        actor: reviewer,
        reviewId: review.id,
        disposition: review.tier === 'exact' ? 'link_existing' : 'new_record',
      });
    }

    const commit = await new ImportCommitService(
      batches,
      rows,
      duplicates,
      orgs,
      evidence,
      variables,
      consent,
      observations,
    ).commit({
      actor: reviewer,
      batchId: upload.id,
      idempotencyKey: 'prompt-4-e2e-commit',
    });
    expect(commit).toMatchObject({ committedRows: 27, failedRows: 0, linkedExistingRows: 1 });
    expect(orgs.createdOrganizations).toHaveLength(26);
    expect(evidence.records).toHaveLength(27);
    expect(observations.observations).toHaveLength(27);
    expect(variables.proposals.length).toBeGreaterThanOrEqual(54);
    expect(evidence.records[0]?.payload).toMatchObject({ source: 'import' });
    expect(observations.observations[0]?.evidenceRecordId).toBeTruthy();
    expect(
      consent.decisions.every((decision) => decision.reason !== 'preserved_existing_restriction'),
    ).toBe(true);

    const secondCommit = await new ImportCommitService(
      batches,
      rows,
      duplicates,
      orgs,
      evidence,
      variables,
      consent,
      observations,
    ).commit({
      actor: reviewer,
      batchId: upload.id,
      idempotencyKey: 'prompt-4-e2e-commit',
    });
    expect(secondCommit.committedRows).toBe(27);
    expect(orgs.createdOrganizations).toHaveLength(26);

    const report = await new ImportReportService(batches, rows, duplicates).getReport({
      actor: reviewer,
      batchId: upload.id,
    });
    expect(report.rows).toHaveLength(29);
    expect(report.rows.some((row) => row.raw.Note === "'=formula")).toBe(true);
    expect(report.duplicates.every((review) => review.disposition !== null)).toBe(true);
    expect(
      (await rows.listByBatch(upload.id)).filter((row) => row.createdOrganizationId !== null),
    ).toHaveLength(26);

    const reversal = await new ImportReversalService(batches, rows, orgs).reverse({
      actor: admin,
      batchId: upload.id,
    });
    expect(reversal).toMatchObject({ eligible: true, reversedRows: 26 });
    expect(orgs.archivedIds).toHaveLength(26);
    expect((await batches.findById(upload.id))?.status).toBe('reverted');
  });
});

function buildE2eCsv(createCount: number): string {
  const lines = ['Company,Domain,Address,City,Contact,Email,Consent,Note,Revenue'];
  lines.push(
    'Exact HOA,exact.example,1 Main Street,Denver,Ella Exact,ella@exact.example,allowed,=formula,$1000',
  );
  lines.push(
    'Ambiguous HOA,,5 Oak Street,Denver,Alex Ambiguous,alex@ambiguous.example,restricted,needs followup,$2000',
  );
  for (let index = 0; index < createCount; index += 1) {
    lines.push(
      [
        `Prompt Org ${index}`,
        `prompt${index}.example`,
        `${index} Market Street`,
        'Denver',
        `Person ${index}`,
        `person${index}@prompt${index}.example`,
        index % 2 === 0 ? 'unknown' : 'restricted',
        `note ${index}`,
        `$${3000 + index}`,
      ].join(','),
    );
  }
  lines.push(
    ',missing.example,9 Broken Street,Denver,Broken Blank,blank@example.com,unknown,note,$10',
  );
  lines.push(
    'Broken Email,bad.example,10 Broken Street,Denver,Broken Email,not-an-email,unknown,note,$10',
  );
  return `${lines.join('\n')}\n`;
}
