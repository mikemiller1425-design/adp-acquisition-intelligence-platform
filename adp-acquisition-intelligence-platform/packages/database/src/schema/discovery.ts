import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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
  discoveryAgendaStatusEnum,
  discoveryAnswerStatusEnum,
  discoveryAnswerTypeEnum,
  discoveryFollowUpStatusEnum,
  discoveryInterpretationStatusEnum,
  discoveryMappingStatusEnum,
  discoveryParticipantRoleEnum,
  discoveryParticipantStatusEnum,
  discoveryQuestionStatusEnum,
  discoverySessionStatusEnum,
  discoveryTemplateStatusEnum,
  subjectTypeEnum,
} from './enums.js';
import { evidenceRecords } from './evidence.js';
import { users } from './identity.js';
import { contacts, organizations } from './organizations.js';
import { qualificationConditions, qualificationReviews } from './qualification.js';
import { scoreResults } from './scoring.js';
import { tasks } from './work.js';
import { variableDefinitions, variableDefinitionVersions, variableValues } from './variables.js';

export const discoveryTemplates = pgTable(
  'discovery_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    version: text('version').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    motion: text('motion'),
    organizationType: text('organization_type'),
    contactType: text('contact_type'),
    qualificationOutcomes: jsonb('qualification_outcomes')
      .notNull()
      .default(sql`'[]'::jsonb`),
    recommendationRules: jsonb('recommendation_rules')
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: discoveryTemplateStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedByUserId: uuid('published_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('discovery_templates_key_version_unique').on(table.key, table.version),
    index('discovery_templates_status_idx').on(table.status),
    index('discovery_templates_motion_idx').on(table.motion),
    check(
      'discovery_templates_published_metadata_valid',
      sql`${table.status} <> 'published' or ${table.publishedAt} is not null`,
    ),
  ],
);

export const discoveryQuestions = pgTable(
  'discovery_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    version: text('version').notNull(),
    prompt: text('prompt').notNull(),
    helpText: text('help_text'),
    answerType: discoveryAnswerTypeEnum('answer_type').notNull(),
    variableDefinitionId: uuid('variable_definition_id').references(() => variableDefinitions.id, {
      onDelete: 'set null',
    }),
    variableDefinitionVersionId: uuid('variable_definition_version_id').references(
      () => variableDefinitionVersions.id,
      { onDelete: 'set null' },
    ),
    scoreImpact: jsonb('score_impact')
      .notNull()
      .default(sql`'[]'::jsonb`),
    requiredDefault: boolean('required_default').notNull().default(false),
    highImpact: boolean('high_impact').notNull().default(false),
    tags: jsonb('tags')
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: discoveryQuestionStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedByUserId: uuid('published_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('discovery_questions_key_version_unique').on(table.key, table.version),
    index('discovery_questions_status_idx').on(table.status),
    index('discovery_questions_variable_definition_idx').on(table.variableDefinitionId),
    check(
      'discovery_questions_published_metadata_valid',
      sql`${table.status} <> 'published' or ${table.publishedAt} is not null`,
    ),
  ],
);

export const discoveryTemplateQuestions = pgTable(
  'discovery_template_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => discoveryTemplates.id, { onDelete: 'restrict' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => discoveryQuestions.id, { onDelete: 'restrict' }),
    displayOrder: integer('display_order').notNull().default(0),
    required: boolean('required').notNull().default(false),
    rationale: text('rationale'),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('discovery_template_questions_template_question_unique').on(
      table.templateId,
      table.questionId,
    ),
    index('discovery_template_questions_template_order_idx').on(
      table.templateId,
      table.displayOrder,
    ),
    check(
      'discovery_template_questions_display_order_non_negative',
      sql`${table.displayOrder} >= 0`,
    ),
  ],
);

export const discoveryAgendas = pgTable(
  'discovery_agendas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    templateId: uuid('template_id').references(() => discoveryTemplates.id, {
      onDelete: 'set null',
    }),
    status: discoveryAgendaStatusEnum('status').notNull().default('generated'),
    motion: text('motion'),
    organizationType: text('organization_type'),
    contactType: text('contact_type'),
    qualificationOutcome: text('qualification_outcome'),
    context: jsonb('context')
      .notNull()
      .default(sql`'{}'::jsonb`),
    customizations: jsonb('customizations')
      .notNull()
      .default(sql`'[]'::jsonb`),
    generatedByUserId: uuid('generated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    commandCorrelationId: uuid('command_correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('discovery_agendas_org_created_idx').on(table.organizationId, table.createdAt),
    index('discovery_agendas_template_idx').on(table.templateId),
    index('discovery_agendas_command_correlation_id_idx').on(table.commandCorrelationId),
  ],
);

export const discoveryAgendaItems = pgTable(
  'discovery_agenda_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agendaId: uuid('agenda_id')
      .notNull()
      .references(() => discoveryAgendas.id, { onDelete: 'restrict' }),
    questionId: uuid('question_id').references(() => discoveryQuestions.id, {
      onDelete: 'set null',
    }),
    prompt: text('prompt').notNull(),
    reason: text('reason').notNull(),
    reasonCode: text('reason_code').notNull(),
    variables: jsonb('variables')
      .notNull()
      .default(sql`'[]'::jsonb`),
    scoresAffected: jsonb('scores_affected')
      .notNull()
      .default(sql`'[]'::jsonb`),
    priority: integer('priority').notNull(),
    required: boolean('required').notNull().default(false),
    deferred: boolean('deferred').notNull().default(false),
    displayOrder: integer('display_order').notNull(),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('discovery_agenda_items_agenda_order_idx').on(table.agendaId, table.displayOrder),
    index('discovery_agenda_items_question_idx').on(table.questionId),
    check('discovery_agenda_items_priority_non_negative', sql`${table.priority} >= 0`),
    check('discovery_agenda_items_display_order_non_negative', sql`${table.displayOrder} >= 0`),
  ],
);

export const discoverySessions = pgTable(
  'discovery_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    agendaId: uuid('agenda_id').references(() => discoveryAgendas.id, { onDelete: 'set null' }),
    templateId: uuid('template_id').references(() => discoveryTemplates.id, {
      onDelete: 'set null',
    }),
    status: discoverySessionStatusEnum('status').notNull().default('draft'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    scheduledStartAt: timestamp('scheduled_start_at', { withTimezone: true }),
    scheduledEndAt: timestamp('scheduled_end_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    noShowAt: timestamp('no_show_at', { withTimezone: true }),
    incompleteAt: timestamp('incomplete_at', { withTimezone: true }),
    summary: jsonb('summary')
      .notNull()
      .default(sql`'{}'::jsonb`),
    expectedOrganizationRecordVersion: integer('expected_organization_record_version'),
    commandCorrelationId: uuid('command_correlation_id'),
    recordVersion: integer('record_version').notNull().default(1),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('discovery_sessions_org_status_idx').on(table.organizationId, table.status),
    index('discovery_sessions_agenda_idx').on(table.agendaId),
    index('discovery_sessions_owner_status_idx').on(table.ownerUserId, table.status),
    index('discovery_sessions_command_correlation_id_idx').on(table.commandCorrelationId),
    check('discovery_sessions_record_version_positive', sql`${table.recordVersion} > 0`),
    check(
      'discovery_sessions_schedule_window_valid',
      sql`${table.scheduledEndAt} is null or ${table.scheduledStartAt} is null or ${table.scheduledEndAt} > ${table.scheduledStartAt}`,
    ),
  ],
);

export const discoveryParticipants = pgTable(
  'discovery_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => discoverySessions.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    email: text('email'),
    role: discoveryParticipantRoleEnum('role').notNull(),
    status: discoveryParticipantStatusEnum('status').notNull().default('invited'),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('discovery_participants_session_idx').on(table.sessionId),
    index('discovery_participants_contact_idx').on(table.contactId),
    check(
      'discovery_participants_identity_present',
      sql`${table.userId} is not null or ${table.contactId} is not null or ${table.email} is not null`,
    ),
  ],
);

export const discoveryAnswers = pgTable(
  'discovery_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => discoverySessions.id, { onDelete: 'restrict' }),
    agendaItemId: uuid('agenda_item_id').references(() => discoveryAgendaItems.id, {
      onDelete: 'set null',
    }),
    questionId: uuid('question_id').references(() => discoveryQuestions.id, {
      onDelete: 'set null',
    }),
    participantId: uuid('participant_id').references(() => discoveryParticipants.id, {
      onDelete: 'set null',
    }),
    answerType: discoveryAnswerTypeEnum('answer_type').notNull(),
    answerStatus: discoveryAnswerStatusEnum('answer_status').notNull(),
    originalAnswer: jsonb('original_answer'),
    transcriptRef: text('transcript_ref'),
    submittedByUserId: uuid('submitted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('discovery_answers_session_idx').on(table.sessionId),
    index('discovery_answers_question_idx').on(table.questionId),
    index('discovery_answers_agenda_item_idx').on(table.agendaItemId),
    check(
      'discovery_answers_answered_has_payload',
      sql`${table.answerStatus} <> 'answered' or ${table.originalAnswer} is not null`,
    ),
  ],
);

export const discoveryInterpretations = pgTable(
  'discovery_interpretations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    answerId: uuid('answer_id')
      .notNull()
      .references(() => discoveryAnswers.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    normalizedValue: jsonb('normalized_value'),
    variableDefinitionId: uuid('variable_definition_id').references(() => variableDefinitions.id, {
      onDelete: 'set null',
    }),
    variableDefinitionVersionId: uuid('variable_definition_version_id').references(
      () => variableDefinitionVersions.id,
      { onDelete: 'set null' },
    ),
    confidence: integer('confidence'),
    rationale: text('rationale').notNull(),
    status: discoveryInterpretationStatusEnum('status').notNull().default('proposed'),
    proposedByUserId: uuid('proposed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('discovery_interpretations_answer_version_unique').on(
      table.answerId,
      table.version,
    ),
    index('discovery_interpretations_answer_status_idx').on(table.answerId, table.status),
    check('discovery_interpretations_version_positive', sql`${table.version} > 0`),
    check(
      'discovery_interpretations_confidence_percent',
      sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 100)`,
    ),
  ],
);

export const discoveryMappings = pgTable(
  'discovery_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => discoverySessions.id, { onDelete: 'restrict' }),
    answerId: uuid('answer_id')
      .notNull()
      .references(() => discoveryAnswers.id, { onDelete: 'restrict' }),
    interpretationId: uuid('interpretation_id').references(() => discoveryInterpretations.id, {
      onDelete: 'set null',
    }),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'restrict' }),
    variableDefinitionId: uuid('variable_definition_id')
      .notNull()
      .references(() => variableDefinitions.id, { onDelete: 'restrict' }),
    variableDefinitionVersionId: uuid('variable_definition_version_id')
      .notNull()
      .references(() => variableDefinitionVersions.id, { onDelete: 'restrict' }),
    proposedTypedValue: jsonb('proposed_typed_value').notNull(),
    evidenceRecordId: uuid('evidence_record_id').references(() => evidenceRecords.id, {
      onDelete: 'set null',
    }),
    variableValueId: uuid('variable_value_id').references(() => variableValues.id, {
      onDelete: 'set null',
    }),
    status: discoveryMappingStatusEnum('status').notNull().default('proposed'),
    reviewReason: text('review_reason'),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('discovery_mappings_session_status_idx').on(table.sessionId, table.status),
    index('discovery_mappings_answer_idx').on(table.answerId),
    index('discovery_mappings_variable_idx').on(table.variableDefinitionId),
    check(
      'discovery_mappings_subject_org_or_contact',
      sql`(${table.subjectType} = 'organization' and ${table.organizationId} is not null and ${table.contactId} is null)
        or (${table.subjectType} = 'contact' and ${table.contactId} is not null and ${table.organizationId} is null)`,
    ),
    check(
      'discovery_mappings_reviewed_when_terminal',
      sql`${table.status} = 'proposed' or (${table.reviewedByUserId} is not null and ${table.reviewedAt} is not null)`,
    ),
  ],
);

export const discoveryScoreSnapshots = pgTable(
  'discovery_score_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => discoverySessions.id, { onDelete: 'restrict' }),
    mappingId: uuid('mapping_id').references(() => discoveryMappings.id, { onDelete: 'set null' }),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'restrict' }),
    scoreKey: text('score_key').notNull(),
    beforeScoreResultId: uuid('before_score_result_id').references(() => scoreResults.id, {
      onDelete: 'set null',
    }),
    afterScoreResultId: uuid('after_score_result_id').references(() => scoreResults.id, {
      onDelete: 'set null',
    }),
    beforeSnapshot: jsonb('before_snapshot')
      .notNull()
      .default(sql`'{}'::jsonb`),
    afterSnapshot: jsonb('after_snapshot')
      .notNull()
      .default(sql`'{}'::jsonb`),
    recommendationMovement: jsonb('recommendation_movement')
      .notNull()
      .default(sql`'{}'::jsonb`),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('discovery_score_snapshots_session_idx').on(table.sessionId, table.createdAt),
    index('discovery_score_snapshots_score_key_idx').on(table.scoreKey),
    check('discovery_score_snapshots_duration_non_negative', sql`${table.durationMs} >= 0`),
    check(
      'discovery_score_snapshots_subject_org_or_contact',
      sql`(${table.subjectType} = 'organization' and ${table.organizationId} is not null and ${table.contactId} is null)
        or (${table.subjectType} = 'contact' and ${table.contactId} is not null and ${table.organizationId} is null)`,
    ),
  ],
);

export const discoveryFollowUps = pgTable(
  'discovery_follow_ups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => discoverySessions.id, { onDelete: 'restrict' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    answerId: uuid('answer_id').references(() => discoveryAnswers.id, { onDelete: 'set null' }),
    mappingId: uuid('mapping_id').references(() => discoveryMappings.id, { onDelete: 'set null' }),
    qualificationConditionId: uuid('qualification_condition_id').references(
      () => qualificationConditions.id,
      { onDelete: 'set null' },
    ),
    qualificationReviewId: uuid('qualification_review_id').references(
      () => qualificationReviews.id,
      {
        onDelete: 'set null',
      },
    ),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    status: discoveryFollowUpStatusEnum('status').notNull().default('open'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('discovery_follow_ups_session_status_idx').on(table.sessionId, table.status),
    index('discovery_follow_ups_org_status_idx').on(table.organizationId, table.status),
  ],
);

// Drizzle cannot infer this self-contained rule from subject_type's broader enum.
export const discoveryMappingsSubjectTypeFk = foreignKey;
