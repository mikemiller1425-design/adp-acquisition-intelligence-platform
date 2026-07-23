import { AppError } from '@adp/platform';
import { describe, expect, it } from 'vitest';

import { ContactService, OrganizationService } from '../application/organization-service.js';
import { AccountAssignmentService } from '../application/territory-service.js';
import type {
  AccountAssignmentRepository,
  ContactRepository,
  CreateContactInput,
  CreateOrganizationInput,
  OrganizationRepository,
  TerritoryRepository,
  UpdateContactInput,
  UpdateOrganizationInput,
} from '../domain/ports.js';
import type { AccountAssignment, Contact, Organization, Territory } from '../domain/types.js';

const now = new Date('2026-07-22T00:00:00.000Z');

function org(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    legalName: null,
    displayName: 'Acme',
    normalizedName: 'acme',
    domain: null,
    normalizedDomain: null,
    firmType: null,
    prospectStage: 'raw',
    researchStatus: 'not_started',
    outreachStatus: 'not_started',
    dataFreshnessStatus: 'unknown',
    recordStatus: 'active',
    existingRelationshipFlag: false,
    recordVersion: 1,
    createdByUserId: null,
    updatedByUserId: null,
    archivedByUserId: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...overrides,
  };
}

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'contact-1',
    organizationId: 'org-1',
    primaryLocationId: null,
    firstName: null,
    lastName: null,
    displayName: 'Jane Doe',
    title: null,
    email: null,
    normalizedEmail: null,
    phone: null,
    normalizedPhone: null,
    linkedinUrl: null,
    status: 'active',
    recordVersion: 1,
    createdByUserId: null,
    updatedByUserId: null,
    archivedByUserId: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...overrides,
  };
}

class MemoryOrganizations implements OrganizationRepository {
  value: Organization | null = org();

  async findById(id: string): Promise<Organization | null> {
    return this.value?.id === id ? this.value : null;
  }

  async create(input: CreateOrganizationInput): Promise<Organization> {
    this.value = org({ ...input, id: 'created-org' });
    return this.value;
  }

  async updateIfVersion(
    id: string,
    expectedRecordVersion: number,
    input: UpdateOrganizationInput,
  ): Promise<Organization | null> {
    if (
      this.value === null ||
      this.value.id !== id ||
      this.value.recordVersion !== expectedRecordVersion ||
      this.value.recordStatus !== 'active'
    ) {
      return null;
    }
    this.value = {
      ...this.value,
      ...input,
      recordVersion: this.value.recordVersion + 1,
      updatedAt: now,
    };
    return this.value;
  }

  async archiveIfVersion(
    id: string,
    expectedRecordVersion: number,
    archivedByUserId: string | null,
    at: Date,
  ): Promise<Organization | null> {
    if (
      this.value === null ||
      this.value.id !== id ||
      this.value.recordVersion !== expectedRecordVersion ||
      this.value.recordStatus !== 'active'
    ) {
      return null;
    }
    this.value = {
      ...this.value,
      recordStatus: 'archived',
      archivedByUserId,
      archivedAt: at,
      recordVersion: this.value.recordVersion + 1,
    };
    return this.value;
  }
}

class MemoryContacts implements ContactRepository {
  value: Contact | null = contact();

  async findById(id: string): Promise<Contact | null> {
    return this.value?.id === id ? this.value : null;
  }

  async create(input: CreateContactInput): Promise<Contact> {
    this.value = contact({ ...input, id: 'created-contact' });
    return this.value;
  }

  async updateIfVersion(
    id: string,
    expectedRecordVersion: number,
    input: UpdateContactInput,
  ): Promise<Contact | null> {
    if (
      this.value === null ||
      this.value.id !== id ||
      this.value.recordVersion !== expectedRecordVersion ||
      this.value.status !== 'active'
    ) {
      return null;
    }
    this.value = { ...this.value, ...input, recordVersion: this.value.recordVersion + 1 };
    return this.value;
  }

  async archiveIfVersion(
    id: string,
    expectedRecordVersion: number,
    archivedByUserId: string | null,
    at: Date,
  ): Promise<Contact | null> {
    if (
      this.value === null ||
      this.value.id !== id ||
      this.value.recordVersion !== expectedRecordVersion ||
      this.value.status !== 'active'
    ) {
      return null;
    }
    this.value = {
      ...this.value,
      status: 'archived',
      archivedByUserId,
      archivedAt: at,
      recordVersion: this.value.recordVersion + 1,
    };
    return this.value;
  }
}

class MemoryTerritories implements TerritoryRepository {
  territory: Territory | null = {
    id: 'territory-1',
    code: 'NE',
    name: 'North East',
    description: null,
    parentTerritoryId: null,
    status: 'active',
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };

  async findById(id: string): Promise<Territory | null> {
    return this.territory?.id === id ? this.territory : null;
  }

  async create(input: Parameters<TerritoryRepository['create']>[0]): Promise<Territory> {
    this.territory = { ...this.territory!, ...input, id: 'territory-created' };
    return this.territory;
  }

  async archive(id: string, updatedByUserId: string | null, at: Date): Promise<Territory | null> {
    if (this.territory?.id !== id) return null;
    this.territory = { ...this.territory, status: 'retired', updatedByUserId, archivedAt: at };
    return this.territory;
  }
}

class MemoryAssignments implements AccountAssignmentRepository {
  assignments: AccountAssignment[] = [];

  async findCurrent(
    organizationId: string,
    assignmentRole: string,
  ): Promise<AccountAssignment | null> {
    return (
      this.assignments.find(
        (assignment) =>
          assignment.organizationId === organizationId &&
          assignment.assignmentRole === assignmentRole &&
          assignment.effectiveTo === null,
      ) ?? null
    );
  }

  async closeCurrent(
    organizationId: string,
    assignmentRole: string,
    effectiveTo: Date,
  ): Promise<AccountAssignment | null> {
    const current = await this.findCurrent(organizationId, assignmentRole);
    if (current === null) return null;
    current.effectiveTo = effectiveTo;
    return current;
  }

  async create(
    input: Parameters<AccountAssignmentRepository['create']>[0],
  ): Promise<AccountAssignment> {
    const assignment: AccountAssignment = {
      ...input,
      id: `assignment-${this.assignments.length + 1}`,
      effectiveTo: input.effectiveTo ?? null,
      createdAt: now,
    };
    this.assignments.push(assignment);
    return assignment;
  }
}

describe('organizations services', () => {
  it('rejects invalid organization creation input', async () => {
    const service = new OrganizationService(new MemoryOrganizations());

    await expect(
      service.create({ displayName: ' ', normalizedName: 'acme' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('enforces optimistic concurrency on organization update', async () => {
    const repo = new MemoryOrganizations();
    const service = new OrganizationService(repo);

    await expect(
      service.update({
        organizationId: 'org-1',
        expectedRecordVersion: 2,
        patch: { displayName: 'New Name' },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(repo.value?.displayName).toBe('Acme');
  });

  it('archives instead of deleting and blocks later mutable updates', async () => {
    const repo = new MemoryOrganizations();
    const service = new OrganizationService(repo);

    const archived = await service.archive({
      organizationId: 'org-1',
      expectedRecordVersion: 1,
      archivedByUserId: 'user-1',
      at: now,
    });

    expect(archived.recordStatus).toBe('archived');
    expect('delete' in repo).toBe(false);
    await expect(
      service.update({
        organizationId: 'org-1',
        expectedRecordVersion: 2,
        patch: { displayName: 'Should fail' },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('blocks contact creation for archived organizations', async () => {
    const organizations = new MemoryOrganizations();
    organizations.value = org({ recordStatus: 'archived' });
    const service = new ContactService(new MemoryContacts(), organizations);

    await expect(
      service.create({ organizationId: 'org-1', displayName: 'Jane Doe' }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('closes the prior effective-dated assignment before creating a replacement', async () => {
    const assignments = new MemoryAssignments();
    const service = new AccountAssignmentService(assignments, new MemoryTerritories());
    const first = await service.assign({
      organizationId: 'org-1',
      userId: 'user-1',
      territoryId: 'territory-1',
      assignedByUserId: 'admin-1',
      effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
    });

    const secondEffectiveFrom = new Date('2026-08-01T00:00:00.000Z');
    const second = await service.assign({
      organizationId: 'org-1',
      userId: 'user-2',
      territoryId: 'territory-1',
      assignedByUserId: 'admin-1',
      effectiveFrom: secondEffectiveFrom,
    });

    expect(first.effectiveTo).toEqual(secondEffectiveFrom);
    expect(second.effectiveTo).toBeNull();
    expect(assignments.assignments).toHaveLength(2);
  });
});
