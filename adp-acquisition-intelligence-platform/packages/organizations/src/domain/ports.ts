import type {
  AccountAssignment,
  ActorType,
  Contact,
  Location,
  Note,
  Organization,
  Permission,
  Role,
  SubjectType,
  Tag,
  Task,
  Territory,
  User,
} from './types.js';

export type CreateOrganizationInput = {
  legalName?: string | null;
  displayName: string;
  normalizedName: string;
  domain?: string | null;
  normalizedDomain?: string | null;
  firmType?: string | null;
  existingRelationshipFlag?: boolean;
  createdByUserId?: string | null;
};

export type UpdateOrganizationInput = {
  legalName?: string | null;
  displayName?: string;
  normalizedName?: string;
  domain?: string | null;
  normalizedDomain?: string | null;
  firmType?: string | null;
  existingRelationshipFlag?: boolean;
  updatedByUserId?: string | null;
};

export type OrganizationRepository = {
  findById(id: string): Promise<Organization | null>;
  create(input: CreateOrganizationInput): Promise<Organization>;
  updateIfVersion(
    id: string,
    expectedRecordVersion: number,
    input: UpdateOrganizationInput,
  ): Promise<Organization | null>;
  archiveIfVersion(
    id: string,
    expectedRecordVersion: number,
    archivedByUserId: string | null,
    at: Date,
  ): Promise<Organization | null>;
};

export type CreateContactInput = {
  organizationId: string;
  primaryLocationId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  title?: string | null;
  email?: string | null;
  normalizedEmail?: string | null;
  phone?: string | null;
  normalizedPhone?: string | null;
  linkedinUrl?: string | null;
  createdByUserId?: string | null;
};

export type UpdateContactInput = {
  primaryLocationId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string;
  title?: string | null;
  email?: string | null;
  normalizedEmail?: string | null;
  phone?: string | null;
  normalizedPhone?: string | null;
  linkedinUrl?: string | null;
  updatedByUserId?: string | null;
};

export type ContactRepository = {
  findById(id: string): Promise<Contact | null>;
  create(input: CreateContactInput): Promise<Contact>;
  updateIfVersion(
    id: string,
    expectedRecordVersion: number,
    input: UpdateContactInput,
  ): Promise<Contact | null>;
  archiveIfVersion(
    id: string,
    expectedRecordVersion: number,
    archivedByUserId: string | null,
    at: Date,
  ): Promise<Contact | null>;
};

export type LocationRepository = {
  findById(id: string): Promise<Location | null>;
  create(
    input: Omit<Location, 'id' | 'createdAt' | 'updatedAt' | 'archivedAt' | 'locationStatus'> & {
      locationStatus?: Location['locationStatus'];
    },
  ): Promise<Location>;
  archive(id: string, archivedByUserId: string | null, at: Date): Promise<Location | null>;
};

export type TerritoryRepository = {
  findById(id: string): Promise<Territory | null>;
  create(
    input: Pick<Territory, 'code' | 'name'> &
      Partial<Pick<Territory, 'description' | 'parentTerritoryId' | 'createdByUserId'>>,
  ): Promise<Territory>;
  archive(id: string, updatedByUserId: string | null, at: Date): Promise<Territory | null>;
};

export type AccountAssignmentRepository = {
  findCurrent(organizationId: string, assignmentRole: string): Promise<AccountAssignment | null>;
  closeCurrent(
    organizationId: string,
    assignmentRole: string,
    effectiveTo: Date,
  ): Promise<AccountAssignment | null>;
  create(
    input: Omit<AccountAssignment, 'id' | 'createdAt' | 'effectiveTo'> & {
      effectiveTo?: Date | null;
    },
  ): Promise<AccountAssignment>;
};

export type TaskRepository = {
  findById(id: string): Promise<Task | null>;
  create(
    input: Omit<
      Task,
      'id' | 'createdAt' | 'updatedAt' | 'archivedAt' | 'completedAt' | 'status'
    > & { status?: Task['status']; completedAt?: Date | null },
  ): Promise<Task>;
  updateStatus(
    id: string,
    status: Task['status'],
    updatedByUserId: string | null,
    at: Date,
  ): Promise<Task | null>;
  archive(id: string, updatedByUserId: string | null, at: Date): Promise<Task | null>;
};

export type NoteRepository = {
  findById(id: string): Promise<Note | null>;
  create(input: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'archivedAt'>): Promise<Note>;
  archive(id: string, updatedByUserId: string | null, at: Date): Promise<Note | null>;
};

export type TagRepository = {
  findById(id: string): Promise<Tag | null>;
  create(
    input: Pick<Tag, 'key' | 'name'> &
      Partial<Pick<Tag, 'description' | 'color' | 'createdByUserId'>>,
  ): Promise<Tag>;
  retire(id: string, at: Date): Promise<Tag | null>;
  tagSubject(
    tagId: string,
    subjectType: SubjectType,
    subjectId: string,
    createdByUserId: string | null,
  ): Promise<void>;
};

export type IdentityRepository = {
  findUserById(id: string): Promise<User | null>;
  findUserByExternalSubjectId(externalSubjectId: string): Promise<User | null>;
  upsertUser(input: Pick<User, 'externalSubjectId' | 'email' | 'displayName'>): Promise<User>;
  upsertRole(input: Pick<Role, 'key' | 'name'> & Partial<Pick<Role, 'description'>>): Promise<Role>;
  upsertPermission(input: Pick<Permission, 'key' | 'description'>): Promise<Permission>;
  assignRoleToUser(userId: string, roleId: string, assignedByUserId: string | null): Promise<void>;
  grantPermissionToRole(
    roleId: string,
    permissionId: string,
    grantedByUserId: string | null,
  ): Promise<void>;
  listPermissionKeysForUser(userId: string): Promise<string[]>;
};

export type AuditEventInput = {
  actorType: ActorType;
  actorUserId: string | null;
  action: string;
  subjectType: SubjectType;
  subjectId: string | null;
  organizationId: string | null;
  contactId: string | null;
  commandCorrelationId: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  occurredAt?: Date;
};

export type AuditEventRepository = {
  append(input: AuditEventInput): Promise<string>;
};

export type OutboxEventInput = {
  aggregateType: SubjectType;
  aggregateId: string;
  eventType: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  availableAt?: Date;
};

export type OutboxEventRepository = {
  insert(input: OutboxEventInput): Promise<string>;
};
