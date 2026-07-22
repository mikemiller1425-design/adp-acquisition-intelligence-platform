import type {
  Channel,
  ContactChannelPermission,
  OrganizationCommunicationRestriction,
  PermissionScope,
  PermissionSource,
  PermissionState,
  SuppressionEntry,
} from './permission.js';

export type PermissionMutationInput = {
  state: PermissionState;
  source: PermissionSource;
  effectiveAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  capturedByUserId: string | null;
  reasonCode: string | null;
  reasonNote: string | null;
  evidenceRef: string | null;
};

export type ContactPermissionInput = PermissionMutationInput & {
  contactId: string;
  channel: Channel;
};

export type OrganizationRestrictionInput = PermissionMutationInput & {
  organizationId: string;
  channel: Channel | null;
};

export type SuppressionInput = PermissionMutationInput & {
  scope: PermissionScope;
  channel: Channel | null;
  contactId: string | null;
  organizationId: string | null;
  identifierType: string | null;
  identifierHash: string | null;
};

export type PermissionRepository = {
  assertContactChannelPermission(input: ContactPermissionInput): Promise<ContactChannelPermission>;
  setOrganizationRestriction(
    input: OrganizationRestrictionInput,
  ): Promise<OrganizationCommunicationRestriction>;
  upsertSuppression(input: SuppressionInput): Promise<SuppressionEntry>;
  revokeSuppression(
    id: string,
    revokedAt: Date,
    capturedByUserId: string | null,
  ): Promise<SuppressionEntry | null>;
  findEffectiveContactChannelPermissions(input: {
    contactId: string;
    channel: Channel;
    at: Date;
  }): Promise<ContactChannelPermission[]>;
  findEffectiveOrganizationRestrictions(input: {
    organizationId: string;
    channel: Channel;
    at: Date;
  }): Promise<OrganizationCommunicationRestriction[]>;
  findEffectiveSuppressions(input: {
    contactId: string;
    organizationId: string;
    channel: Channel;
    at: Date;
  }): Promise<SuppressionEntry[]>;
};

export type ConsentAuditPort = {
  append(event: {
    actorUserId: string | null;
    action: 'outreach_blocked_by_permission';
    subjectType: 'contact';
    subjectId: string;
    correlationId: string | null;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};
