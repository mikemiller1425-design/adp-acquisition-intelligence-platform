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
  confidenceAssessmentStatusEnum,
  confidenceAssessmentSubjectTypeEnum,
  definitionLifecycleEnum,
  evidenceRelationshipTypeEnum,
  evidenceTypeEnum,
  freshnessResultEnum,
  observationLifecycleEnum,
  sensitivityClassificationEnum,
  subjectTypeEnum,
  valueLifecycleEnum,
  valueStatusEnum,
  variableDataTypeEnum,
} from './enums.js';
import { evidenceRecords } from './evidence.js';
import { users } from './identity.js';
import { contacts, organizations } from './organizations.js';

export const confidenceAssessments = pgTable(
  'confidence_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: confidenceAssessmentSubjectTypeEnum('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    components: jsonb('components')
      .notNull()
      .default(sql`'{}'::jsonb`),
    aggregateScore: numeric('aggregate_score', { precision: 5, scale: 4 }),
    status: confidenceAssessmentStatusEnum('status').notNull().default('unassessed'),
    policyVersion: text('policy_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('confidence_assessments_subject_idx').on(table.subjectType, table.subjectId),
    check(
      'confidence_assessments_aggregate_score_unit_interval',
      sql`${table.aggregateScore} is null or (${table.aggregateScore} >= 0 and ${table.aggregateScore} <= 1)`,
    ),
  ],
);

export const variableDefinitions = pgTable(
  'variable_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    displayLabel: text('display_label').notNull(),
    description: text('description').notNull(),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    dataType: variableDataTypeEnum('data_type').notNull(),
    status: definitionLifecycleEnum('status').notNull().default('draft'),
    currentVersionId: uuid('current_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('variable_definitions_key_unique').on(table.key),
    index('variable_definitions_subject_type_idx').on(table.subjectType),
    index('variable_definitions_status_idx').on(table.status),
    check(
      'variable_definitions_subject_org_or_contact',
      sql`${table.subjectType} in ('organization', 'contact')`,
    ),
  ],
);

export const variableDefinitionVersions = pgTable(
  'variable_definition_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    definitionId: uuid('definition_id')
      .notNull()
      .references(() => variableDefinitions.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    unit: text('unit'),
    allowedValues: jsonb('allowed_values'),
    rangeConstraints: jsonb('range_constraints'),
    nullStatusSemantics: jsonb('null_status_semantics'),
    collectionMethods: jsonb('collection_methods'),
    evidenceRequirements: jsonb('evidence_requirements'),
    confidenceRequirements: jsonb('confidence_requirements'),
    freshnessPolicy: jsonb('freshness_policy'),
    sensitivity: sensitivityClassificationEnum('sensitivity').notNull().default('internal'),
    applicableWorkflows: jsonb('applicable_workflows')
      .notNull()
      .default(sql`'[]'::jsonb`),
    scoreConsumerMetadata: jsonb('score_consumer_metadata'),
    helpText: text('help_text'),
    lifecycleStatus: definitionLifecycleEnum('lifecycle_status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('variable_definition_versions_definition_version_unique').on(
      table.definitionId,
      table.version,
    ),
    index('variable_definition_versions_definition_id_idx').on(table.definitionId),
    index('variable_definition_versions_lifecycle_status_idx').on(table.lifecycleStatus),
    check('variable_definition_versions_version_positive', sql`${table.version} > 0`),
    check(
      'variable_definition_versions_published_when_active',
      sql`${table.lifecycleStatus} <> 'active' or ${table.publishedAt} is not null`,
    ),
  ],
);

export const variableValues = pgTable(
  'variable_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'restrict' }),
    variableDefinitionId: uuid('variable_definition_id')
      .notNull()
      .references(() => variableDefinitions.id, { onDelete: 'restrict' }),
    definitionVersionId: uuid('definition_version_id')
      .notNull()
      .references(() => variableDefinitionVersions.id, { onDelete: 'restrict' }),
    typedValue: jsonb('typed_value').notNull(),
    normalizedValue: jsonb('normalized_value'),
    valueStatus: valueStatusEnum('value_status').notNull().default('known'),
    evidenceType: evidenceTypeEnum('evidence_type').notNull().default('unknown'),
    confidenceStatus: confidenceAssessmentStatusEnum('confidence_status')
      .notNull()
      .default('unassessed'),
    confidenceAssessmentId: uuid('confidence_assessment_id').references(
      () => confidenceAssessments.id,
      {
        onDelete: 'set null',
      },
    ),
    lifecycle: valueLifecycleEnum('lifecycle').notNull().default('proposed'),
    freshnessResult: freshnessResultEnum('freshness_result').notNull().default('unknown'),
    effectiveAt: timestamp('effective_at', { withTimezone: true }),
    observedAt: timestamp('observed_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    sourceActorUserId: uuid('source_actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    calculationActor: text('calculation_actor'),
    supersededById: uuid('superseded_by_id'),
    manualOverrideFlag: boolean('manual_override_flag').notNull().default(false),
    overrideActor: uuid('override_actor').references(() => users.id, { onDelete: 'set null' }),
    overrideReasonCode: text('override_reason_code'),
    overrideReasonNote: text('override_reason_note'),
    overrideAt: timestamp('override_at', { withTimezone: true }),
    originalValueId: uuid('original_value_id'),
    recordVersion: integer('record_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.supersededById],
      foreignColumns: [table.id],
      name: 'variable_values_superseded_by_fk',
    }),
    foreignKey({
      columns: [table.originalValueId],
      foreignColumns: [table.id],
      name: 'variable_values_original_value_fk',
    }),
    uniqueIndex('variable_values_current_org_definition_unique')
      .on(table.organizationId, table.variableDefinitionId)
      .where(
        sql`${table.organizationId} is not null and ${table.lifecycle} = 'current' and ${table.valueStatus} <> 'contradicted'`,
      ),
    uniqueIndex('variable_values_current_contact_definition_unique')
      .on(table.contactId, table.variableDefinitionId)
      .where(
        sql`${table.contactId} is not null and ${table.lifecycle} = 'current' and ${table.valueStatus} <> 'contradicted'`,
      ),
    index('variable_values_subject_definition_idx').on(
      table.subjectType,
      table.organizationId,
      table.contactId,
      table.variableDefinitionId,
    ),
    index('variable_values_definition_version_id_idx').on(table.definitionVersionId),
    index('variable_values_lifecycle_idx').on(table.lifecycle),
    check(
      'variable_values_subject_org_or_contact',
      sql`(${table.subjectType} = 'organization' and ${table.organizationId} is not null and ${table.contactId} is null)
        or (${table.subjectType} = 'contact' and ${table.contactId} is not null and ${table.organizationId} is null)`,
    ),
    check('variable_values_record_version_positive', sql`${table.recordVersion} > 0`),
    check(
      'variable_values_effective_window_valid',
      sql`${table.expiresAt} is null or ${table.effectiveAt} is null or ${table.expiresAt} > ${table.effectiveAt}`,
    ),
    check(
      'variable_values_override_metadata_valid',
      sql`${table.manualOverrideFlag} = false or (${table.overrideActor} is not null and ${table.overrideAt} is not null)`,
    ),
  ],
);

export const researchObservations = pgTable(
  'research_observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'restrict' }),
    claim: text('claim').notNull(),
    evidenceId: uuid('evidence_id').references(() => evidenceRecords.id, { onDelete: 'set null' }),
    proposedDefinitionVersionId: uuid('proposed_definition_version_id').references(
      () => variableDefinitionVersions.id,
      { onDelete: 'set null' },
    ),
    proposedTypedValue: jsonb('proposed_typed_value'),
    normalizedInterpretation: text('normalized_interpretation'),
    proposingUserId: uuid('proposing_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewUserId: uuid('review_user_id').references(() => users.id, { onDelete: 'set null' }),
    lifecycleStatus: observationLifecycleEnum('lifecycle_status').notNull().default('proposed'),
    decisionReason: text('decision_reason'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    resultingVariableValueId: uuid('resulting_variable_value_id').references(
      () => variableValues.id,
      { onDelete: 'set null' },
    ),
    correlationId: uuid('correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('research_observations_correlation_id_unique')
      .on(table.correlationId)
      .where(sql`${table.correlationId} is not null`),
    index('research_observations_subject_idx').on(
      table.subjectType,
      table.organizationId,
      table.contactId,
    ),
    index('research_observations_lifecycle_status_idx').on(table.lifecycleStatus),
    check(
      'research_observations_subject_org_or_contact',
      sql`(${table.subjectType} = 'organization' and ${table.organizationId} is not null and ${table.contactId} is null)
        or (${table.subjectType} = 'contact' and ${table.contactId} is not null and ${table.organizationId} is null)`,
    ),
    check(
      'research_observations_decision_metadata_valid',
      sql`${table.lifecycleStatus} = 'proposed' or ${table.decidedAt} is not null`,
    ),
  ],
);

export const variableValueEvidence = pgTable(
  'variable_value_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    valueId: uuid('value_id')
      .notNull()
      .references(() => variableValues.id, { onDelete: 'cascade' }),
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidenceRecords.id, { onDelete: 'restrict' }),
    relationshipType: evidenceRelationshipTypeEnum('relationship_type').notNull(),
    contributionRole: text('contribution_role'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('variable_value_evidence_value_evidence_relationship_unique').on(
      table.valueId,
      table.evidenceId,
      table.relationshipType,
    ),
    index('variable_value_evidence_evidence_id_idx').on(table.evidenceId),
  ],
);
