export const prospectStages = [
  'raw',
  'normalization',
  'research',
  'scored',
  'review',
  'research_required',
  'qualified',
  'discovery_scheduled',
  'discovery_completed',
  'outreach_ready',
  'outreach_active',
  'opportunity',
  'nurture',
  'disqualified',
  'duplicate',
  'existing_relationship',
  'out_of_territory',
] as const;

export const researchStatuses = [
  'not_started',
  'in_progress',
  'gaps_open',
  'awaiting_review',
  'sufficient_for_purpose',
  'blocked_conflict',
  'paused',
] as const;

export const outreachStatuses = [
  'not_started',
  'ready',
  'active',
  'waiting_response',
  'paused',
  'completed',
  'blocked_restriction',
  'do_not_contact',
] as const;

export const dataFreshnessStatuses = ['current', 'aging', 'stale', 'mixed', 'unknown'] as const;
export const recordStatuses = ['active', 'archived'] as const;
export const contactStatuses = ['active', 'inactive', 'archived'] as const;
export const territoryStatuses = ['active', 'retired'] as const;
export const taskStatuses = ['open', 'in_progress', 'completed', 'cancelled'] as const;
export const tagStatuses = ['active', 'retired'] as const;
export const subjectTypes = ['organization', 'opportunity', 'contact', 'user', 'system'] as const;
export const actorTypes = ['user', 'system'] as const;

export type ProspectStage = (typeof prospectStages)[number];
export type ResearchStatus = (typeof researchStatuses)[number];
export type OutreachStatus = (typeof outreachStatuses)[number];
export type DataFreshnessStatus = (typeof dataFreshnessStatuses)[number];
export type RecordStatus = (typeof recordStatuses)[number];
export type ContactStatus = (typeof contactStatuses)[number];
export type TerritoryStatus = (typeof territoryStatuses)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type TagStatus = (typeof tagStatuses)[number];
export type SubjectType = (typeof subjectTypes)[number];
export type ActorType = (typeof actorTypes)[number];

export type Actor = {
  type: ActorType;
  userId: string | null;
};

export type MutableAuditFields = {
  createdByUserId: string | null;
  updatedByUserId: string | null;
  archivedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type Organization = MutableAuditFields & {
  id: string;
  legalName: string | null;
  displayName: string;
  normalizedName: string;
  domain: string | null;
  normalizedDomain: string | null;
  firmType: string | null;
  prospectStage: ProspectStage;
  researchStatus: ResearchStatus;
  outreachStatus: OutreachStatus;
  dataFreshnessStatus: DataFreshnessStatus;
  recordStatus: RecordStatus;
  existingRelationshipFlag: boolean;
  recordVersion: number;
};

export type Contact = MutableAuditFields & {
  id: string;
  organizationId: string;
  primaryLocationId: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  title: string | null;
  email: string | null;
  normalizedEmail: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  linkedinUrl: string | null;
  status: ContactStatus;
  recordVersion: number;
};

export type Location = {
  id: string;
  organizationId: string;
  territoryId: string | null;
  name: string | null;
  locationStatus: 'active' | 'closed' | 'archived';
  isPrimary: boolean;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type Territory = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parentTerritoryId: string | null;
  status: TerritoryStatus;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type AccountAssignment = {
  id: string;
  organizationId: string;
  userId: string;
  territoryId: string;
  assignmentRole: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  assignedByUserId: string | null;
  reasonCode: string | null;
  reasonNote: string | null;
  createdAt: Date;
};

export type Task = {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  organizationId: string | null;
  contactId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  dueAt: Date | null;
  completedAt: Date | null;
  assignedToUserId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type Note = {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  organizationId: string | null;
  contactId: string | null;
  body: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type Tag = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  status: TagStatus;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type User = {
  id: string;
  externalSubjectId: string;
  email: string;
  displayName: string;
  status: 'invited' | 'active' | 'suspended';
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: 'active' | 'retired';
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type Permission = {
  id: string;
  key: string;
  description: string;
  status: 'active' | 'retired';
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};
