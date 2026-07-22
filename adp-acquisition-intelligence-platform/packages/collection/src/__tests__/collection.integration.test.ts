import {
  acquireTestDatabaseLock,
  createTestDatabaseClient,
  migrateTestDatabase,
  type TestDatabaseLock,
} from '@adp/database/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PostgresImportBatchRepository,
  PostgresImportRowRepository,
} from '../infrastructure/postgres-repositories.js';

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
});
