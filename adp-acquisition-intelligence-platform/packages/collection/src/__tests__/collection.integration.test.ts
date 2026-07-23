import {
  acquireTestDatabaseLock,
  createTestDatabaseClient,
  migrateTestDatabase,
  type TestDatabaseLock,
} from '@adp/database/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DuplicateReviewService,
  ImportCommitService,
  ImportDryRunService,
  ImportMappingService,
  ImportReversalService,
  ImportValidationService,
  MergeReversalService,
  OrganizationMergeService,
} from '../index.js';
import type { MergePlan } from '../index.js';
import {
  PostgresImportBatchRepository,
  PostgresCollectionOrganizationPort,
  PostgresDuplicateReviewRepository,
  PostgresImportRowRepository,
} from '../infrastructure/postgres-repositories.js';
import {
  InMemoryAuditPort,
  InMemoryConsentPort,
  InMemoryDuplicateCandidateRepo,
  InMemoryEvidencePort,
  InMemoryMergeEventRepo,
  InMemoryMergeReadRepo,
  InMemoryMergeWritePort,
  InMemoryObservationPort,
  InMemoryOutboxPort,
  InMemoryVariablePort,
  StaticMergeReversalReadPort,
  admin,
  mergeSnapshot,
  researcher,
  reviewer,
} from './support/fakes.js';

describe('collection Postgres integration', () => {
  let lock: TestDatabaseLock;
  let client: ReturnType<typeof createTestDatabaseClient>;

  beforeAll(async () => {
    lock = await acquireTestDatabaseLock();
    const databaseUrl = await migrateTestDatabase({ reset: true });
    client = createTestDatabaseClient(databaseUrl);
  }, 60_000);

  afterAll(async () => {
    await client?.close();
    await lock?.release();
  });

  it('applies collection migration and persists batches/rows', async () => {
    const tableRows = await client.sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('import_batches', 'import_rows', 'import_entity_links', 'merge_events')
      order by table_name
    `;
    expect(tableRows.map((row) => row.table_name)).toEqual([
      'import_batches',
      'import_entity_links',
      'import_rows',
      'merge_events',
    ]);

    const batches = new PostgresImportBatchRepository(client.db);
    const rows = new PostgresImportRowRepository(client.db);
    const batch = await batches.create({
      originalFilename: 'sample.csv',
      storageKey: 'imports/key/sample.csv',
      contentType: 'text/csv',
      contentHash: 'hash',
      fileSizeBytes: 12,
      delimiter: ',',
      idempotencyKey: 'pg-upload',
      rowCount: 1,
      createdByUserId: null,
    });
    expect((await batches.findByIdempotencyKey('pg-upload'))?.id).toBe(batch.id);

    await rows.insertMany([
      {
        batchId: batch.id,
        rowNumber: 2,
        raw: { Company: 'Acme' },
        mapped: {},
        normalized: {},
        status: 'pending',
        errors: [],
        createdOrganizationId: null,
        createdContactId: null,
        createdLocationId: null,
      },
    ]);
    const persisted = await rows.listByBatch(batch.id);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.raw).toEqual({ Company: 'Acme' });

    await rows.update(persisted[0]?.id ?? '', {
      mapped: { 'organization.display_name': 'Acme' },
      normalized: { 'organization.display_name': 'acme' },
      status: 'valid',
      errors: [],
    });
    expect((await rows.listByBatch(batch.id))[0]?.status).toBe('valid');
  });

  it('runs mixed validation, dry-run, duplicate review blocking, commit, retry, and reversal with Postgres repositories', async () => {
    const batches = new PostgresImportBatchRepository(client.db);
    const rows = new PostgresImportRowRepository(client.db);
    const duplicates = new PostgresDuplicateReviewRepository(client.db);
    const organizations = new PostgresCollectionOrganizationPort(client.db);
    const evidence = new InMemoryEvidencePort();
    const observations = new InMemoryObservationPort();
    const variables = new InMemoryVariablePort();
    const consent = new InMemoryConsentPort();
    const audit = new InMemoryAuditPort();
    const outbox = new InMemoryOutboxPort();
    const existing = await organizations.createOrganization({
      displayName: 'PG Existing HOA',
      legalName: null,
      normalizedName: 'pg existing hoa',
      domain: 'pg-existing.example',
      normalizedDomain: 'pg-existing.example',
      firmType: null,
      createdByUserId: null,
    });
    const orgCountBeforeDryRun = await organizationCount();

    const batch = await batches.create({
      originalFilename: 'pg-service.csv',
      storageKey: 'imports/pg-service/pg-service.csv',
      contentType: 'text/csv',
      contentHash: 'pg-service-hash',
      fileSizeBytes: 200,
      delimiter: ',',
      idempotencyKey: `pg-service-${Date.now()}`,
      rowCount: 3,
      createdByUserId: null,
    });
    await batches.updateStatus(batch.id, 'mapping_required');
    await rows.insertMany([
      {
        batchId: batch.id,
        rowNumber: 2,
        raw: {
          Company: 'PG Existing HOA',
          Domain: 'pg-existing.example',
          Contact: 'Existing Contact',
          Email: 'existing@pg-existing.example',
          Consent: 'allowed',
          Note: 'linked',
        },
        mapped: {},
        normalized: {},
        status: 'pending',
        errors: [],
        createdOrganizationId: null,
        createdContactId: null,
        createdLocationId: null,
      },
      {
        batchId: batch.id,
        rowNumber: 3,
        raw: {
          Company: 'PG New HOA',
          Domain: `pg-new-${Date.now()}.example`,
          Contact: 'New Contact',
          Email: 'new@pg-new.example',
          Consent: 'restricted',
          Note: 'new variable',
        },
        mapped: {},
        normalized: {},
        status: 'pending',
        errors: [],
        createdOrganizationId: null,
        createdContactId: null,
        createdLocationId: null,
      },
      {
        batchId: batch.id,
        rowNumber: 4,
        raw: {
          Company: 'PG Broken HOA',
          Domain: 'pg-broken.example',
          Contact: 'Broken Contact',
          Email: 'not-an-email',
          Consent: 'unknown',
          Note: 'invalid',
        },
        mapped: {},
        normalized: {},
        status: 'pending',
        errors: [],
        createdOrganizationId: null,
        createdContactId: null,
        createdLocationId: null,
      },
    ]);

    await new ImportMappingService(batches).applyMapping({
      actor: researcher,
      batchId: batch.id,
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
      batchId: batch.id,
    });
    expect(validated.status).toBe('preview_ready');
    expect(
      (await rows.listByBatch(batch.id)).filter((row) => row.status === 'invalid'),
    ).toHaveLength(1);

    const duplicateRepo = new InMemoryDuplicateCandidateRepo((incoming) =>
      incoming.domain === 'pg-existing.example'
        ? [
            {
              organizationId: existing.id,
              displayName: 'PG Existing HOA',
              domain: 'pg-existing.example',
            },
          ]
        : [],
    );
    const dryRun = await new ImportDryRunService(batches, rows, duplicateRepo, duplicates).dryRun({
      actor: researcher,
      batchId: batch.id,
    });
    expect(dryRun.status).toBe('duplicate_review_required');
    expect(await organizationCount()).toBe(orgCountBeforeDryRun);

    await expect(
      new ImportCommitService(
        batches,
        rows,
        duplicates,
        organizations,
        evidence,
        variables,
        consent,
      ).commit({
        actor: reviewer,
        batchId: batch.id,
        idempotencyKey: 'pg-unresolved-commit',
      }),
    ).rejects.toThrow(/Duplicate reviews/);

    const [review] = await duplicates.listByBatch(batch.id);
    await new DuplicateReviewService(duplicates).setDisposition({
      actor: reviewer,
      reviewId: review?.id ?? '',
      disposition: 'link_existing',
    });
    const committed = await new ImportCommitService(
      batches,
      rows,
      duplicates,
      organizations,
      evidence,
      variables,
      consent,
      observations,
      undefined,
      audit,
      outbox,
    ).commit({
      actor: reviewer,
      batchId: batch.id,
      idempotencyKey: 'pg-commit',
    });
    expect(committed).toMatchObject({ committedRows: 2, failedRows: 0, linkedExistingRows: 1 });
    expect(evidence.records).toHaveLength(2);
    expect(observations.observations).toHaveLength(2);
    expect(variables.proposals).toHaveLength(2);
    expect(consent.decisions).toHaveLength(1);
    expect(audit.events).toEqual([expect.objectContaining({ action: 'import_committed' })]);
    expect(outbox.events).toEqual([
      expect.objectContaining({ eventType: 'collection.import_committed' }),
    ]);

    const createdRows = await rows.listByBatch(batch.id);
    expect(createdRows.filter((row) => row.createdOrganizationId !== null)).toHaveLength(1);
    const retry = await new ImportCommitService(
      batches,
      rows,
      duplicates,
      organizations,
      evidence,
      variables,
      consent,
      observations,
      undefined,
      audit,
      outbox,
    ).commit({
      actor: reviewer,
      batchId: batch.id,
      idempotencyKey: 'pg-commit',
    });
    expect(retry.committedRows).toBe(2);
    expect(await organizationCount()).toBe(orgCountBeforeDryRun + 1);

    const reversal = await new ImportReversalService(batches, rows, organizations).reverse({
      actor: admin,
      batchId: batch.id,
    });
    expect(reversal).toMatchObject({ eligible: true, reversedRows: 1 });
    expect((await batches.findById(batch.id))?.status).toBe('reverted');
  });

  it('applies merge child reassignment plans and handles safe or blocked merge reversal', async () => {
    const mergeReads = new InMemoryMergeReadRepo([
      mergeSnapshot('survivor', { contacts: 1 }),
      mergeSnapshot('duplicate', { contacts: 2, locations: 1, evidence: 1 }),
    ]);
    const mergeEvents = new InMemoryMergeEventRepo();
    const mergeWrites = new InMemoryMergeWritePort();
    const service = new OrganizationMergeService(mergeReads, mergeEvents, mergeWrites);
    const preview = await service.preview({
      actor: reviewer,
      survivorOrganizationId: 'survivor',
      duplicateOrganizationIds: ['duplicate'],
      idempotencyKey: 'pg-merge-service',
    });
    const approved = await service.approve({
      actor: reviewer,
      mergeEventId: preview.id,
      plan: preview.plan as MergePlan,
    });
    expect(approved.status).toBe('applied');
    expect(mergeWrites.appliedPlans[0]?.childReassignments).toContainEqual({
      childType: 'contacts',
      fromOrganizationId: 'duplicate',
      toOrganizationId: 'survivor',
      count: 2,
    });

    const safeReverse = await new MergeReversalService(
      new StaticMergeReversalReadPort({
        mergeStatus: 'applied',
        survivorTouchedAfterMerge: false,
        duplicateArchivedOnly: true,
        movedChildrenTouchedCount: 0,
        wouldOrphanHistory: false,
      }),
      mergeWrites,
      mergeEvents,
    ).reverse({ actor: admin, mergeEventId: preview.id });
    expect(safeReverse.eligible).toBe(true);
    expect(mergeWrites.reversedMergeEventIds).toEqual([preview.id]);

    const blockedReverse = await new MergeReversalService(
      new StaticMergeReversalReadPort({
        mergeStatus: 'applied',
        survivorTouchedAfterMerge: false,
        duplicateArchivedOnly: true,
        movedChildrenTouchedCount: 1,
        wouldOrphanHistory: false,
      }),
      mergeWrites,
      mergeEvents,
    ).reverse({ actor: admin, mergeEventId: preview.id });
    expect(blockedReverse).toMatchObject({
      eligible: false,
      blockers: ['moved_children_touched_after_merge'],
    });
  });

  async function organizationCount(): Promise<number> {
    const rows = await client.sql<
      { count: string }[]
    >`select count(*)::text as count from organizations`;
    return Number(rows[0]?.count ?? 0);
  }
});
