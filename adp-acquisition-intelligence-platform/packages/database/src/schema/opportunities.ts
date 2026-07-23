import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  actorTypeEnum,
  opportunityContactRoleEnum,
  opportunityLossReasonStatusEnum,
  opportunityNextActionStatusEnum,
  opportunityOutcomeTypeEnum,
  opportunityProbabilitySourceEnum,
  opportunityRiskFlagStatusEnum,
  opportunityStageDefinitionStatusEnum,
  opportunityStageEnum,
  recordStatusEnum,
  subjectTypeEnum,
} from './enums.js';
import { users } from './identity.js';
import { contacts, organizations } from './organizations.js';

export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    primaryMotion: text('primary_motion').notNull(),
    opportunityStage: opportunityStageEnum('opportunity_stage').notNull().default('open'),
    name: text('name').notNull(),
    description: text('description'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    recordStatus: recordStatusEnum('record_status').notNull().default('active'),
    recordVersion: integer('record_version').notNull().default(1),
    humanConfirmationAt: timestamp('human_confirmation_at', { withTimezone: true }),
    humanConfirmedByUserId: uuid('human_confirmed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opportunities_organization_idx').on(table.organizationId),
    index('opportunities_stage_idx').on(table.opportunityStage),
    index('opportunities_owner_idx').on(table.ownerUserId),
    index('opportunities_motion_idx').on(table.primaryMotion),
    uniqueIndex('opportunities_org_motion_active_unique')
      .on(table.organizationId, table.primaryMotion)
      .where(sql`${table.opportunityStage} not in ('won', 'lost')`),
    check('opportunities_record_version_positive', sql`${table.recordVersion} > 0`),
    check(
      'opportunities_human_confirmation_required',
      sql`${table.humanConfirmationAt} is not null and ${table.humanConfirmedByUserId} is not null`,
    ),
  ],
);

export const opportunityContacts = pgTable(
  'opportunity_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'restrict' }),
    role: opportunityContactRoleEnum('role').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opportunity_contacts_opportunity_idx').on(table.opportunityId),
    index('opportunity_contacts_contact_idx').on(table.contactId),
    uniqueIndex('opportunity_contacts_active_role_unique')
      .on(table.opportunityId, table.contactId, table.role)
      .where(sql`${table.effectiveTo} is null`),
  ],
);

export const opportunityStageDefinitions = pgTable(
  'opportunity_stage_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stageKey: opportunityStageEnum('stage_key').notNull(),
    version: text('version').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description').notNull(),
    defaultProbability: numeric('default_probability', { precision: 5, scale: 2 }),
    entryCriteria: jsonb('entry_criteria')
      .notNull()
      .default(sql`'{}'::jsonb`),
    exitCriteria: jsonb('exit_criteria')
      .notNull()
      .default(sql`'{}'::jsonb`),
    maxAgeDays: integer('max_age_days'),
    status: opportunityStageDefinitionStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedByUserId: uuid('published_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('opportunity_stage_definitions_key_version_unique').on(
      table.stageKey,
      table.version,
    ),
    index('opportunity_stage_definitions_status_idx').on(table.status),
  ],
);

export const opportunityStageTransitions = pgTable(
  'opportunity_stage_transitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'restrict' }),
    fromStage: opportunityStageEnum('from_stage'),
    toStage: opportunityStageEnum('to_stage').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorType: actorTypeEnum('actor_type').notNull(),
    reasonCode: text('reason_code'),
    reasonNote: text('reason_note'),
    commandCorrelationId: uuid('command_correlation_id'),
    validationResult: jsonb('validation_result')
      .notNull()
      .default(sql`'{}'::jsonb`),
    exceptionAuthorized: boolean('exception_authorized').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opportunity_stage_transitions_opportunity_created_idx').on(
      table.opportunityId,
      table.createdAt,
    ),
    index('opportunity_stage_transitions_correlation_idx').on(table.commandCorrelationId),
    check(
      'opportunity_stage_transitions_value_changed',
      sql`${table.fromStage} is null or ${table.fromStage} <> ${table.toStage}`,
    ),
  ],
);

export const opportunityValues = pgTable(
  'opportunity_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 18, scale: 2 }),
    currency: text('currency'),
    valueBand: text('value_band'),
    source: text('source').notNull().default('manual'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    setByUserId: uuid('set_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reasonNote: text('reason_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opportunity_values_opportunity_effective_idx').on(
      table.opportunityId,
      table.effectiveFrom,
    ),
    check(
      'opportunity_values_currency_required_when_amount',
      sql`${table.amount} is null or (${table.currency} is not null and length(trim(${table.currency})) > 0)`,
    ),
  ],
);

export const opportunityProbabilities = pgTable(
  'opportunity_probabilities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'restrict' }),
    probability: numeric('probability', { precision: 5, scale: 2 }),
    source: opportunityProbabilitySourceEnum('source').notNull(),
    stageKey: opportunityStageEnum('stage_key'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    setByUserId: uuid('set_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reasonNote: text('reason_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opportunity_probabilities_opportunity_effective_idx').on(
      table.opportunityId,
      table.effectiveFrom,
    ),
    check(
      'opportunity_probabilities_range_valid',
      sql`${table.probability} is null or (${table.probability} >= 0 and ${table.probability} <= 100)`,
    ),
  ],
);

export const opportunityNextActions = pgTable(
  'opportunity_next_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    description: text('description'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    status: opportunityNextActionStatusEnum('status').notNull().default('open'),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opportunity_next_actions_opportunity_status_idx').on(table.opportunityId, table.status),
    index('opportunity_next_actions_due_idx').on(table.dueAt),
  ],
);

export const opportunityRiskFlags = pgTable(
  'opportunity_risk_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'restrict' }),
    flagKey: text('flag_key').notNull(),
    severity: text('severity').notNull().default('medium'),
    description: text('description').notNull(),
    status: opportunityRiskFlagStatusEnum('status').notNull().default('open'),
    raisedByUserId: uuid('raised_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opportunity_risk_flags_opportunity_status_idx').on(table.opportunityId, table.status),
    uniqueIndex('opportunity_risk_flags_open_key_unique')
      .on(table.opportunityId, table.flagKey)
      .where(sql`${table.status} = 'open'`),
  ],
);

export const opportunityLossReasons = pgTable(
  'opportunity_loss_reasons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: opportunityLossReasonStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('opportunity_loss_reasons_key_unique').on(table.key),
    index('opportunity_loss_reasons_status_idx').on(table.status),
  ],
);

export const opportunityOutcomes = pgTable(
  'opportunity_outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'restrict' }),
    outcomeType: opportunityOutcomeTypeEnum('outcome_type').notNull(),
    lossReasonId: uuid('loss_reason_id').references(() => opportunityLossReasons.id, {
      onDelete: 'restrict',
    }),
    priorStage: opportunityStageEnum('prior_stage'),
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull().defaultNow(),
    closedByUserId: uuid('closed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    supersededByOutcomeId: uuid('superseded_by_outcome_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opportunity_outcomes_opportunity_created_idx').on(table.opportunityId, table.createdAt),
    index('opportunity_outcomes_current_idx')
      .on(table.opportunityId)
      .where(sql`${table.supersededAt} is null`),
    check(
      'opportunity_outcomes_loss_reason_required',
      sql`${table.outcomeType} <> 'lost' or ${table.lossReasonId} is not null`,
    ),
  ],
);

export const opportunityHistory = pgTable(
  'opportunity_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'restrict' }),
    changeType: text('change_type').notNull(),
    fieldName: text('field_name'),
    priorValue: jsonb('prior_value'),
    newValue: jsonb('new_value'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    commandCorrelationId: uuid('command_correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opportunity_history_opportunity_created_idx').on(table.opportunityId, table.createdAt),
  ],
);

export const opportunityEligibilityAssessments = pgTable(
  'opportunity_eligibility_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    motion: text('motion').notNull(),
    eligible: boolean('eligible').notNull(),
    reasons: jsonb('reasons')
      .notNull()
      .default(sql`'[]'::jsonb`),
    assessedByUserId: uuid('assessed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opportunity_eligibility_org_motion_assessed_idx').on(
      table.organizationId,
      table.motion,
      table.assessedAt,
    ),
  ],
);

export const opportunityContextLinks = pgTable(
  'opportunity_context_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'restrict' }),
    linkType: text('link_type').notNull(),
    linkedSubjectType: subjectTypeEnum('linked_subject_type').notNull(),
    linkedSubjectId: uuid('linked_subject_id').notNull(),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('opportunity_context_links_unique').on(
      table.opportunityId,
      table.linkType,
      table.linkedSubjectId,
    ),
    index('opportunity_context_links_subject_idx').on(
      table.linkedSubjectType,
      table.linkedSubjectId,
    ),
  ],
);
