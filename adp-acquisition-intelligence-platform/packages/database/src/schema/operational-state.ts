import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { actorTypeEnum, operationalDimensionEnum, subjectTypeEnum } from './enums.js';
import { users } from './identity.js';

export const operationalStateTransitions = pgTable(
  'operational_state_transitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    dimension: operationalDimensionEnum('dimension').notNull(),
    fromValue: text('from_value'),
    toValue: text('to_value').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorType: actorTypeEnum('actor_type').notNull(),
    reasonCode: text('reason_code'),
    reasonNote: text('reason_note'),
    commandCorrelationId: uuid('command_correlation_id'),
    validationResult: jsonb('validation_result')
      .notNull()
      .default(sql`'{}'::jsonb`),
    exceptionAuthorized: boolean('exception_authorized').notNull().default(false),
    relatedReviewId: uuid('related_review_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('operational_state_transitions_subject_dimension_created_idx').on(
      table.subjectType,
      table.subjectId,
      table.dimension,
      table.createdAt,
    ),
    index('operational_state_transitions_dimension_to_created_idx').on(
      table.dimension,
      table.toValue,
      table.createdAt,
    ),
    index('operational_state_transitions_command_correlation_id_idx').on(
      table.commandCorrelationId,
    ),
    check(
      'operational_state_transitions_value_changed',
      sql`${table.fromValue} is null or ${table.fromValue} <> ${table.toValue}`,
    ),
  ],
);
