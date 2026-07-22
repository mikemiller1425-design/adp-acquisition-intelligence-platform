import {
  acquireTestDatabaseLock,
  createTestDatabaseClient,
  getTestDatabaseUrl,
  migrateTestDatabase,
  type TestDatabaseLock,
} from '@adp/database/testing';
import type { DatabaseClient } from '@adp/database';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import { ContactService, OrganizationService } from '../application/organization-service.js';
import {
  PostgresContactRepository,
  PostgresOrganizationRepository,
} from '../infrastructure/postgres-repositories.js';

const testDatabaseUrl = getTestDatabaseUrl();

describe.sequential('organizations postgres integration', () => {
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

  it('creates, reads, updates, and archives core organization and contact records', async () => {
    const organizations = new PostgresOrganizationRepository(client.db);
    const contacts = new PostgresContactRepository(client.db);
    const organizationService = new OrganizationService(organizations);
    const contactService = new ContactService(contacts, organizations);

    const createdOrg = await organizationService.create({
      displayName: 'Repository Contract Advisors',
      normalizedName: 'repository contract advisors',
      normalizedDomain: 'repository-contract.example.com',
      createdByUserId: null,
    });
    expect(await organizations.findById(createdOrg.id)).toMatchObject({
      id: createdOrg.id,
      recordStatus: 'active',
      recordVersion: 1,
    });

    const updatedOrg = await organizationService.update({
      organizationId: createdOrg.id,
      expectedRecordVersion: createdOrg.recordVersion,
      patch: {
        displayName: 'Repository Contract Advisory',
        normalizedName: 'repository contract advisory',
        updatedByUserId: null,
      },
    });
    expect(updatedOrg).toMatchObject({
      displayName: 'Repository Contract Advisory',
      recordVersion: 2,
    });

    const createdContact = await contactService.create({
      organizationId: createdOrg.id,
      displayName: 'Jordan Repository',
      email: 'jordan.repository@example.com',
      normalizedEmail: 'jordan.repository@example.com',
      createdByUserId: null,
    });
    expect(await contacts.findById(createdContact.id)).toMatchObject({
      id: createdContact.id,
      status: 'active',
      recordVersion: 1,
    });

    const updatedContact = await contactService.update({
      contactId: createdContact.id,
      expectedRecordVersion: createdContact.recordVersion,
      patch: { displayName: 'Jordan Repo', updatedByUserId: null },
    });
    expect(updatedContact).toMatchObject({ displayName: 'Jordan Repo', recordVersion: 2 });

    const archivedContact = await contactService.archive({
      contactId: createdContact.id,
      expectedRecordVersion: updatedContact.recordVersion,
      archivedByUserId: null,
      at: new Date('2026-07-22T12:00:00.000Z'),
    });
    expect(archivedContact).toMatchObject({
      status: 'archived',
      recordVersion: 3,
    });

    const archivedOrg = await organizationService.archive({
      organizationId: createdOrg.id,
      expectedRecordVersion: updatedOrg.recordVersion,
      archivedByUserId: null,
      at: new Date('2026-07-22T12:30:00.000Z'),
    });
    expect(archivedOrg).toMatchObject({
      recordStatus: 'archived',
      recordVersion: 3,
    });

    await expect(
      organizationService.update({
        organizationId: archivedOrg.id,
        expectedRecordVersion: archivedOrg.recordVersion,
        patch: { displayName: 'Should Not Mutate' },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('documents that adapters do not authorize while services enforce business rules', async () => {
    const organizations = new PostgresOrganizationRepository(client.db);
    const contacts = new PostgresContactRepository(client.db);
    const organizationService = new OrganizationService(organizations);
    const contactService = new ContactService(contacts, organizations);

    const organization = await organizationService.create({
      displayName: 'Archived Boundary Advisors',
      normalizedName: 'archived boundary advisors',
      normalizedDomain: 'archived-boundary.example.com',
      createdByUserId: null,
    });
    const archived = await organizationService.archive({
      organizationId: organization.id,
      expectedRecordVersion: organization.recordVersion,
      archivedByUserId: null,
      at: new Date('2026-07-22T13:00:00.000Z'),
    });

    await expect(
      contactService.create({
        organizationId: archived.id,
        displayName: 'Blocked By Service',
        createdByUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const bypassed = await contacts.create({
      organizationId: archived.id,
      displayName: 'Bypassed Adapter Boundary',
      createdByUserId: null,
    });
    expect(bypassed).toMatchObject({
      organizationId: archived.id,
      status: 'active',
    });
  });
});
