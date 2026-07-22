import {
  contactChannelPermissions,
  organizationCommunicationRestrictions,
  suppressionEntries,
} from '@adp/database';
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';
import type { SQLWrapper } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';

import type {
  ContactChannelPermission,
  OrganizationCommunicationRestriction,
  SuppressionEntry,
} from '../domain/permission.js';
import type {
  ContactPermissionInput,
  OrganizationRestrictionInput,
  PermissionRepository,
  SuppressionInput,
} from '../domain/ports.js';

type Db = PostgresJsDatabase;

function one<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function activeAt(
  record: {
    effectiveAt: SQLWrapper;
    expiresAt: SQLWrapper;
    revokedAt: SQLWrapper;
    supersededById: SQLWrapper;
  },
  at: Date,
) {
  return and(
    lte(record.effectiveAt, at),
    or(isNull(record.expiresAt), gt(record.expiresAt, at)),
    or(isNull(record.revokedAt), gt(record.revokedAt, at)),
    isNull(record.supersededById),
  );
}

function mapContactPermission(
  row: typeof contactChannelPermissions.$inferSelect,
): ContactChannelPermission {
  return row;
}

function mapOrgRestriction(
  row: typeof organizationCommunicationRestrictions.$inferSelect,
): OrganizationCommunicationRestriction {
  return row;
}

function mapSuppression(row: typeof suppressionEntries.$inferSelect): SuppressionEntry {
  return row;
}

export class PostgresPermissionRepository implements PermissionRepository {
  constructor(private readonly db: Db) {}

  async assertContactChannelPermission(input: ContactPermissionInput): Promise<ContactChannelPermission> {
    const id = randomUUID();
    const rows = await this.db.transaction(async (tx) => {
      await tx
        .update(contactChannelPermissions)
        .set({ supersededById: id })
        .where(
          and(
            eq(contactChannelPermissions.contactId, input.contactId),
            eq(contactChannelPermissions.channel, input.channel),
            isNull(contactChannelPermissions.supersededById),
            isNull(contactChannelPermissions.revokedAt),
          ),
        );
      return tx.insert(contactChannelPermissions).values({ id, ...input }).returning();
    });
    return mapContactPermission(rows[0] as typeof contactChannelPermissions.$inferSelect);
  }

  async setOrganizationRestriction(
    input: OrganizationRestrictionInput,
  ): Promise<OrganizationCommunicationRestriction> {
    const id = randomUUID();
    const rows = await this.db.transaction(async (tx) => {
      await tx
        .update(organizationCommunicationRestrictions)
        .set({ supersededById: id })
        .where(
          and(
            eq(organizationCommunicationRestrictions.organizationId, input.organizationId),
            input.channel === null
              ? isNull(organizationCommunicationRestrictions.channel)
              : eq(organizationCommunicationRestrictions.channel, input.channel),
            isNull(organizationCommunicationRestrictions.supersededById),
            isNull(organizationCommunicationRestrictions.revokedAt),
          ),
        );
      return tx.insert(organizationCommunicationRestrictions).values({ id, ...input }).returning();
    });
    return mapOrgRestriction(rows[0] as typeof organizationCommunicationRestrictions.$inferSelect);
  }

  async upsertSuppression(input: SuppressionInput): Promise<SuppressionEntry> {
    const id = randomUUID();
    const rows = await this.db.transaction(async (tx) => {
      await tx
        .update(suppressionEntries)
        .set({ supersededById: id })
        .where(
          and(
            eq(suppressionEntries.scope, input.scope),
            input.channel === null ? isNull(suppressionEntries.channel) : eq(suppressionEntries.channel, input.channel),
            input.contactId === null
              ? isNull(suppressionEntries.contactId)
              : eq(suppressionEntries.contactId, input.contactId),
            input.organizationId === null
              ? isNull(suppressionEntries.organizationId)
              : eq(suppressionEntries.organizationId, input.organizationId),
            input.identifierHash === null
              ? isNull(suppressionEntries.identifierHash)
              : eq(suppressionEntries.identifierHash, input.identifierHash),
            isNull(suppressionEntries.supersededById),
            isNull(suppressionEntries.revokedAt),
          ),
        );
      return tx.insert(suppressionEntries).values({ id, ...input }).returning();
    });
    return mapSuppression(rows[0] as typeof suppressionEntries.$inferSelect);
  }

  async revokeSuppression(
    id: string,
    revokedAt: Date,
    _capturedByUserId: string | null,
  ): Promise<SuppressionEntry | null> {
    const rows = await this.db
      .update(suppressionEntries)
      .set({ revokedAt })
      .where(and(eq(suppressionEntries.id, id), isNull(suppressionEntries.revokedAt)))
      .returning();
    const row = one(rows);
    return row === null ? null : mapSuppression(row);
  }

  async findEffectiveContactChannelPermissions(input: {
    contactId: string;
    channel: ContactPermissionInput['channel'];
    at: Date;
  }): Promise<ContactChannelPermission[]> {
    const rows = await this.db
      .select()
      .from(contactChannelPermissions)
      .where(
        and(
          eq(contactChannelPermissions.contactId, input.contactId),
          eq(contactChannelPermissions.channel, input.channel),
          activeAt(contactChannelPermissions, input.at),
        ),
      );
    return rows.map(mapContactPermission);
  }

  async findEffectiveOrganizationRestrictions(input: {
    organizationId: string;
    channel: ContactPermissionInput['channel'];
    at: Date;
  }): Promise<OrganizationCommunicationRestriction[]> {
    const rows = await this.db
      .select()
      .from(organizationCommunicationRestrictions)
      .where(
        and(
          eq(organizationCommunicationRestrictions.organizationId, input.organizationId),
          or(
            isNull(organizationCommunicationRestrictions.channel),
            eq(organizationCommunicationRestrictions.channel, input.channel),
          ),
          activeAt(organizationCommunicationRestrictions, input.at),
        ),
      );
    return rows.map(mapOrgRestriction);
  }

  async findEffectiveSuppressions(input: {
    contactId: string;
    organizationId: string;
    channel: ContactPermissionInput['channel'];
    at: Date;
  }): Promise<SuppressionEntry[]> {
    const rows = await this.db
      .select()
      .from(suppressionEntries)
      .where(
        and(
          or(isNull(suppressionEntries.channel), eq(suppressionEntries.channel, input.channel)),
          or(eq(suppressionEntries.contactId, input.contactId), isNull(suppressionEntries.contactId)),
          or(
            eq(suppressionEntries.organizationId, input.organizationId),
            isNull(suppressionEntries.organizationId),
          ),
          activeAt(suppressionEntries, input.at),
        ),
      );
    return rows.map(mapSuppression);
  }
}
