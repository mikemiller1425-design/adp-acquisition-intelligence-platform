import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity.js';
import { organizations } from './organizations.js';
import { territories } from './territories.js';

export const accountAssignments = pgTable(
  'account_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    territoryId: uuid('territory_id')
      .notNull()
      .references(() => territories.id, { onDelete: 'restrict' }),
    assignmentRole: text('assignment_role').notNull().default('owner'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reasonCode: text('reason_code'),
    reasonNote: text('reason_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('account_assignments_current_org_role_unique')
      .on(table.organizationId, table.assignmentRole)
      .where(sql`${table.effectiveTo} is null`),
    index('account_assignments_user_id_idx').on(table.userId),
    index('account_assignments_territory_id_idx').on(table.territoryId),
    index('account_assignments_effective_window_idx').on(
      table.organizationId,
      table.effectiveFrom,
      table.effectiveTo,
    ),
    check(
      'account_assignments_effective_window_valid',
      sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
  ],
);
