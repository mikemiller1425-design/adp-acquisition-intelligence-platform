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

import {
  campaignEnrollmentStatusEnum,
  channelEnum,
  messageApprovalStatusEnum,
  messageDraftStatusEnum,
  outreachActivityTypeEnum,
  outreachDefinitionStatusEnum,
  outreachNextActionStatusEnum,
  outreachRecipientStatusEnum,
  outreachResponseClassificationEnum,
  outreachSequenceStepStatusEnum,
} from './enums.js';
import { users } from './identity.js';
import { contacts, organizations } from './organizations.js';

export const outreachCampaigns = pgTable(
  'outreach_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    status: outreachDefinitionStatusEnum('status').notNull().default('draft'),
    currentVersionId: uuid('current_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('outreach_campaigns_key_unique').on(table.key),
    index('outreach_campaigns_status_idx').on(table.status),
  ],
);

export const messageTemplates = pgTable(
  'message_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    channel: channelEnum('channel').notNull(),
    status: outreachDefinitionStatusEnum('status').notNull().default('draft'),
    currentVersionId: uuid('current_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('message_templates_key_unique').on(table.key),
    index('message_templates_channel_idx').on(table.channel),
    index('message_templates_status_idx').on(table.status),
  ],
);

export const messageTemplateVersions = pgTable(
  'message_template_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => messageTemplates.id, { onDelete: 'restrict' }),
    version: text('version').notNull(),
    subjectTemplate: text('subject_template'),
    bodyTemplate: text('body_template').notNull(),
    contextKeys: jsonb('context_keys')
      .notNull()
      .default(sql`'[]'::jsonb`),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: outreachDefinitionStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedByUserId: uuid('published_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('message_template_versions_template_version_unique').on(
      table.templateId,
      table.version,
    ),
    index('message_template_versions_status_idx').on(table.status),
    check(
      'message_template_versions_published_metadata_valid',
      sql`${table.status} <> 'published' or ${table.publishedAt} is not null`,
    ),
  ],
);

export const outreachSequences = pgTable(
  'outreach_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    status: outreachDefinitionStatusEnum('status').notNull().default('draft'),
    currentVersionId: uuid('current_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('outreach_sequences_key_unique').on(table.key),
    index('outreach_sequences_status_idx').on(table.status),
  ],
);

export const outreachSequenceVersions = pgTable(
  'outreach_sequence_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sequenceId: uuid('sequence_id')
      .notNull()
      .references(() => outreachSequences.id, { onDelete: 'restrict' }),
    version: text('version').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: outreachDefinitionStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedByUserId: uuid('published_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('outreach_sequence_versions_sequence_version_unique').on(
      table.sequenceId,
      table.version,
    ),
    index('outreach_sequence_versions_status_idx').on(table.status),
    check(
      'outreach_sequence_versions_published_metadata_valid',
      sql`${table.status} <> 'published' or ${table.publishedAt} is not null`,
    ),
  ],
);

export const outreachCampaignVersions = pgTable(
  'outreach_campaign_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => outreachCampaigns.id, { onDelete: 'restrict' }),
    version: text('version').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    sequenceVersionId: uuid('sequence_version_id').references(() => outreachSequenceVersions.id, {
      onDelete: 'set null',
    }),
    defaultChannel: channelEnum('default_channel'),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: outreachDefinitionStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedByUserId: uuid('published_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('outreach_campaign_versions_campaign_version_unique').on(
      table.campaignId,
      table.version,
    ),
    index('outreach_campaign_versions_status_idx').on(table.status),
    check(
      'outreach_campaign_versions_published_metadata_valid',
      sql`${table.status} <> 'published' or ${table.publishedAt} is not null`,
    ),
  ],
);

export const outreachSequenceSteps = pgTable(
  'outreach_sequence_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sequenceVersionId: uuid('sequence_version_id')
      .notNull()
      .references(() => outreachSequenceVersions.id, { onDelete: 'restrict' }),
    stepOrder: integer('step_order').notNull(),
    templateVersionId: uuid('template_version_id')
      .notNull()
      .references(() => messageTemplateVersions.id, { onDelete: 'restrict' }),
    channel: channelEnum('channel').notNull(),
    delayDays: integer('delay_days').notNull().default(0),
    waitForResponse: boolean('wait_for_response').notNull().default(false),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('outreach_sequence_steps_version_order_unique').on(
      table.sequenceVersionId,
      table.stepOrder,
    ),
    index('outreach_sequence_steps_template_idx').on(table.templateVersionId),
    check('outreach_sequence_steps_step_order_positive', sql`${table.stepOrder} > 0`),
    check('outreach_sequence_steps_delay_non_negative', sql`${table.delayDays} >= 0`),
  ],
);

export const campaignEnrollments = pgTable(
  'campaign_enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'restrict' }),
    campaignVersionId: uuid('campaign_version_id')
      .notNull()
      .references(() => outreachCampaignVersions.id, { onDelete: 'restrict' }),
    sequenceVersionId: uuid('sequence_version_id')
      .notNull()
      .references(() => outreachSequenceVersions.id, { onDelete: 'restrict' }),
    status: campaignEnrollmentStatusEnum('status').notNull().default('pending'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    currentStepId: uuid('current_step_id').references(() => outreachSequenceSteps.id, {
      onDelete: 'set null',
    }),
    permissionSnapshot: jsonb('permission_snapshot')
      .notNull()
      .default(sql`'{}'::jsonb`),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    exitedAt: timestamp('exited_at', { withTimezone: true }),
    exitReason: text('exit_reason'),
    commandCorrelationId: uuid('command_correlation_id'),
    recordVersion: integer('record_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('campaign_enrollments_org_status_idx').on(table.organizationId, table.status),
    index('campaign_enrollments_contact_idx').on(table.contactId),
    index('campaign_enrollments_command_correlation_id_idx').on(table.commandCorrelationId),
    check('campaign_enrollments_record_version_positive', sql`${table.recordVersion} > 0`),
    check(
      'campaign_enrollments_active_requires_enrolled_at',
      sql`${table.status} not in ('active', 'paused', 'completed') or ${table.enrolledAt} is not null`,
    ),
  ],
);

export const outreachRecipients = pgTable(
  'outreach_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => campaignEnrollments.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'restrict' }),
    channel: channelEnum('channel').notNull(),
    status: outreachRecipientStatusEnum('status').notNull().default('active'),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('outreach_recipients_enrollment_channel_unique').on(
      table.enrollmentId,
      table.channel,
    ),
    index('outreach_recipients_contact_idx').on(table.contactId),
  ],
);

export const messageDrafts = pgTable(
  'message_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => campaignEnrollments.id, { onDelete: 'restrict' }),
    sequenceStepId: uuid('sequence_step_id').references(() => outreachSequenceSteps.id, {
      onDelete: 'set null',
    }),
    templateVersionId: uuid('template_version_id')
      .notNull()
      .references(() => messageTemplateVersions.id, { onDelete: 'restrict' }),
    channel: channelEnum('channel').notNull(),
    status: messageDraftStatusEnum('status').notNull().default('draft'),
    renderedSubject: text('rendered_subject'),
    renderedBody: text('rendered_body').notNull(),
    contextRefs: jsonb('context_refs')
      .notNull()
      .default(sql`'{}'::jsonb`),
    permissionSnapshot: jsonb('permission_snapshot')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('message_drafts_enrollment_status_idx').on(table.enrollmentId, table.status),
    index('message_drafts_template_version_idx').on(table.templateVersionId),
  ],
);

export const messageApprovals = pgTable(
  'message_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => messageDrafts.id, { onDelete: 'restrict' }),
    status: messageApprovalStatusEnum('status').notNull().default('pending'),
    permissionSnapshot: jsonb('permission_snapshot')
      .notNull()
      .default(sql`'{}'::jsonb`),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('message_approvals_draft_status_idx').on(table.draftId, table.status),
    check(
      'message_approvals_terminal_requires_decision',
      sql`${table.status} = 'pending' or (${table.decidedByUserId} is not null and ${table.decidedAt} is not null)`,
    ),
  ],
);

export const outreachActivities = pgTable(
  'outreach_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => campaignEnrollments.id, { onDelete: 'restrict' }),
    draftId: uuid('draft_id').references(() => messageDrafts.id, { onDelete: 'set null' }),
    activityType: outreachActivityTypeEnum('activity_type').notNull(),
    channel: channelEnum('channel').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    immutableSnapshot: jsonb('immutable_snapshot')
      .notNull()
      .default(sql`'{}'::jsonb`),
    permissionSnapshot: jsonb('permission_snapshot')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('outreach_activities_enrollment_occurred_idx').on(table.enrollmentId, table.occurredAt),
    index('outreach_activities_type_idx').on(table.activityType),
  ],
);

export const outreachResponses = pgTable(
  'outreach_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => campaignEnrollments.id, { onDelete: 'restrict' }),
    activityId: uuid('activity_id').references(() => outreachActivities.id, {
      onDelete: 'set null',
    }),
    channel: channelEnum('channel').notNull(),
    originalText: text('original_text').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('outreach_responses_enrollment_received_idx').on(table.enrollmentId, table.receivedAt),
  ],
);

export const responseClassifications = pgTable(
  'response_classifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    responseId: uuid('response_id')
      .notNull()
      .references(() => outreachResponses.id, { onDelete: 'restrict' }),
    classification: outreachResponseClassificationEnum('classification').notNull(),
    classifiedByUserId: uuid('classified_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    classifiedAt: timestamp('classified_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('response_classifications_response_idx').on(table.responseId),
    index('response_classifications_classification_idx').on(table.classification),
  ],
);

export const outreachNextActions = pgTable(
  'outreach_next_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => campaignEnrollments.id, { onDelete: 'restrict' }),
    actionType: text('action_type').notNull(),
    status: outreachNextActionStatusEnum('status').notNull().default('open'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('outreach_next_actions_enrollment_status_idx').on(table.enrollmentId, table.status),
    index('outreach_next_actions_due_idx').on(table.dueAt),
  ],
);

export const outreachSequenceHistory = pgTable(
  'outreach_sequence_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => campaignEnrollments.id, { onDelete: 'restrict' }),
    stepId: uuid('step_id')
      .notNull()
      .references(() => outreachSequenceSteps.id, { onDelete: 'restrict' }),
    status: outreachSequenceStepStatusEnum('status').notNull().default('pending'),
    advancedAt: timestamp('advanced_at', { withTimezone: true }),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('outreach_sequence_history_enrollment_step_unique').on(
      table.enrollmentId,
      table.stepId,
    ),
    index('outreach_sequence_history_enrollment_status_idx').on(table.enrollmentId, table.status),
  ],
);

export const outreachReadinessAssessments = pgTable(
  'outreach_readiness_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    channel: channelEnum('channel'),
    ready: boolean('ready').notNull(),
    reasons: jsonb('reasons')
      .notNull()
      .default(sql`'[]'::jsonb`),
    permissionSnapshot: jsonb('permission_snapshot')
      .notNull()
      .default(sql`'{}'::jsonb`),
    assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull().defaultNow(),
    assessedByUserId: uuid('assessed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('outreach_readiness_assessments_org_assessed_idx').on(
      table.organizationId,
      table.assessedAt,
    ),
    index('outreach_readiness_assessments_contact_idx').on(table.contactId),
  ],
);
