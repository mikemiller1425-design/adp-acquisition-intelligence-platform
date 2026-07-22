import {
  accountAssignments,
  auditEvents,
  contacts,
  notes,
  organizationLocations,
  organizations,
  outboxEvents,
  permissions,
  rolePermissions,
  roles,
  taggings,
  tags,
  tasks,
  territories,
  userRoles,
  users,
} from '@adp/database';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type {
  AccountAssignmentRepository,
  AuditEventInput,
  AuditEventRepository,
  ContactRepository,
  CreateContactInput,
  CreateOrganizationInput,
  IdentityRepository,
  LocationRepository,
  NoteRepository,
  OrganizationRepository,
  OutboxEventInput,
  OutboxEventRepository,
  TagRepository,
  TaskRepository,
  TerritoryRepository,
  UpdateContactInput,
  UpdateOrganizationInput,
} from '../domain/ports.js';
import type {
  AccountAssignment,
  Contact,
  Location,
  Note,
  Organization,
  Permission,
  Role,
  Tag,
  Task,
  Territory,
  User,
} from '../domain/types.js';

type Db = PostgresJsDatabase;

const nowSql = sql`now()`;

function metadata(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function one<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function mapOrganization(row: typeof organizations.$inferSelect): Organization {
  return row;
}

function mapContact(row: typeof contacts.$inferSelect): Contact {
  return row;
}

function mapLocation(row: typeof organizationLocations.$inferSelect): Location {
  return row;
}

function mapTerritory(row: typeof territories.$inferSelect): Territory {
  return row;
}

function mapAssignment(row: typeof accountAssignments.$inferSelect): AccountAssignment {
  return row;
}

function mapTask(row: typeof tasks.$inferSelect): Task {
  return { ...row, metadata: metadata(row.metadata) };
}

function mapNote(row: typeof notes.$inferSelect): Note {
  return { ...row, metadata: metadata(row.metadata) };
}

function mapTag(row: typeof tags.$inferSelect): Tag {
  return row;
}

function mapUser(row: typeof users.$inferSelect): User {
  return row;
}

function mapRole(row: typeof roles.$inferSelect): Role {
  return row;
}

function mapPermission(row: typeof permissions.$inferSelect): Permission {
  return row;
}

export class PostgresOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Organization | null> {
    const rows = await this.db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    const row = one(rows);
    return row === null ? null : mapOrganization(row);
  }

  async create(input: CreateOrganizationInput): Promise<Organization> {
    const rows = await this.db.insert(organizations).values(input).returning();
    return mapOrganization(rows[0] as typeof organizations.$inferSelect);
  }

  async updateIfVersion(
    id: string,
    expectedRecordVersion: number,
    input: UpdateOrganizationInput,
  ): Promise<Organization | null> {
    const rows = await this.db
      .update(organizations)
      .set({
        ...input,
        recordVersion: sql`${organizations.recordVersion} + 1`,
        updatedAt: nowSql,
      })
      .where(
        and(
          eq(organizations.id, id),
          eq(organizations.recordVersion, expectedRecordVersion),
          eq(organizations.recordStatus, 'active'),
        ),
      )
      .returning();
    const row = one(rows);
    return row === null ? null : mapOrganization(row);
  }

  async archiveIfVersion(
    id: string,
    expectedRecordVersion: number,
    archivedByUserId: string | null,
    at: Date,
  ): Promise<Organization | null> {
    const rows = await this.db
      .update(organizations)
      .set({
        recordStatus: 'archived',
        archivedByUserId,
        archivedAt: at,
        updatedAt: at,
        recordVersion: sql`${organizations.recordVersion} + 1`,
      })
      .where(
        and(
          eq(organizations.id, id),
          eq(organizations.recordVersion, expectedRecordVersion),
          eq(organizations.recordStatus, 'active'),
        ),
      )
      .returning();
    const row = one(rows);
    return row === null ? null : mapOrganization(row);
  }
}

export class PostgresContactRepository implements ContactRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Contact | null> {
    const rows = await this.db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    const row = one(rows);
    return row === null ? null : mapContact(row);
  }

  async create(input: CreateContactInput): Promise<Contact> {
    const rows = await this.db.insert(contacts).values(input).returning();
    return mapContact(rows[0] as typeof contacts.$inferSelect);
  }

  async updateIfVersion(
    id: string,
    expectedRecordVersion: number,
    input: UpdateContactInput,
  ): Promise<Contact | null> {
    const rows = await this.db
      .update(contacts)
      .set({
        ...input,
        recordVersion: sql`${contacts.recordVersion} + 1`,
        updatedAt: nowSql,
      })
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.recordVersion, expectedRecordVersion),
          eq(contacts.status, 'active'),
        ),
      )
      .returning();
    const row = one(rows);
    return row === null ? null : mapContact(row);
  }

  async archiveIfVersion(
    id: string,
    expectedRecordVersion: number,
    archivedByUserId: string | null,
    at: Date,
  ): Promise<Contact | null> {
    const rows = await this.db
      .update(contacts)
      .set({
        status: 'archived',
        archivedByUserId,
        archivedAt: at,
        updatedAt: at,
        recordVersion: sql`${contacts.recordVersion} + 1`,
      })
      .where(
        and(eq(contacts.id, id), eq(contacts.recordVersion, expectedRecordVersion), eq(contacts.status, 'active')),
      )
      .returning();
    const row = one(rows);
    return row === null ? null : mapContact(row);
  }
}

export class PostgresLocationRepository implements LocationRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Location | null> {
    const rows = await this.db.select().from(organizationLocations).where(eq(organizationLocations.id, id)).limit(1);
    const row = one(rows);
    return row === null ? null : mapLocation(row);
  }

  async create(input: Parameters<LocationRepository['create']>[0]): Promise<Location> {
    const rows = await this.db.insert(organizationLocations).values(input).returning();
    return mapLocation(rows[0] as typeof organizationLocations.$inferSelect);
  }

  async archive(id: string, updatedByUserId: string | null, at: Date): Promise<Location | null> {
    const rows = await this.db
      .update(organizationLocations)
      .set({ locationStatus: 'archived', updatedByUserId, archivedAt: at, updatedAt: at })
      .where(eq(organizationLocations.id, id))
      .returning();
    const row = one(rows);
    return row === null ? null : mapLocation(row);
  }
}

export class PostgresTerritoryRepository implements TerritoryRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Territory | null> {
    const rows = await this.db.select().from(territories).where(eq(territories.id, id)).limit(1);
    const row = one(rows);
    return row === null ? null : mapTerritory(row);
  }

  async create(input: Parameters<TerritoryRepository['create']>[0]): Promise<Territory> {
    const rows = await this.db.insert(territories).values(input).returning();
    return mapTerritory(rows[0] as typeof territories.$inferSelect);
  }

  async archive(id: string, updatedByUserId: string | null, at: Date): Promise<Territory | null> {
    const rows = await this.db
      .update(territories)
      .set({ status: 'retired', updatedByUserId, archivedAt: at, updatedAt: at })
      .where(eq(territories.id, id))
      .returning();
    const row = one(rows);
    return row === null ? null : mapTerritory(row);
  }
}

export class PostgresAccountAssignmentRepository implements AccountAssignmentRepository {
  constructor(private readonly db: Db) {}

  async findCurrent(organizationId: string, assignmentRole: string): Promise<AccountAssignment | null> {
    const rows = await this.db
      .select()
      .from(accountAssignments)
      .where(
        and(
          eq(accountAssignments.organizationId, organizationId),
          eq(accountAssignments.assignmentRole, assignmentRole),
          isNull(accountAssignments.effectiveTo),
        ),
      )
      .limit(1);
    const row = one(rows);
    return row === null ? null : mapAssignment(row);
  }

  async closeCurrent(
    organizationId: string,
    assignmentRole: string,
    effectiveTo: Date,
  ): Promise<AccountAssignment | null> {
    const rows = await this.db
      .update(accountAssignments)
      .set({ effectiveTo })
      .where(
        and(
          eq(accountAssignments.organizationId, organizationId),
          eq(accountAssignments.assignmentRole, assignmentRole),
          isNull(accountAssignments.effectiveTo),
        ),
      )
      .returning();
    const row = one(rows);
    return row === null ? null : mapAssignment(row);
  }

  async create(input: Parameters<AccountAssignmentRepository['create']>[0]): Promise<AccountAssignment> {
    const rows = await this.db.insert(accountAssignments).values(input).returning();
    return mapAssignment(rows[0] as typeof accountAssignments.$inferSelect);
  }
}

export class PostgresTaskRepository implements TaskRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Task | null> {
    const rows = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    const row = one(rows);
    return row === null ? null : mapTask(row);
  }

  async create(input: Parameters<TaskRepository['create']>[0]): Promise<Task> {
    const rows = await this.db.insert(tasks).values(input).returning();
    return mapTask(rows[0] as typeof tasks.$inferSelect);
  }

  async updateStatus(
    id: string,
    status: Task['status'],
    updatedByUserId: string | null,
    at: Date,
  ): Promise<Task | null> {
    const rows = await this.db
      .update(tasks)
      .set({
        status,
        updatedByUserId,
        updatedAt: at,
        completedAt: status === 'completed' ? at : null,
      })
      .where(eq(tasks.id, id))
      .returning();
    const row = one(rows);
    return row === null ? null : mapTask(row);
  }

  async archive(id: string, updatedByUserId: string | null, at: Date): Promise<Task | null> {
    const rows = await this.db
      .update(tasks)
      .set({ status: 'cancelled', updatedByUserId, archivedAt: at, updatedAt: at })
      .where(eq(tasks.id, id))
      .returning();
    const row = one(rows);
    return row === null ? null : mapTask(row);
  }
}

export class PostgresNoteRepository implements NoteRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Note | null> {
    const rows = await this.db.select().from(notes).where(eq(notes.id, id)).limit(1);
    const row = one(rows);
    return row === null ? null : mapNote(row);
  }

  async create(input: Parameters<NoteRepository['create']>[0]): Promise<Note> {
    const rows = await this.db.insert(notes).values(input).returning();
    return mapNote(rows[0] as typeof notes.$inferSelect);
  }

  async archive(id: string, updatedByUserId: string | null, at: Date): Promise<Note | null> {
    const rows = await this.db
      .update(notes)
      .set({ updatedByUserId, archivedAt: at, updatedAt: at })
      .where(eq(notes.id, id))
      .returning();
    const row = one(rows);
    return row === null ? null : mapNote(row);
  }
}

export class PostgresTagRepository implements TagRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Tag | null> {
    const rows = await this.db.select().from(tags).where(eq(tags.id, id)).limit(1);
    const row = one(rows);
    return row === null ? null : mapTag(row);
  }

  async create(input: Parameters<TagRepository['create']>[0]): Promise<Tag> {
    const rows = await this.db.insert(tags).values(input).returning();
    return mapTag(rows[0] as typeof tags.$inferSelect);
  }

  async retire(id: string, at: Date): Promise<Tag | null> {
    const rows = await this.db
      .update(tags)
      .set({ status: 'retired', archivedAt: at, updatedAt: at })
      .where(eq(tags.id, id))
      .returning();
    const row = one(rows);
    return row === null ? null : mapTag(row);
  }

  async tagSubject(
    tagId: string,
    subjectType: Parameters<TagRepository['tagSubject']>[1],
    subjectId: string,
    createdByUserId: string | null,
  ): Promise<void> {
    await this.db
      .insert(taggings)
      .values({ tagId, subjectType, subjectId, createdByUserId })
      .onConflictDoNothing();
  }
}

export class PostgresIdentityRepository implements IdentityRepository {
  constructor(private readonly db: Db) {}

  async findUserById(id: string): Promise<User | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    const row = one(rows);
    return row === null ? null : mapUser(row);
  }

  async findUserByExternalSubjectId(externalSubjectId: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.externalSubjectId, externalSubjectId))
      .limit(1);
    const row = one(rows);
    return row === null ? null : mapUser(row);
  }

  async upsertUser(input: Parameters<IdentityRepository['upsertUser']>[0]): Promise<User> {
    const rows = await this.db
      .insert(users)
      .values(input)
      .onConflictDoUpdate({
        target: users.externalSubjectId,
        set: { email: input.email, displayName: input.displayName, updatedAt: nowSql },
      })
      .returning();
    return mapUser(rows[0] as typeof users.$inferSelect);
  }

  async upsertRole(input: Parameters<IdentityRepository['upsertRole']>[0]): Promise<Role> {
    const rows = await this.db
      .insert(roles)
      .values(input)
      .onConflictDoUpdate({
        target: roles.key,
        set: { name: input.name, description: input.description ?? null, updatedAt: nowSql },
      })
      .returning();
    return mapRole(rows[0] as typeof roles.$inferSelect);
  }

  async upsertPermission(input: Parameters<IdentityRepository['upsertPermission']>[0]): Promise<Permission> {
    const rows = await this.db
      .insert(permissions)
      .values(input)
      .onConflictDoUpdate({
        target: permissions.key,
        set: { description: input.description, updatedAt: nowSql },
      })
      .returning();
    return mapPermission(rows[0] as typeof permissions.$inferSelect);
  }

  async assignRoleToUser(
    userId: string,
    roleId: string,
    assignedByUserId: string | null,
  ): Promise<void> {
    await this.db
      .insert(userRoles)
      .values({ userId, roleId, assignedByUserId })
      .onConflictDoNothing();
  }

  async grantPermissionToRole(
    roleId: string,
    permissionId: string,
    grantedByUserId: string | null,
  ): Promise<void> {
    await this.db
      .insert(rolePermissions)
      .values({ roleId, permissionId, grantedByUserId })
      .onConflictDoNothing();
  }

  async listPermissionKeysForUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ key: permissions.key })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(and(eq(userRoles.userId, userId), eq(permissions.status, 'active')));
    return rows.map((row) => row.key);
  }
}

export class PostgresAuditEventRepository implements AuditEventRepository {
  constructor(private readonly db: Db) {}

  async append(input: AuditEventInput): Promise<string> {
    const rows = await this.db
      .insert(auditEvents)
      .values({
        ...input,
        occurredAt: input.occurredAt ?? new Date(),
      })
      .returning({ id: auditEvents.id });
    return (rows[0] as { id: string }).id;
  }
}

export class PostgresOutboxEventRepository implements OutboxEventRepository {
  constructor(private readonly db: Db) {}

  async insert(input: OutboxEventInput): Promise<string> {
    const rows = await this.db
      .insert(outboxEvents)
      .values({
        ...input,
        availableAt: input.availableAt ?? new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: outboxEvents.id });
    return (rows[0] as { id: string } | undefined)?.id ?? '';
  }
}
