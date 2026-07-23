import { sql } from 'drizzle-orm';
import {
  boolean,
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

import { exportJobStatusEnum } from './enums.js';
import { users } from './identity.js';

export const savedViews = pgTable(
  'saved_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dashboardKey: text('dashboard_key').notNull(),
    viewKey: text('view_key'),
    name: text('name').notNull(),
    filters: jsonb('filters')
      .notNull()
      .default(sql`'{}'::jsonb`),
    columns: jsonb('columns')
      .notNull()
      .default(sql`'[]'::jsonb`),
    sort: jsonb('sort'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('saved_views_owner_idx').on(table.ownerUserId),
    index('saved_views_dashboard_key_idx').on(table.dashboardKey),
    uniqueIndex('saved_views_owner_dashboard_name_unique').on(
      table.ownerUserId,
      table.dashboardKey,
      table.name,
    ),
    check(
      'saved_views_dashboard_key_valid',
      sql`${table.dashboardKey} ~ '^D[1-8]$' or ${table.dashboardKey} ~ '^table_'`,
    ),
  ],
);

export const exportJobs = pgTable(
  'export_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestedByUserId: uuid('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    dashboardKey: text('dashboard_key').notNull(),
    viewKey: text('view_key'),
    status: exportJobStatusEnum('status').notNull().default('pending'),
    idempotencyKey: text('idempotency_key').notNull(),
    filters: jsonb('filters')
      .notNull()
      .default(sql`'{}'::jsonb`),
    columns: jsonb('columns')
      .notNull()
      .default(sql`'[]'::jsonb`),
    sort: jsonb('sort'),
    classificationNotice: text('classification_notice').notNull(),
    artifactRef: text('artifact_ref'),
    rowCount: integer('row_count'),
    redactionSummary: jsonb('redaction_summary')
      .notNull()
      .default(sql`'{}'::jsonb`),
    errorMessage: text('error_message'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('export_jobs_idempotency_key_unique').on(table.idempotencyKey),
    index('export_jobs_requested_by_idx').on(table.requestedByUserId),
    index('export_jobs_dashboard_key_idx').on(table.dashboardKey),
    index('export_jobs_status_idx').on(table.status),
    index('export_jobs_expires_at_idx').on(table.expiresAt),
    check(
      'export_jobs_dashboard_key_valid',
      sql`${table.dashboardKey} ~ '^D[1-8]$' or ${table.dashboardKey} ~ '^table_'`,
    ),
    check(
      'export_jobs_row_count_non_negative',
      sql`${table.rowCount} is null or ${table.rowCount} >= 0`,
    ),
  ],
);
