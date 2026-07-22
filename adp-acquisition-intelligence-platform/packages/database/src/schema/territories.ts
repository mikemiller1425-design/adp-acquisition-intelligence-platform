import { type AnyPgColumn, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { territoryStatusEnum } from './enums.js';
import { users } from './identity.js';

export const territories = pgTable(
  'territories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    parentTerritoryId: uuid('parent_territory_id').references((): AnyPgColumn => territories.id, {
      onDelete: 'set null',
    }),
    status: territoryStatusEnum('status').notNull().default('active'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('territories_code_unique').on(table.code),
    index('territories_parent_territory_id_idx').on(table.parentTerritoryId),
    index('territories_status_idx').on(table.status),
  ],
);
