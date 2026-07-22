import type { DatabaseClient } from '@adp/database';
import { contactChannelPermissions, contacts, organizations } from '@adp/database';
import {
  acquireTestDatabaseLock,
  createTestDatabaseClient,
  getTestDatabaseUrl,
  migrateTestDatabase,
  type TestDatabaseLock,
} from '@adp/database/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConsentPermissionService } from '../application/consent-permission-service.js';
import type { ContactPermissionInput } from '../domain/ports.js';
import { PostgresPermissionRepository } from '../infrastructure/postgres-permission-repository.js';

const testDatabaseUrl = getTestDatabaseUrl();
const evaluationTime = new Date('2026-07-22T00:00:00.000Z');
const effectiveAt = new Date('2026-07-01T00:00:00.000Z');

describe.sequential('consent postgres integration', () => {
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

  it('preserves permission records and applies corrections by supersession', async () => {
    const fixture = await createContactFixture(client, 'supersession');
    const service = new ConsentPermissionService(new PostgresPermissionRepository(client.db));

    const first = await service.assertContactChannelPermission(
      permissionInput(fixture.contactId, 'unknown', 'first-permission'),
    );
    const second = await service.assertContactChannelPermission(
      permissionInput(fixture.contactId, 'allowed', 'second-permission'),
    );

    const rows = await client.db
      .select()
      .from(contactChannelPermissions)
      .where(eq(contactChannelPermissions.contactId, fixture.contactId));
    const original = rows.find((row) => row.id === first.id);

    expect(rows).toHaveLength(2);
    expect(original?.state).toBe('unknown');
    expect(original?.supersededById).toBe(second.id);

    await expect(
      client.db
        .update(contactChannelPermissions)
        .set({ state: 'restricted' })
        .where(eq(contactChannelPermissions.id, second.id)),
    ).rejects.toSatisfy((error: unknown) => errorText(error).includes('immutable'));
  });

  it('lets global suppression override an otherwise allowed contact permission', async () => {
    const fixture = await createContactFixture(client, 'global-suppression');
    const service = new ConsentPermissionService(new PostgresPermissionRepository(client.db));

    await service.assertContactChannelPermission(
      permissionInput(fixture.contactId, 'allowed', 'allowed-contact'),
    );
    const suppression = await service.upsertSuppression({
      scope: 'global',
      channel: null,
      contactId: null,
      organizationId: null,
      identifierType: 'email_hash',
      identifierHash: 'global-suppression-hash',
      state: 'opted_out',
      source: 'policy',
      effectiveAt,
      expiresAt: null,
      revokedAt: null,
      capturedByUserId: null,
      reasonCode: 'global_dnc',
      reasonNote: null,
      evidenceRef: 'global-suppression-evidence',
    });

    const evaluation = await service.evaluateOutreachPermission({
      contactId: fixture.contactId,
      organizationId: fixture.organizationId,
      channel: 'email',
      at: evaluationTime,
    });

    expect(evaluation).toMatchObject({
      allowed: false,
      state: 'opted_out',
      rulingRule: 'global_suppression',
    });
    expect(evaluation.evidenceRefs).toContain('global-suppression-evidence');

    await service.revokeSuppression({
      suppressionId: suppression.id,
      revokedAt: evaluationTime,
      capturedByUserId: null,
    });
  });

  it('lets organization restrictions override allowed contact permission', async () => {
    const fixture = await createContactFixture(client, 'org-restriction');
    const service = new ConsentPermissionService(new PostgresPermissionRepository(client.db));

    await service.assertContactChannelPermission(
      permissionInput(fixture.contactId, 'allowed', 'org-allowed-contact'),
    );
    await service.setOrganizationRestriction({
      organizationId: fixture.organizationId,
      channel: null,
      state: 'restricted',
      source: 'admin',
      effectiveAt,
      expiresAt: null,
      revokedAt: null,
      capturedByUserId: null,
      reasonCode: 'firm_policy',
      reasonNote: null,
      evidenceRef: 'org-restriction-evidence',
    });

    const evaluation = await service.evaluateOutreachPermission({
      contactId: fixture.contactId,
      organizationId: fixture.organizationId,
      channel: 'email',
      at: evaluationTime,
    });

    expect(evaluation).toMatchObject({
      allowed: false,
      state: 'restricted',
      rulingRule: 'organization_restriction',
    });
    expect(evaluation.evidenceRefs).toContain('org-restriction-evidence');
  });

  it('treats expired permissions as inactive', async () => {
    const fixture = await createContactFixture(client, 'expired');
    const service = new ConsentPermissionService(new PostgresPermissionRepository(client.db));

    await service.assertContactChannelPermission({
      ...permissionInput(fixture.contactId, 'allowed', 'expired-permission'),
      expiresAt: new Date('2026-07-10T00:00:00.000Z'),
    });

    const evaluation = await service.evaluateOutreachPermission({
      contactId: fixture.contactId,
      organizationId: fixture.organizationId,
      channel: 'email',
      at: evaluationTime,
    });

    expect(evaluation).toMatchObject({
      allowed: false,
      state: 'unknown',
      rulingRule: 'unknown',
    });
  });

  it('resolves conflicting effective contact records restrictively', async () => {
    const fixture = await createContactFixture(client, 'conflict');
    const service = new ConsentPermissionService(new PostgresPermissionRepository(client.db));
    const expiresAt = new Date('2026-08-01T00:00:00.000Z');

    await client.db.insert(contactChannelPermissions).values([
      {
        contactId: fixture.contactId,
        channel: 'email',
        state: 'allowed',
        source: 'import',
        effectiveAt,
        expiresAt,
        revokedAt: null,
        supersededById: null,
        capturedByUserId: null,
        reasonCode: null,
        reasonNote: null,
        evidenceRef: 'allowed-conflict',
      },
      {
        contactId: fixture.contactId,
        channel: 'email',
        state: 'restricted',
        source: 'discovery',
        effectiveAt,
        expiresAt,
        revokedAt: null,
        supersededById: null,
        capturedByUserId: null,
        reasonCode: 'conflict',
        reasonNote: null,
        evidenceRef: 'restricted-conflict',
      },
    ]);

    const evaluation = await service.evaluateOutreachPermission({
      contactId: fixture.contactId,
      organizationId: fixture.organizationId,
      channel: 'email',
      at: evaluationTime,
    });

    expect(evaluation).toMatchObject({
      allowed: false,
      state: 'restricted',
      rulingRule: 'contact_channel_permission',
    });
    expect(evaluation.evidenceRefs).toEqual(
      expect.arrayContaining(['allowed-conflict', 'restricted-conflict']),
    );
  });
});

function permissionInput(
  contactId: string,
  state: ContactPermissionInput['state'],
  evidenceRef: string,
): ContactPermissionInput {
  return {
    contactId,
    channel: 'email',
    state,
    source: 'user_asserted',
    effectiveAt,
    expiresAt: null,
    revokedAt: null,
    capturedByUserId: null,
    reasonCode: null,
    reasonNote: null,
    evidenceRef,
  };
}

async function createContactFixture(
  client: DatabaseClient,
  suffix: string,
): Promise<{ organizationId: string; contactId: string }> {
  const organization = first(
    await client.db
      .insert(organizations)
      .values({
        displayName: `Consent ${suffix} Advisors`,
        normalizedName: `consent ${suffix} advisors`,
        normalizedDomain: `consent-${suffix}.example.com`,
      })
      .returning({ id: organizations.id }),
  );
  const contact = first(
    await client.db
      .insert(contacts)
      .values({
        organizationId: organization.id,
        displayName: `Consent ${suffix} Contact`,
        email: `consent-${suffix}@example.com`,
        normalizedEmail: `consent-${suffix}@example.com`,
      })
      .returning({ id: contacts.id }),
  );

  return { organizationId: organization.id, contactId: contact.id };
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Expected at least one row.');
  }
  return row;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n${errorText(error.cause)}`;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error ?? '');
}
