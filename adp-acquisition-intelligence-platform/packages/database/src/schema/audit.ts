import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { actorTypeEnum, outboxEventStatusEnum, subjectTypeEnum } from './enums.js';
import { users } from './identity.js';
import { contacts, organizations } from './organizations.js';

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: actorTypeEnum('actor_type').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    subjectId: uuid('subject_id'),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    commandCorrelationId: uuid('command_correlation_id'),
    beforeData: jsonb('before_data'),
    afterData: jsonb('after_data'),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_events_subject_idx').on(table.subjectType, table.subjectId, table.occurredAt),
    index('audit_events_actor_idx').on(table.actorUserId, table.occurredAt),
    index('audit_events_action_idx').on(table.action, table.occurredAt),
    index('audit_events_organization_id_idx').on(table.organizationId, table.occurredAt),
    index('audit_events_contact_id_idx').on(table.contactId, table.occurredAt),
    index('audit_events_command_correlation_id_idx').on(table.commandCorrelationId),
    check(
      'audit_events_user_actor_has_user',
      sql`${table.actorType} <> 'user' or ${table.actorUserId} is not null`,
    ),
  ],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aggregateType: subjectTypeEnum('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    eventType: text('event_type').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    payload: jsonb('payload').notNull(),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: outboxEventStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('outbox_events_idempotency_key_unique').on(table.idempotencyKey),
    index('outbox_events_status_available_idx').on(table.status, table.availableAt),
    index('outbox_events_aggregate_idx').on(table.aggregateType, table.aggregateId),
    index('outbox_events_event_type_idx').on(table.eventType),
    check('outbox_events_attempts_non_negative', sql`${table.attempts} >= 0`),
  ],
);
