import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  channelEnum,
  permissionScopeEnum,
  permissionSourceEnum,
  permissionStateEnum,
} from './enums.js';
import { users } from './identity.js';
import { contacts, organizations } from './organizations.js';

export const contactChannelPermissions = pgTable(
  'contact_channel_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    channel: channelEnum('channel').notNull(),
    state: permissionStateEnum('state').notNull(),
    source: permissionSourceEnum('source').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    supersededById: uuid('superseded_by_id'),
    capturedByUserId: uuid('captured_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reasonCode: text('reason_code'),
    reasonNote: text('reason_note'),
    evidenceRef: text('evidence_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.supersededById],
      foreignColumns: [table.id],
      name: 'contact_channel_permissions_superseded_by_fk',
    }),
    uniqueIndex('ccp_current_contact_channel_unique')
      .on(table.contactId, table.channel)
      .where(
        sql`${table.revokedAt} is null and ${table.supersededById} is null and ${table.expiresAt} is null`,
      ),
    index('ccp_contact_channel_effective_idx').on(
      table.contactId,
      table.channel,
      table.effectiveAt,
    ),
    index('ccp_state_idx').on(table.state),
    check(
      'ccp_effective_window_valid',
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.effectiveAt}`,
    ),
    check(
      'ccp_revoked_window_valid',
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.effectiveAt}`,
    ),
  ],
);

export const organizationCommunicationRestrictions = pgTable(
  'organization_communication_restrictions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    channel: channelEnum('channel'),
    state: permissionStateEnum('state').notNull(),
    source: permissionSourceEnum('source').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    supersededById: uuid('superseded_by_id'),
    capturedByUserId: uuid('captured_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reasonCode: text('reason_code'),
    reasonNote: text('reason_note'),
    evidenceRef: text('evidence_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.supersededById],
      foreignColumns: [table.id],
      name: 'org_comm_restrictions_superseded_by_fk',
    }),
    uniqueIndex('ocr_current_org_unique')
      .on(table.organizationId)
      .where(
        sql`${table.channel} is null and ${table.revokedAt} is null and ${table.supersededById} is null and ${table.expiresAt} is null`,
      ),
    uniqueIndex('ocr_current_org_channel_unique')
      .on(table.organizationId, table.channel)
      .where(
        sql`${table.channel} is not null and ${table.revokedAt} is null and ${table.supersededById} is null and ${table.expiresAt} is null`,
      ),
    index('ocr_org_channel_effective_idx').on(
      table.organizationId,
      table.channel,
      table.effectiveAt,
    ),
    index('ocr_state_idx').on(table.state),
    check(
      'ocr_effective_window_valid',
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.effectiveAt}`,
    ),
    check(
      'ocr_revoked_window_valid',
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.effectiveAt}`,
    ),
  ],
);

export const suppressionEntries = pgTable(
  'suppression_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: permissionScopeEnum('scope').notNull(),
    channel: channelEnum('channel'),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    identifierType: text('identifier_type'),
    identifierHash: text('identifier_hash'),
    state: permissionStateEnum('state').notNull(),
    source: permissionSourceEnum('source').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    supersededById: uuid('superseded_by_id'),
    capturedByUserId: uuid('captured_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reasonCode: text('reason_code'),
    reasonNote: text('reason_note'),
    evidenceRef: text('evidence_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.supersededById],
      foreignColumns: [table.id],
      name: 'suppression_entries_superseded_by_fk',
    }),
    uniqueIndex('suppress_current_contact_channel_unique')
      .on(table.contactId, table.channel)
      .where(
        sql`${table.scope} = 'contact_channel' and ${table.revokedAt} is null and ${table.supersededById} is null and ${table.expiresAt} is null`,
      ),
    uniqueIndex('suppress_current_org_unique')
      .on(table.organizationId)
      .where(
        sql`${table.scope} = 'organization' and ${table.revokedAt} is null and ${table.supersededById} is null and ${table.expiresAt} is null`,
      ),
    uniqueIndex('suppress_current_org_channel_unique')
      .on(table.organizationId, table.channel)
      .where(
        sql`${table.scope} = 'organization_channel' and ${table.revokedAt} is null and ${table.supersededById} is null and ${table.expiresAt} is null`,
      ),
    uniqueIndex('suppress_current_global_identifier_unique')
      .on(table.scope, table.identifierType, table.identifierHash)
      .where(
        sql`${table.scope} = 'global' and ${table.identifierHash} is not null and ${table.revokedAt} is null and ${table.supersededById} is null and ${table.expiresAt} is null`,
      ),
    uniqueIndex('suppress_current_global_channel_identifier_unique')
      .on(table.scope, table.channel, table.identifierType, table.identifierHash)
      .where(
        sql`${table.scope} = 'global_channel' and ${table.identifierHash} is not null and ${table.revokedAt} is null and ${table.supersededById} is null and ${table.expiresAt} is null`,
      ),
    index('suppress_eval_contact_channel_idx').on(
      table.contactId,
      table.channel,
      table.effectiveAt,
    ),
    index('suppress_eval_org_channel_idx').on(
      table.organizationId,
      table.channel,
      table.effectiveAt,
    ),
    index('suppress_identifier_hash_idx').on(table.identifierHash),
    check(
      'suppress_contact_channel_scope_valid',
      sql`${table.scope} <> 'contact_channel' or (${table.contactId} is not null and ${table.channel} is not null)`,
    ),
    check(
      'suppress_organization_scope_valid',
      sql`${table.scope} <> 'organization' or (${table.organizationId} is not null and ${table.channel} is null)`,
    ),
    check(
      'suppress_organization_channel_scope_valid',
      sql`${table.scope} <> 'organization_channel' or (${table.organizationId} is not null and ${table.channel} is not null)`,
    ),
    check(
      'suppress_global_channel_scope_valid',
      sql`${table.scope} <> 'global_channel' or ${table.channel} is not null`,
    ),
    check(
      'suppress_identifier_pair_valid',
      sql`(${table.identifierType} is null and ${table.identifierHash} is null) or (${table.identifierType} is not null and ${table.identifierHash} is not null)`,
    ),
    check(
      'suppress_effective_window_valid',
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.effectiveAt}`,
    ),
    check(
      'suppress_revoked_window_valid',
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.effectiveAt}`,
    ),
  ],
);
