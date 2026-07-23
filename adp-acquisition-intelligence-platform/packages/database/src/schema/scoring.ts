import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
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
  definitionLifecycleEnum,
  scoreRecalculationJobStatusEnum,
  scoreResultStatusEnum,
  scoringApprovalStatusEnum,
  subjectTypeEnum,
} from './enums.js';
import { users } from './identity.js';
import { contacts, organizations } from './organizations.js';
import { variableDefinitionVersions, variableDefinitions, variableValues } from './variables.js';

export const completenessDefinitions = pgTable(
  'completeness_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description').notNull(),
    purpose: text('purpose').notNull(),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    status: definitionLifecycleEnum('status').notNull().default('draft'),
    approvalStatus: scoringApprovalStatusEnum('approval_status')
      .notNull()
      .default('draft_unapproved'),
    approvalMetadata: jsonb('approval_metadata'),
    currentVersionId: uuid('current_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('completeness_definitions_key_unique').on(table.key),
    index('completeness_definitions_status_idx').on(table.status),
    index('completeness_definitions_subject_type_idx').on(table.subjectType),
    check(
      'completeness_definitions_active_requires_approval',
      sql`${table.status} <> 'active' or ${table.approvalStatus} = 'approved'`,
    ),
  ],
);

export const completenessDefinitionVersions = pgTable(
  'completeness_definition_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    definitionId: uuid('definition_id')
      .notNull()
      .references(() => completenessDefinitions.id, { onDelete: 'restrict' }),
    version: text('version').notNull(),
    definition: jsonb('definition')
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: definitionLifecycleEnum('status').notNull().default('draft'),
    approvalStatus: scoringApprovalStatusEnum('approval_status')
      .notNull()
      .default('draft_unapproved'),
    approvalMetadata: jsonb('approval_metadata'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('completeness_definition_versions_definition_version_unique').on(
      table.definitionId,
      table.version,
    ),
    index('completeness_definition_versions_definition_id_idx').on(table.definitionId),
    index('completeness_definition_versions_status_idx').on(table.status),
    check(
      'completeness_definition_versions_active_requires_approval',
      sql`${table.status} <> 'active' or (${table.approvalStatus} = 'approved' and ${table.publishedAt} is not null)`,
    ),
  ],
);

export const scoreDefinitions = pgTable(
  'score_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description').notNull(),
    family: text('family').notNull(),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    status: definitionLifecycleEnum('status').notNull().default('draft'),
    approvalStatus: scoringApprovalStatusEnum('approval_status')
      .notNull()
      .default('draft_unapproved'),
    approvalMetadata: jsonb('approval_metadata'),
    currentVersionId: uuid('current_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('score_definitions_key_unique').on(table.key),
    index('score_definitions_status_idx').on(table.status),
    index('score_definitions_subject_type_idx').on(table.subjectType),
    check(
      'score_definitions_active_requires_approval',
      sql`${table.status} <> 'active' or ${table.approvalStatus} = 'approved'`,
    ),
  ],
);

export const scoreDefinitionVersions = pgTable(
  'score_definition_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    definitionId: uuid('definition_id')
      .notNull()
      .references(() => scoreDefinitions.id, { onDelete: 'restrict' }),
    version: text('version').notNull(),
    rangeMin: numeric('range_min', { precision: 10, scale: 4 }).notNull().default('0'),
    rangeMax: numeric('range_max', { precision: 10, scale: 4 }).notNull().default('100'),
    minimumCompleteness: numeric('minimum_completeness', { precision: 5, scale: 4 })
      .notNull()
      .default('0.55'),
    tiers: jsonb('tiers')
      .notNull()
      .default(sql`'{}'::jsonb`),
    confidencePolicy: jsonb('confidence_policy')
      .notNull()
      .default(sql`'{}'::jsonb`),
    recommendationPolicy: jsonb('recommendation_policy')
      .notNull()
      .default(sql`'{}'::jsonb`),
    allowOptionalWeightRenormalization: boolean('allow_optional_weight_renormalization')
      .notNull()
      .default(true),
    status: definitionLifecycleEnum('status').notNull().default('draft'),
    approvalStatus: scoringApprovalStatusEnum('approval_status')
      .notNull()
      .default('draft_unapproved'),
    approvalMetadata: jsonb('approval_metadata'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('score_definition_versions_definition_version_unique').on(
      table.definitionId,
      table.version,
    ),
    index('score_definition_versions_definition_id_idx').on(table.definitionId),
    index('score_definition_versions_status_idx').on(table.status),
    check('score_definition_versions_range_valid', sql`${table.rangeMax} > ${table.rangeMin}`),
    check(
      'score_definition_versions_min_completeness_unit_interval',
      sql`${table.minimumCompleteness} >= 0 and ${table.minimumCompleteness} <= 1`,
    ),
    check(
      'score_definition_versions_active_requires_approval',
      sql`${table.status} <> 'active' or (${table.approvalStatus} = 'approved' and ${table.publishedAt} is not null)`,
    ),
  ],
);

export const scoreComponents = pgTable(
  'score_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scoreDefinitionVersionId: uuid('score_definition_version_id')
      .notNull()
      .references(() => scoreDefinitionVersions.id, { onDelete: 'restrict' }),
    key: text('key').notNull(),
    variableDefinitionId: uuid('variable_definition_id').references(() => variableDefinitions.id, {
      onDelete: 'restrict',
    }),
    variableDefinitionVersionId: uuid('variable_definition_version_id').references(
      () => variableDefinitionVersions.id,
      { onDelete: 'restrict' },
    ),
    weight: numeric('weight', { precision: 8, scale: 6 }).notNull(),
    transform: text('transform').notNull(),
    transformConfig: jsonb('transform_config')
      .notNull()
      .default(sql`'{}'::jsonb`),
    required: boolean('required').notNull().default(false),
    appliesWhen: jsonb('applies_when'),
    missingImpact: text('missing_impact').notNull().default('normal'),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('score_components_version_key_unique').on(
      table.scoreDefinitionVersionId,
      table.key,
    ),
    index('score_components_version_id_idx').on(table.scoreDefinitionVersionId),
    index('score_components_variable_definition_id_idx').on(table.variableDefinitionId),
    check(
      'score_components_weight_unit_interval',
      sql`${table.weight} > 0 and ${table.weight} <= 1`,
    ),
  ],
);

export const scoreInputSnapshots = pgTable(
  'score_input_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scoreDefinitionId: uuid('score_definition_id')
      .notNull()
      .references(() => scoreDefinitions.id, { onDelete: 'restrict' }),
    scoreDefinitionVersionId: uuid('score_definition_version_id')
      .notNull()
      .references(() => scoreDefinitionVersions.id, { onDelete: 'restrict' }),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'restrict' }),
    normalizedInputs: jsonb('normalized_inputs')
      .notNull()
      .default(sql`'{}'::jsonb`),
    valueRefs: jsonb('value_refs')
      .notNull()
      .default(sql`'[]'::jsonb`),
    evidenceRefs: jsonb('evidence_refs')
      .notNull()
      .default(sql`'[]'::jsonb`),
    definitionRefs: jsonb('definition_refs')
      .notNull()
      .default(sql`'[]'::jsonb`),
    definitionDigest: text('definition_digest').notNull(),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('score_input_snapshots_subject_idx').on(
      table.subjectType,
      table.organizationId,
      table.contactId,
    ),
    index('score_input_snapshots_score_version_idx').on(table.scoreDefinitionVersionId),
    check(
      'score_input_snapshots_subject_org_or_contact',
      sql`(${table.subjectType} = 'organization' and ${table.organizationId} is not null and ${table.contactId} is null)
        or (${table.subjectType} = 'contact' and ${table.contactId} is not null and ${table.organizationId} is null)`,
    ),
  ],
);

export const completenessResults = pgTable(
  'completeness_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    completenessDefinitionId: uuid('completeness_definition_id')
      .notNull()
      .references(() => completenessDefinitions.id, { onDelete: 'restrict' }),
    completenessDefinitionVersionId: uuid('completeness_definition_version_id')
      .notNull()
      .references(() => completenessDefinitionVersions.id, { onDelete: 'restrict' }),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'restrict' }),
    purpose: text('purpose').notNull(),
    aggregate: numeric('aggregate', { precision: 5, scale: 4 }),
    status: scoreResultStatusEnum('status').notNull(),
    missingRequired: jsonb('missing_required')
      .notNull()
      .default(sql`'[]'::jsonb`),
    details: jsonb('details')
      .notNull()
      .default(sql`'{}'::jsonb`),
    inputSnapshotId: uuid('input_snapshot_id').references(() => scoreInputSnapshots.id, {
      onDelete: 'restrict',
    }),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('completeness_results_subject_idx').on(
      table.subjectType,
      table.organizationId,
      table.contactId,
    ),
    index('completeness_results_definition_version_idx').on(table.completenessDefinitionVersionId),
    check(
      'completeness_results_aggregate_unit_interval',
      sql`${table.aggregate} is null or (${table.aggregate} >= 0 and ${table.aggregate} <= 1)`,
    ),
    check(
      'completeness_results_subject_org_or_contact',
      sql`(${table.subjectType} = 'organization' and ${table.organizationId} is not null and ${table.contactId} is null)
        or (${table.subjectType} = 'contact' and ${table.contactId} is not null and ${table.organizationId} is null)`,
    ),
  ],
);

export const scoreResults = pgTable(
  'score_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scoreDefinitionId: uuid('score_definition_id')
      .notNull()
      .references(() => scoreDefinitions.id, { onDelete: 'restrict' }),
    scoreDefinitionVersionId: uuid('score_definition_version_id')
      .notNull()
      .references(() => scoreDefinitionVersions.id, { onDelete: 'restrict' }),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'restrict' }),
    inputSnapshotId: uuid('input_snapshot_id')
      .notNull()
      .references(() => scoreInputSnapshots.id, { onDelete: 'restrict' }),
    status: scoreResultStatusEnum('status').notNull(),
    score: numeric('score', { precision: 10, scale: 4 }),
    tier: text('tier'),
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    completeness: numeric('completeness', { precision: 5, scale: 4 }),
    explanation: jsonb('explanation')
      .notNull()
      .default(sql`'{}'::jsonb`),
    recommendation: jsonb('recommendation'),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
    calculationDurationMs: integer('calculation_duration_ms').notNull().default(0),
    previousScoreResultId: uuid('previous_score_result_id'),
    overrideRecommendation: jsonb('override_recommendation'),
    overrideActorUserId: uuid('override_actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    overrideReasonCode: text('override_reason_code'),
    overrideReasonNote: text('override_reason_note'),
    overrideAt: timestamp('override_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.previousScoreResultId],
      foreignColumns: [table.id],
      name: 'score_results_previous_result_fk',
    }),
    index('score_results_subject_idx').on(table.subjectType, table.organizationId, table.contactId),
    index('score_results_definition_version_idx').on(table.scoreDefinitionVersionId),
    index('score_results_calculated_at_idx').on(table.calculatedAt),
    check(
      'score_results_confidence_unit_interval',
      sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 1)`,
    ),
    check(
      'score_results_completeness_unit_interval',
      sql`${table.completeness} is null or (${table.completeness} >= 0 and ${table.completeness} <= 1)`,
    ),
    check(
      'score_results_subject_org_or_contact',
      sql`(${table.subjectType} = 'organization' and ${table.organizationId} is not null and ${table.contactId} is null)
        or (${table.subjectType} = 'contact' and ${table.contactId} is not null and ${table.organizationId} is null)`,
    ),
    check(
      'score_results_override_metadata_valid',
      sql`${table.overrideRecommendation} is null or (${table.overrideActorUserId} is not null and ${table.overrideReasonCode} is not null and ${table.overrideAt} is not null)`,
    ),
  ],
);

export const scoreFactors = pgTable(
  'score_factors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scoreResultId: uuid('score_result_id')
      .notNull()
      .references(() => scoreResults.id, { onDelete: 'restrict' }),
    componentKey: text('component_key').notNull(),
    variableValueId: uuid('variable_value_id').references(() => variableValues.id, {
      onDelete: 'restrict',
    }),
    rawValue: jsonb('raw_value'),
    normalizedValue: jsonb('normalized_value'),
    transformedScore: numeric('transformed_score', { precision: 10, scale: 4 }),
    weight: numeric('weight', { precision: 8, scale: 6 }).notNull(),
    contribution: numeric('contribution', { precision: 10, scale: 4 }),
    status: text('status').notNull(),
    explanation: text('explanation'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('score_factors_result_id_idx').on(table.scoreResultId),
    index('score_factors_component_key_idx').on(table.componentKey),
    check(
      'score_factors_transformed_score_range',
      sql`${table.transformedScore} is null or (${table.transformedScore} >= 0 and ${table.transformedScore} <= 100)`,
    ),
  ],
);

export const scoreRecalculationJobs = pgTable(
  'score_recalculation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idempotencyKey: text('idempotency_key').notNull(),
    eventType: text('event_type').notNull(),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'restrict' }),
    scoreKey: text('score_key'),
    status: scoreRecalculationJobStatusEnum('status').notNull().default('pending'),
    resultId: uuid('result_id').references(() => scoreResults.id, { onDelete: 'set null' }),
    previousResultId: uuid('previous_result_id').references(() => scoreResults.id, {
      onDelete: 'set null',
    }),
    errorMessage: text('error_message'),
    enqueuedAt: timestamp('enqueued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('score_recalculation_jobs_idempotency_key_unique').on(table.idempotencyKey),
    index('score_recalculation_jobs_status_idx').on(table.status),
    index('score_recalculation_jobs_subject_idx').on(
      table.subjectType,
      table.organizationId,
      table.contactId,
    ),
    check(
      'score_recalculation_jobs_subject_org_or_contact',
      sql`(${table.subjectType} = 'organization' and ${table.organizationId} is not null and ${table.contactId} is null)
        or (${table.subjectType} = 'contact' and ${table.contactId} is not null and ${table.organizationId} is null)`,
    ),
  ],
);
