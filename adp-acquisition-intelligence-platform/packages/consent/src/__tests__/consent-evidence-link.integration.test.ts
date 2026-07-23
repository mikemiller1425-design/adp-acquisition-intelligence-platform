import type { DatabaseClient, RepositoryExecutor } from '@adp/database';
import {
  contacts,
  evidenceRecords,
  organizations,
  permissionEvidenceLinks,
  sources,
} from '@adp/database';
import {
  acquireTestDatabaseLock,
  createTestDatabaseClient,
  getTestDatabaseUrl,
  migrateTestDatabase,
  type TestDatabaseLock,
} from '@adp/database/testing';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConsentPermissionService } from '../application/consent-permission-service.js';
import type { ConsentEvidenceLinkPort } from '../domain/ports.js';
import { PostgresPermissionRepository } from '../infrastructure/postgres-permission-repository.js';

const testDatabaseUrl = getTestDatabaseUrl();

describe.sequential('consent evidence link integration', () => {
  let lock: TestDatabaseLock;
  let client: DatabaseClient;

  beforeAll(async () => {
    lock = await acquireTestDatabaseLock(testDatabaseUrl);
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    client = createTestDatabaseClient(testDatabaseUrl);
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await lock?.release();
  });

  it('attaches evidence_record_id to contact permissions without changing precedence', async () => {
    const fixture = await createFixture(client);
    const service = new ConsentPermissionService(
      new PostgresPermissionRepository(client.db),
      undefined,
      new LinkAdapter(client.db),
    );

    const permission = await service.assertContactChannelPermission({
      contactId: fixture.contactId,
      channel: 'email',
      state: 'allowed',
      source: 'user_asserted',
      effectiveAt: new Date('2026-07-01T00:00:00.000Z'),
      expiresAt: null,
      revokedAt: null,
      capturedByUserId: null,
      reasonCode: null,
      reasonNote: null,
      evidenceRef: 'legacy-human-readable-ref',
      evidenceRecordId: fixture.evidenceRecordId,
    });

    const evaluation = await service.evaluateOutreachPermission({
      contactId: fixture.contactId,
      organizationId: fixture.organizationId,
      channel: 'email',
      at: new Date('2026-07-22T00:00:00.000Z'),
    });
    const links = await client.db
      .select()
      .from(permissionEvidenceLinks)
      .where(eq(permissionEvidenceLinks.subjectId, permission.id));

    expect(evaluation).toMatchObject({ allowed: true, state: 'allowed' });
    expect(evaluation.evidenceRefs).toEqual(['legacy-human-readable-ref']);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      subjectType: 'contact_channel_permission',
      subjectId: permission.id,
      evidenceRecordId: fixture.evidenceRecordId,
    });
  });
});

class LinkAdapter implements ConsentEvidenceLinkPort {
  constructor(private readonly db: RepositoryExecutor) {}

  async link(input: Parameters<ConsentEvidenceLinkPort['link']>[0]): Promise<void> {
    await this.db.insert(permissionEvidenceLinks).values(input).onConflictDoNothing();
  }
}

async function createFixture(client: DatabaseClient) {
  const suffix = randomUUID();
  const organizationId = first(
    await client.db
      .insert(organizations)
      .values({
        displayName: `Consent Evidence ${suffix}`,
        normalizedName: `consent evidence ${suffix}`,
        normalizedDomain: `consent-evidence-${suffix}.example.com`,
        createdByUserId: null,
      })
      .returning({ id: organizations.id }),
  ).id;
  const contactId = first(
    await client.db
      .insert(contacts)
      .values({
        organizationId,
        displayName: 'Evidence Linked Contact',
        email: `evidence-${suffix}@example.com`,
        normalizedEmail: `evidence-${suffix}@example.com`,
        createdByUserId: null,
      })
      .returning({ id: contacts.id }),
  ).id;
  const sourceId = first(
    await client.db
      .insert(sources)
      .values({
        sourceType: 'user_entry',
        title: `Consent assertion ${suffix}`,
        locator: `consent://${suffix}`,
        defaultReliability: '1',
        createdByUserId: null,
        updatedByUserId: null,
      })
      .returning({ id: sources.id }),
  ).id;
  const evidenceRecordId = first(
    await client.db
      .insert(evidenceRecords)
      .values({
        subjectType: 'contact',
        contactId,
        organizationId: null,
        sourceId,
        claim: 'Contact granted email permission.',
        structuredPayload: { channel: 'email', state: 'allowed' },
        evidenceType: 'user_entered_fact',
        observedAt: new Date('2026-07-01T00:00:00.000Z'),
        contentHash: `consent-evidence-${suffix}`,
        actorUserId: null,
      })
      .returning({ id: evidenceRecords.id }),
  ).id;
  return { organizationId, contactId, evidenceRecordId };
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected at least one row');
  return row;
}
