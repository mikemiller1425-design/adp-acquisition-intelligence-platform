export const permissionStates = [
  'allowed',
  'unknown',
  'restricted',
  'opted_out',
  'not_applicable',
] as const;

export const channels = [
  'email',
  'phone',
  'voicemail',
  'linkedin',
  'internal_introduction',
  'meeting',
  'manual_follow_up',
] as const;

export const permissionScopes = [
  'contact_channel',
  'organization',
  'organization_channel',
  'global',
  'global_channel',
] as const;

export const permissionSources = [
  'user_asserted',
  'import',
  'discovery',
  'response_unsubscribe',
  'admin',
  'policy',
  'system',
] as const;

export type PermissionState = (typeof permissionStates)[number];
export type Channel = (typeof channels)[number];
export type PermissionScope = (typeof permissionScopes)[number];
export type PermissionSource = (typeof permissionSources)[number];

export const permissionPrecedenceRank: Record<PermissionState, number> = {
  opted_out: 5,
  restricted: 4,
  unknown: 3,
  not_applicable: 2,
  allowed: 1,
};

export type EffectiveDatedPermission = {
  effectiveAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type ContactChannelPermission = EffectiveDatedPermission & {
  id: string;
  contactId: string;
  channel: Channel;
  state: PermissionState;
  source: PermissionSource;
  capturedByUserId: string | null;
  reasonCode: string | null;
  reasonNote: string | null;
  evidenceRef: string | null;
  supersededById: string | null;
  createdAt: Date;
};

export type OrganizationCommunicationRestriction = EffectiveDatedPermission & {
  id: string;
  organizationId: string;
  channel: Channel | null;
  state: PermissionState;
  source: PermissionSource;
  capturedByUserId: string | null;
  reasonCode: string | null;
  reasonNote: string | null;
  evidenceRef: string | null;
  supersededById: string | null;
  createdAt: Date;
};

export type SuppressionEntry = EffectiveDatedPermission & {
  id: string;
  scope: PermissionScope;
  channel: Channel | null;
  contactId: string | null;
  organizationId: string | null;
  identifierType: string | null;
  identifierHash: string | null;
  state: PermissionState;
  source: PermissionSource;
  capturedByUserId: string | null;
  reasonCode: string | null;
  reasonNote: string | null;
  evidenceRef: string | null;
  supersededById: string | null;
  createdAt: Date;
};

export type RulingRule =
  | 'global_suppression'
  | 'organization_restriction'
  | 'channel_suppression'
  | 'contact_channel_permission'
  | 'unknown';

export type PermissionEvaluation = {
  allowed: boolean;
  state: PermissionState;
  rulingRule: RulingRule;
  evidenceRefs: string[];
};

export function isEffectiveAt(record: EffectiveDatedPermission, at: Date): boolean {
  if (record.revokedAt !== null && record.revokedAt <= at) return false;
  if (record.effectiveAt > at) return false;
  if (record.expiresAt !== null && record.expiresAt <= at) return false;
  return true;
}

export function mostRestrictiveState(states: readonly PermissionState[]): PermissionState {
  if (states.length === 0) return 'unknown';
  return states.reduce((winner, candidate) =>
    permissionPrecedenceRank[candidate] > permissionPrecedenceRank[winner] ? candidate : winner,
  );
}

export function sortMostRestrictiveFirst<T extends { state: PermissionState }>(
  records: readonly T[],
): T[] {
  return [...records].sort(
    (left, right) => permissionPrecedenceRank[right.state] - permissionPrecedenceRank[left.state],
  );
}

export function evidenceRefsFrom(records: readonly { evidenceRef: string | null }[]): string[] {
  return records.flatMap((record) => (record.evidenceRef === null ? [] : [record.evidenceRef]));
}
