import { AppError } from '@adp/platform';

import type {
  ContactRepository,
  CreateContactInput,
  CreateOrganizationInput,
  OrganizationRepository,
  UpdateContactInput,
  UpdateOrganizationInput,
} from '../domain/ports.js';
import type { Contact, Organization } from '../domain/types.js';

function assertNonBlank(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: `${field} must not be blank`,
      details: { field },
    });
  }
}

function notFound(resource: string, id: string): AppError {
  return new AppError({
    code: 'NOT_FOUND',
    message: `${resource} not found`,
    details: { id },
  });
}

function archived(resource: string, id: string): AppError {
  return new AppError({
    code: 'CONFLICT',
    message: `${resource} is archived`,
    details: { id },
  });
}

function versionConflict(resource: string, id: string, expectedRecordVersion: number): AppError {
  return new AppError({
    code: 'CONFLICT',
    message: `${resource} record version conflict`,
    details: { id, expectedRecordVersion },
  });
}

export class OrganizationService {
  constructor(private readonly organizations: OrganizationRepository) {}

  async create(input: CreateOrganizationInput): Promise<Organization> {
    assertNonBlank(input.displayName, 'displayName');
    assertNonBlank(input.normalizedName, 'normalizedName');
    return this.organizations.create(input);
  }

  async update(command: {
    organizationId: string;
    expectedRecordVersion: number;
    patch: UpdateOrganizationInput;
  }): Promise<Organization> {
    const current = await this.organizations.findById(command.organizationId);
    if (current === null) throw notFound('Organization', command.organizationId);
    if (current.recordStatus === 'archived') throw archived('Organization', command.organizationId);
    if (current.recordVersion !== command.expectedRecordVersion) {
      throw versionConflict('Organization', command.organizationId, command.expectedRecordVersion);
    }
    if (command.patch.displayName !== undefined) assertNonBlank(command.patch.displayName, 'displayName');
    if (command.patch.normalizedName !== undefined) {
      assertNonBlank(command.patch.normalizedName, 'normalizedName');
    }

    const updated = await this.organizations.updateIfVersion(
      command.organizationId,
      command.expectedRecordVersion,
      command.patch,
    );
    if (updated === null) {
      throw versionConflict('Organization', command.organizationId, command.expectedRecordVersion);
    }
    return updated;
  }

  async archive(command: {
    organizationId: string;
    expectedRecordVersion: number;
    archivedByUserId: string | null;
    at?: Date;
  }): Promise<Organization> {
    const current = await this.organizations.findById(command.organizationId);
    if (current === null) throw notFound('Organization', command.organizationId);
    if (current.recordStatus === 'archived') return current;
    if (current.recordVersion !== command.expectedRecordVersion) {
      throw versionConflict('Organization', command.organizationId, command.expectedRecordVersion);
    }

    const archivedOrg = await this.organizations.archiveIfVersion(
      command.organizationId,
      command.expectedRecordVersion,
      command.archivedByUserId,
      command.at ?? new Date(),
    );
    if (archivedOrg === null) {
      throw versionConflict('Organization', command.organizationId, command.expectedRecordVersion);
    }
    return archivedOrg;
  }
}

export class ContactService {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly organizations: OrganizationRepository,
  ) {}

  async create(input: CreateContactInput): Promise<Contact> {
    assertNonBlank(input.displayName, 'displayName');
    const organization = await this.organizations.findById(input.organizationId);
    if (organization === null) throw notFound('Organization', input.organizationId);
    if (organization.recordStatus === 'archived') throw archived('Organization', input.organizationId);
    return this.contacts.create(input);
  }

  async update(command: {
    contactId: string;
    expectedRecordVersion: number;
    patch: UpdateContactInput;
  }): Promise<Contact> {
    const current = await this.contacts.findById(command.contactId);
    if (current === null) throw notFound('Contact', command.contactId);
    if (current.status === 'archived') throw archived('Contact', command.contactId);
    if (current.recordVersion !== command.expectedRecordVersion) {
      throw versionConflict('Contact', command.contactId, command.expectedRecordVersion);
    }
    if (command.patch.displayName !== undefined) assertNonBlank(command.patch.displayName, 'displayName');

    const updated = await this.contacts.updateIfVersion(
      command.contactId,
      command.expectedRecordVersion,
      command.patch,
    );
    if (updated === null) {
      throw versionConflict('Contact', command.contactId, command.expectedRecordVersion);
    }
    return updated;
  }

  async archive(command: {
    contactId: string;
    expectedRecordVersion: number;
    archivedByUserId: string | null;
    at?: Date;
  }): Promise<Contact> {
    const current = await this.contacts.findById(command.contactId);
    if (current === null) throw notFound('Contact', command.contactId);
    if (current.status === 'archived') return current;
    if (current.recordVersion !== command.expectedRecordVersion) {
      throw versionConflict('Contact', command.contactId, command.expectedRecordVersion);
    }

    const archivedContact = await this.contacts.archiveIfVersion(
      command.contactId,
      command.expectedRecordVersion,
      command.archivedByUserId,
      command.at ?? new Date(),
    );
    if (archivedContact === null) {
      throw versionConflict('Contact', command.contactId, command.expectedRecordVersion);
    }
    return archivedContact;
  }
}
