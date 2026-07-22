import { describe, expect, it } from 'vitest';

import { ConsentPermissionService } from '../application/consent-permission-service.js';
import type {
  Channel,
  ContactChannelPermission,
  OrganizationCommunicationRestriction,
  SuppressionEntry,
} from '../domain/permission.js';
import type {
  ConsentAuditPort,
  ContactPermissionInput,
  OrganizationRestrictionInput,
  PermissionRepository,
  SuppressionInput,
} from '../domain/ports.js';

const baseTime = new Date('2026-07-22T00:00:00.000Z');

class MemoryPermissionRepository implements PermissionRepository {
  contactPermissions: ContactChannelPermission[] = [];
  orgRestrictions: OrganizationCommunicationRestriction[] = [];
  suppressions: SuppressionEntry[] = [];

  async assertContactChannelPermission(
    input: ContactPermissionInput,
  ): Promise<ContactChannelPermission> {
    const record: ContactChannelPermission = {
      id: `permission-${this.contactPermissions.length + 1}`,
      supersededById: null,
      createdAt: baseTime,
      ...input,
    };
    for (const permission of this.contactPermissions) {
      if (
        permission.contactId === input.contactId &&
        permission.channel === input.channel &&
        permission.supersededById === null &&
        permission.revokedAt === null
      ) {
        permission.supersededById = record.id;
      }
    }
    this.contactPermissions.push(record);
    return record;
  }

  async setOrganizationRestriction(
    input: OrganizationRestrictionInput,
  ): Promise<OrganizationCommunicationRestriction> {
    const record: OrganizationCommunicationRestriction = {
      id: `restriction-${this.orgRestrictions.length + 1}`,
      supersededById: null,
      createdAt: baseTime,
      ...input,
    };
    for (const restriction of this.orgRestrictions) {
      if (
        restriction.organizationId === input.organizationId &&
        restriction.channel === input.channel &&
        restriction.supersededById === null &&
        restriction.revokedAt === null
      ) {
        restriction.supersededById = record.id;
      }
    }
    this.orgRestrictions.push(record);
    return record;
  }

  async upsertSuppression(input: SuppressionInput): Promise<SuppressionEntry> {
    const record: SuppressionEntry = {
      id: `suppression-${this.suppressions.length + 1}`,
      supersededById: null,
      createdAt: baseTime,
      ...input,
    };
    for (const suppression of this.suppressions) {
      if (
        suppression.scope === input.scope &&
        suppression.channel === input.channel &&
        suppression.contactId === input.contactId &&
        suppression.organizationId === input.organizationId &&
        suppression.identifierHash === input.identifierHash &&
        suppression.supersededById === null &&
        suppression.revokedAt === null
      ) {
        suppression.supersededById = record.id;
      }
    }
    this.suppressions.push(record);
    return record;
  }

  async revokeSuppression(
    id: string,
    revokedAt: Date,
    _capturedByUserId: string | null,
  ): Promise<SuppressionEntry | null> {
    const suppression = this.suppressions.find((record) => record.id === id) ?? null;
    if (suppression === null) return null;
    suppression.revokedAt = revokedAt;
    return suppression;
  }

  async findEffectiveContactChannelPermissions(input: {
    contactId: string;
    channel: Channel;
    at: Date;
  }): Promise<ContactChannelPermission[]> {
    return this.contactPermissions.filter(
      (record) =>
        record.contactId === input.contactId &&
        record.channel === input.channel &&
        record.supersededById === null,
    );
  }

  async findEffectiveOrganizationRestrictions(input: {
    organizationId: string;
    channel: Channel;
    at: Date;
  }): Promise<OrganizationCommunicationRestriction[]> {
    return this.orgRestrictions.filter(
      (record) =>
        record.organizationId === input.organizationId &&
        (record.channel === null || record.channel === input.channel) &&
        record.supersededById === null,
    );
  }

  async findEffectiveSuppressions(input: {
    contactId: string;
    organizationId: string;
    channel: Channel;
    at: Date;
  }): Promise<SuppressionEntry[]> {
    return this.suppressions.filter(
      (record) =>
        (record.contactId === null || record.contactId === input.contactId) &&
        (record.organizationId === null || record.organizationId === input.organizationId) &&
        (record.channel === null || record.channel === input.channel) &&
        record.supersededById === null,
    );
  }
}

class MemoryAudit implements ConsentAuditPort {
  events: Parameters<ConsentAuditPort['append']>[0][] = [];

  async append(event: Parameters<ConsentAuditPort['append']>[0]): Promise<void> {
    this.events.push(event);
  }
}

function permissionInput(state: ContactPermissionInput['state']): ContactPermissionInput {
  return {
    contactId: 'contact-1',
    channel: 'email',
    state,
    source: 'user_asserted',
    effectiveAt: new Date('2026-07-01T00:00:00.000Z'),
    expiresAt: null,
    revokedAt: null,
    capturedByUserId: 'user-1',
    reasonCode: null,
    reasonNote: null,
    evidenceRef: `evidence-${state}`,
  };
}

describe('ConsentPermissionService', () => {
  it('treats unknown as blocked and audits blocked decisions', async () => {
    const audit = new MemoryAudit();
    const service = new ConsentPermissionService(new MemoryPermissionRepository(), audit);

    const evaluation = await service.evaluateOutreachPermission({
      contactId: 'contact-1',
      organizationId: 'org-1',
      channel: 'email',
      at: baseTime,
      auditBlockedDecision: { actorUserId: 'user-1', correlationId: 'corr-1' },
    });

    expect(evaluation).toMatchObject({ allowed: false, state: 'unknown', rulingRule: 'unknown' });
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]?.action).toBe('outreach_blocked_by_permission');
  });

  it('applies global suppression before organization and contact permissions', async () => {
    const repository = new MemoryPermissionRepository();
    const service = new ConsentPermissionService(repository);
    await service.assertContactChannelPermission(permissionInput('allowed'));
    await service.setOrganizationRestriction({
      organizationId: 'org-1',
      channel: null,
      state: 'restricted',
      source: 'admin',
      effectiveAt: new Date('2026-07-01T00:00:00.000Z'),
      expiresAt: null,
      revokedAt: null,
      capturedByUserId: 'admin-1',
      reasonCode: 'org_policy',
      reasonNote: null,
      evidenceRef: 'org-restriction',
    });
    await service.upsertSuppression({
      scope: 'global',
      channel: null,
      contactId: null,
      organizationId: null,
      identifierType: 'email',
      identifierHash: 'hash-1',
      state: 'opted_out',
      source: 'policy',
      effectiveAt: new Date('2026-07-01T00:00:00.000Z'),
      expiresAt: null,
      revokedAt: null,
      capturedByUserId: 'admin-1',
      reasonCode: 'global_suppression',
      reasonNote: null,
      evidenceRef: 'global-evidence',
    });

    const evaluation = await service.evaluateOutreachPermission({
      contactId: 'contact-1',
      organizationId: 'org-1',
      channel: 'email',
      at: baseTime,
    });

    expect(evaluation.allowed).toBe(false);
    expect(evaluation.state).toBe('opted_out');
    expect(evaluation.rulingRule).toBe('global_suppression');
    expect(evaluation.evidenceRefs).toContain('global-evidence');
  });

  it('ignores expired permissions and falls through to unknown', async () => {
    const repository = new MemoryPermissionRepository();
    const service = new ConsentPermissionService(repository);
    await service.assertContactChannelPermission({
      ...permissionInput('allowed'),
      expiresAt: new Date('2026-07-10T00:00:00.000Z'),
    });

    const evaluation = await service.evaluateOutreachPermission({
      contactId: 'contact-1',
      organizationId: 'org-1',
      channel: 'email',
      at: baseTime,
    });

    expect(evaluation).toMatchObject({ allowed: false, state: 'unknown' });
  });

  it('chooses the most restrictive concurrent contact permission', async () => {
    const repository = new MemoryPermissionRepository();
    repository.contactPermissions.push(
      { ...permissionInput('allowed'), id: 'allowed', createdAt: baseTime, supersededById: null },
      {
        ...permissionInput('restricted'),
        id: 'restricted',
        createdAt: baseTime,
        supersededById: null,
      },
    );
    const service = new ConsentPermissionService(repository);

    const evaluation = await service.evaluateOutreachPermission({
      contactId: 'contact-1',
      organizationId: 'org-1',
      channel: 'email',
      at: baseTime,
    });

    expect(evaluation).toMatchObject({
      allowed: false,
      state: 'restricted',
      rulingRule: 'contact_channel_permission',
    });
  });

  it('supersedes prior current rows instead of overwriting them', async () => {
    const repository = new MemoryPermissionRepository();
    const service = new ConsentPermissionService(repository);

    const first = await service.assertContactChannelPermission(permissionInput('unknown'));
    const second = await service.assertContactChannelPermission(permissionInput('allowed'));

    expect(first.supersededById).toBe(second.id);
    expect(repository.contactPermissions).toHaveLength(2);
    expect(repository.contactPermissions[0]?.state).toBe('unknown');
  });
});
