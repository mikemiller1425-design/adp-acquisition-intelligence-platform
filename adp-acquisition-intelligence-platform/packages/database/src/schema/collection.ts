import { sql } from 'drizzle-orm';
import {
  bigint as pgBigint,
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
  duplicateCandidateDispositionEnum,
  duplicateDispositionEnum,
  duplicateMatchTierEnum,
  importBatchLifecycleStatusEnum,
  importBatchSourceEnum,
  importCommitResultEnum,
  importEntityLinkActionEnum,
  importEntityTypeEnum,
  mergeEventStatusEnum,
  subjectTypeEnum,
} from './enums.js';
import { users } from './identity.js';
import { organizations } from './organizations.js';

export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    filename: text('filename').notNull(),
    artifactRef: text('artifact_ref').notNull(),
    contentHash: text('content_hash').notNull(),
    fileSizeBytes: pgBigint('file_size_bytes', { mode: 'number' }).notNull(),
    contentType: text('content_type').notNull().default('text/csv'),
    encoding: text('encoding').notNull().default('utf-8'),
    delimiter: text('delimiter').notNull().default(','),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    source: importBatchSourceEnum('source').notNull(),
    mappingVersion: text('mapping_version').notNull().default('field_registry.v1'),
    validationPolicyVersion: text('validation_policy_version').notNull().default('validation.v1'),
    normalizationPolicyVersion: text('normalization_policy_version')
      .notNull()
      .default('normalization.v1'),
    status: importBatchLifecycleStatusEnum('status').notNull().default('uploaded'),
    rowCount: integer('row_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    warningCount: integer('warning_count').notNull().default(0),
    duplicateReviewCount: integer('duplicate_review_count').notNull().default(0),
    committedCount: integer('committed_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    revertedCount: integer('reverted_count').notNull().default(0),
    idempotencyKey: text('idempotency_key').notNull(),
    correlationId: uuid('correlation_id'),
    retentionExpiresAt: timestamp('retention_expires_at', { withTimezone: true }),
    mapping: jsonb('mapping')
      .notNull()
      .default(sql`'{}'::jsonb`),
    previewReport: jsonb('preview_report'),
    commitReport: jsonb('commit_report'),
    reversalReport: jsonb('reversal_report'),
    recordVersion: integer('record_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('import_batches_idempotency_key_unique').on(table.idempotencyKey),
    index('import_batches_status_idx').on(table.status),
    index('import_batches_correlation_id_idx').on(table.correlationId),
    index('import_batches_retention_expires_at_idx').on(table.retentionExpiresAt),
    check(
      'import_batches_filename_safe',
      sql`${table.filename} <> ''
        and strpos(${table.filename}, '/') = 0
        and strpos(${table.filename}, chr(92)) = 0
        and ${table.filename} !~ '[[:cntrl:]]'`,
    ),
    check(
      'import_batches_artifact_ref_private',
      sql`${table.artifactRef} <> '' and ${table.artifactRef} !~* '^https?://'`,
    ),
    check('import_batches_content_hash_present', sql`${table.contentHash} <> ''`),
    check('import_batches_file_size_nonnegative', sql`${table.fileSizeBytes} >= 0`),
    check('import_batches_delimiter_valid', sql`char_length(${table.delimiter}) between 1 and 4`),
    check(
      'import_batches_counts_nonnegative',
      sql`${table.rowCount} >= 0
        and ${table.errorCount} >= 0
        and ${table.warningCount} >= 0
        and ${table.duplicateReviewCount} >= 0
        and ${table.committedCount} >= 0
        and ${table.skippedCount} >= 0
        and ${table.revertedCount} >= 0`,
    ),
    check('import_batches_record_version_positive', sql`${table.recordVersion} > 0`),
  ],
);

export const importRows = pgTable(
  'import_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id, { onDelete: 'cascade' }),
    sourceRowNumber: integer('source_row_number').notNull(),
    rawRowHash: text('raw_row_hash').notNull(),
    rawArtifactRef: text('raw_artifact_ref'),
    mappedFields: jsonb('mapped_fields')
      .notNull()
      .default(sql`'{}'::jsonb`),
    normalizedFields: jsonb('normalized_fields')
      .notNull()
      .default(sql`'{}'::jsonb`),
    validationResults: jsonb('validation_results')
      .notNull()
      .default(sql`'{}'::jsonb`),
    duplicateDisposition: duplicateDispositionEnum('duplicate_disposition')
      .notNull()
      .default('pending'),
    commitResult: importCommitResultEnum('commit_result').notNull().default('pending'),
    createdEntityRefs: jsonb('created_entity_refs')
      .notNull()
      .default(sql`'[]'::jsonb`),
    evidenceRefs: jsonb('evidence_refs')
      .notNull()
      .default(sql`'[]'::jsonb`),
    observationRefs: jsonb('observation_refs')
      .notNull()
      .default(sql`'[]'::jsonb`),
    variableProposalRefs: jsonb('variable_proposal_refs')
      .notNull()
      .default(sql`'[]'::jsonb`),
    rejectionReason: text('rejection_reason'),
    skipReason: text('skip_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('import_rows_batch_source_row_unique').on(table.batchId, table.sourceRowNumber),
    index('import_rows_batch_id_idx').on(table.batchId),
    index('import_rows_duplicate_disposition_idx').on(table.duplicateDisposition),
    index('import_rows_commit_result_idx').on(table.commitResult),
    check('import_rows_source_row_number_positive', sql`${table.sourceRowNumber} > 0`),
    check('import_rows_raw_row_hash_present', sql`${table.rawRowHash} <> ''`),
    check(
      'import_rows_raw_artifact_ref_private',
      sql`${table.rawArtifactRef} is null or ${table.rawArtifactRef} !~* '^https?://'`,
    ),
  ],
);

export const importEntityLinks = pgTable(
  'import_entity_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id, { onDelete: 'restrict' }),
    importRowId: uuid('import_row_id').references(() => importRows.id, { onDelete: 'set null' }),
    entityType: importEntityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: importEntityLinkActionEnum('action').notNull(),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('import_entity_links_batch_id_idx').on(table.batchId),
    index('import_entity_links_import_row_id_idx').on(table.importRowId),
    index('import_entity_links_entity_idx').on(table.entityType, table.entityId),
  ],
);

export const duplicateCandidates = pgTable(
  'duplicate_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id').references(() => importBatches.id, { onDelete: 'set null' }),
    subjectType: subjectTypeEnum('subject_type').notNull().default('organization'),
    leftOrganizationId: uuid('left_organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    rightOrganizationId: uuid('right_organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    matchTier: duplicateMatchTierEnum('match_tier').notNull(),
    matchScore: numeric('match_score', { precision: 5, scale: 4 }),
    matchPolicyVersion: text('match_policy_version').notNull(),
    features: jsonb('features')
      .notNull()
      .default(sql`'{}'::jsonb`),
    explanation: text('explanation'),
    disposition: duplicateCandidateDispositionEnum('disposition').notNull().default('pending'),
    reviewerUserId: uuid('reviewer_user_id').references(() => users.id, { onDelete: 'set null' }),
    reasonCode: text('reason_code'),
    reasonNote: text('reason_note'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('duplicate_candidates_batch_id_idx').on(table.batchId),
    index('duplicate_candidates_left_org_idx').on(table.leftOrganizationId),
    index('duplicate_candidates_right_org_idx').on(table.rightOrganizationId),
    index('duplicate_candidates_review_queue_idx').on(
      table.disposition,
      table.matchTier,
      table.createdAt,
    ),
    index('duplicate_candidates_pending_review_idx')
      .on(table.createdAt)
      .where(sql`${table.disposition} = 'pending'`),
    check('duplicate_candidates_subject_organization', sql`${table.subjectType} = 'organization'`),
    check(
      'duplicate_candidates_distinct_organizations',
      sql`${table.leftOrganizationId} <> ${table.rightOrganizationId}`,
    ),
    check(
      'duplicate_candidates_match_score_unit_interval',
      sql`${table.matchScore} is null or (${table.matchScore} >= 0 and ${table.matchScore} <= 1)`,
    ),
    check(
      'duplicate_candidates_decision_metadata_valid',
      sql`${table.disposition} = 'pending' or ${table.decidedAt} is not null`,
    ),
  ],
);

export const mergeEvents = pgTable(
  'merge_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    survivorOrganizationId: uuid('survivor_organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    absorbedOrganizationId: uuid('absorbed_organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    status: mergeEventStatusEnum('status').notNull().default('planned'),
    impactPreview: jsonb('impact_preview')
      .notNull()
      .default(sql`'{}'::jsonb`),
    movedChildren: jsonb('moved_children')
      .notNull()
      .default(sql`'[]'::jsonb`),
    beforeRefs: jsonb('before_refs')
      .notNull()
      .default(sql`'{}'::jsonb`),
    afterRefs: jsonb('after_refs')
      .notNull()
      .default(sql`'{}'::jsonb`),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    approverUserId: uuid('approver_user_id').references(() => users.id, { onDelete: 'set null' }),
    reasonCode: text('reason_code'),
    reasonNote: text('reason_note'),
    correlationId: uuid('correlation_id'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    reversalPreview: jsonb('reversal_preview'),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversalBlockerReport: jsonb('reversal_blocker_report'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('merge_events_incomplete_pair_unique')
      .on(table.survivorOrganizationId, table.absorbedOrganizationId)
      .where(
        sql`${table.completedAt} is null
          and ${table.reversedAt} is null
          and ${table.status} in ('planned', 'manual_remediation_required')`,
      ),
    index('merge_events_survivor_org_idx').on(table.survivorOrganizationId),
    index('merge_events_absorbed_org_idx').on(table.absorbedOrganizationId),
    index('merge_events_status_idx').on(table.status),
    index('merge_events_correlation_id_idx').on(table.correlationId),
    check(
      'merge_events_completion_metadata_valid',
      sql`${table.status} <> 'completed' or ${table.completedAt} is not null`,
    ),
    check(
      'merge_events_reversal_metadata_valid',
      sql`${table.status} <> 'reversed' or ${table.reversedAt} is not null`,
    ),
  ],
);
