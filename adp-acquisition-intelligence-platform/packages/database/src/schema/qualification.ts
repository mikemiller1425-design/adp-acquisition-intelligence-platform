import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  qualificationConditionStatusEnum,
  qualificationConditionTypeEnum,
  qualificationOutcomeEnum,
  qualificationReviewStatusEnum,
  recordStatusEnum,
} from './enums.js';
import { users } from './identity.js';
import { organizations } from './organizations.js';
import { scoreResults } from './scoring.js';
import { tasks } from './work.js';

export const qualificationReviews = pgTable(
  'qualification_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    status: qualificationReviewStatusEnum('status').notNull().default('pending'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    computedRecommendation: jsonb('computed_recommendation'),
    reviewerRecommendation: jsonb('reviewer_recommendation'),
    recommendationOverridden: boolean('recommendation_overridden').notNull().default(false),
    overrideReasonCode: text('override_reason_code'),
    overrideReasonNote: text('override_reason_note'),
    requiredGaps: jsonb('required_gaps')
      .notNull()
      .default(sql`'[]'::jsonb`),
    consentIndicators: jsonb('consent_indicators')
      .notNull()
      .default(sql`'{}'::jsonb`),
    reviewSummary: jsonb('review_summary')
      .notNull()
      .default(sql`'{}'::jsonb`),
    commandCorrelationId: uuid('command_correlation_id'),
    recordVersion: integer('record_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('qualification_reviews_org_status_idx').on(table.organizationId, table.status),
    index('qualification_reviews_assigned_status_idx').on(table.assignedToUserId, table.status),
    index('qualification_reviews_command_correlation_id_idx').on(table.commandCorrelationId),
    check('qualification_reviews_record_version_positive', sql`${table.recordVersion} > 0`),
    check(
      'qualification_reviews_override_metadata_valid',
      sql`${table.recommendationOverridden} = false or (${table.reviewerRecommendation} is not null and ${table.overrideReasonCode} is not null)`,
    ),
  ],
);

export const qualificationReviewScores = pgTable(
  'qualification_review_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => qualificationReviews.id, { onDelete: 'restrict' }),
    scoreResultId: uuid('score_result_id')
      .notNull()
      .references(() => scoreResults.id, { onDelete: 'restrict' }),
    purpose: text('purpose').notNull().default('qualification'),
    isPrimary: boolean('is_primary').notNull().default(false),
    computedRecommendationSnapshot: jsonb('computed_recommendation_snapshot'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('qualification_review_scores_review_score_unique').on(
      table.reviewId,
      table.scoreResultId,
    ),
    index('qualification_review_scores_score_result_id_idx').on(table.scoreResultId),
  ],
);

export const disqualificationReasons = pgTable(
  'disqualification_reasons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    version: text('version').notNull().default('1.0.0'),
    displayName: text('display_name').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    status: recordStatusEnum('status').notNull().default('active'),
    appliesToOutcomes: jsonb('applies_to_outcomes')
      .notNull()
      .default(sql`'["disqualified"]'::jsonb`),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('disqualification_reasons_key_version_unique').on(table.key, table.version),
    index('disqualification_reasons_key_status_idx').on(table.key, table.status),
    check(
      'disqualification_reasons_effective_window_valid',
      sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
  ],
);

export const qualificationConditions = pgTable(
  'qualification_conditions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => qualificationReviews.id, { onDelete: 'restrict' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    type: qualificationConditionTypeEnum('type').notNull(),
    key: text('key').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    dueDate: date('due_date'),
    status: qualificationConditionStatusEnum('status').notNull().default('pending'),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNote: text('resolution_note'),
    waivedByUserId: uuid('waived_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    waivedAt: timestamp('waived_at', { withTimezone: true }),
    waiverReasonCode: text('waiver_reason_code'),
    waiverReasonNote: text('waiver_reason_note'),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('qualification_conditions_review_status_idx').on(table.reviewId, table.status),
    index('qualification_conditions_org_status_idx').on(table.organizationId, table.status),
    index('qualification_conditions_owner_due_idx').on(table.ownerUserId, table.dueDate),
    check(
      'qualification_conditions_blocking_owner_due_required',
      sql`${table.type} <> 'blocking' or (${table.ownerUserId} is not null and ${table.dueDate} is not null)`,
    ),
    check(
      'qualification_conditions_resolved_metadata_valid',
      sql`${table.status} <> 'resolved' or (${table.resolvedByUserId} is not null and ${table.resolvedAt} is not null)`,
    ),
    check(
      'qualification_conditions_waiver_metadata_valid',
      sql`${table.status} <> 'waived' or (${table.waivedByUserId} is not null and ${table.waivedAt} is not null and ${table.waiverReasonCode} is not null)`,
    ),
  ],
);

export const qualificationDecisions = pgTable(
  'qualification_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => qualificationReviews.id, { onDelete: 'restrict' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    outcome: qualificationOutcomeEnum('outcome').notNull(),
    disqualificationReasonId: uuid('disqualification_reason_id').references(
      () => disqualificationReasons.id,
      { onDelete: 'restrict' },
    ),
    supersedesDecisionId: uuid('supersedes_decision_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    reasonCode: text('reason_code').notNull(),
    reasonNote: text('reason_note'),
    decisionSnapshot: jsonb('decision_snapshot')
      .notNull()
      .default(sql`'{}'::jsonb`),
    commandCorrelationId: uuid('command_correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.supersedesDecisionId],
      foreignColumns: [table.id],
      name: 'qualification_decisions_supersedes_decision_fk',
    }).onDelete('restrict'),
    index('qualification_decisions_review_created_idx').on(table.reviewId, table.createdAt),
    index('qualification_decisions_org_created_idx').on(table.organizationId, table.createdAt),
    index('qualification_decisions_outcome_idx').on(table.outcome),
    check(
      'qualification_decisions_disqualification_reason_required',
      sql`${table.outcome} <> 'disqualified' or ${table.disqualificationReasonId} is not null`,
    ),
  ],
);

export const qualificationRecommendationOverrides = pgTable(
  'qualification_recommendation_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => qualificationReviews.id, { onDelete: 'restrict' }),
    scoreResultId: uuid('score_result_id').references(() => scoreResults.id, {
      onDelete: 'restrict',
    }),
    computedRecommendation: jsonb('computed_recommendation').notNull(),
    reviewerRecommendation: jsonb('reviewer_recommendation').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    reasonCode: text('reason_code').notNull(),
    reasonNote: text('reason_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('qualification_recommendation_overrides_review_idx').on(table.reviewId),
    index('qualification_recommendation_overrides_score_result_idx').on(table.scoreResultId),
  ],
);
