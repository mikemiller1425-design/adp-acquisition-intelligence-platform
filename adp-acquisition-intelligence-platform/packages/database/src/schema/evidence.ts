import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  accessClassificationEnum,
  evidenceTypeEnum,
  permissionEvidenceSubjectTypeEnum,
  reviewerStatusEnum,
  sourceStatusEnum,
  sourceTypeEnum,
  subjectTypeEnum,
} from './enums.js';
import { users } from './identity.js';
import { contacts, organizations } from './organizations.js';

export const sources = pgTable(
  'sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceType: sourceTypeEnum('source_type').notNull(),
    title: text('title').notNull(),
    locator: text('locator'),
    publisher: text('publisher'),
    defaultReliability: numeric('default_reliability', { precision: 5, scale: 4 }),
    accessClassification: accessClassificationEnum('access_classification')
      .notNull()
      .default('public'),
    retrievalRestrictions: jsonb('retrieval_restrictions')
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: sourceStatusEnum('status').notNull().default('active'),
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
    uniqueIndex('sources_locator_unique').on(table.locator).where(sql`${table.locator} is not null`),
    index('sources_source_type_idx').on(table.sourceType),
    index('sources_status_idx').on(table.status),
    check(
      'sources_default_reliability_unit_interval',
      sql`${table.defaultReliability} is null or (${table.defaultReliability} >= 0 and ${table.defaultReliability} <= 1)`,
    ),
  ],
);

export const evidenceRecords = pgTable(
  'evidence_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'restrict' }),
    sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'restrict' }),
    claim: text('claim').notNull(),
    structuredPayload: jsonb('structured_payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    evidenceType: evidenceTypeEnum('evidence_type').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull().defaultNow(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    sourceReliability: numeric('source_reliability', { precision: 5, scale: 4 }),
    specificity: numeric('specificity', { precision: 5, scale: 4 }),
    recency: numeric('recency', { precision: 5, scale: 4 }),
    crossSourceAgreement: numeric('cross_source_agreement', { precision: 5, scale: 4 }),
    extractionCertainty: numeric('extraction_certainty', { precision: 5, scale: 4 }),
    reviewerStatus: reviewerStatusEnum('reviewer_status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    supersededById: uuid('superseded_by_id'),
    contentHash: text('content_hash').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    correlationId: uuid('correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.supersededById],
      foreignColumns: [table.id],
      name: 'evidence_records_superseded_by_fk',
    }),
    uniqueIndex('evidence_records_content_hash_unique').on(table.contentHash),
    index('evidence_records_subject_created_idx').on(
      table.subjectType,
      table.organizationId,
      table.contactId,
      table.createdAt,
    ),
    index('evidence_records_source_id_idx').on(table.sourceId),
    index('evidence_records_type_idx').on(table.evidenceType),
    index('evidence_records_reviewer_status_idx').on(table.reviewerStatus),
    check(
      'evidence_records_subject_org_or_contact',
      sql`(${table.subjectType} = 'organization' and ${table.organizationId} is not null and ${table.contactId} is null)
        or (${table.subjectType} = 'contact' and ${table.contactId} is not null and ${table.organizationId} is null)`,
    ),
    check(
      'evidence_records_effective_window_valid',
      sql`${table.expiresAt} is null or ${table.effectiveAt} is null or ${table.expiresAt} > ${table.effectiveAt}`,
    ),
    check(
      'evidence_records_reviewed_when_terminal',
      sql`${table.reviewerStatus} in ('pending', 'needs_review') or ${table.reviewedAt} is not null`,
    ),
    check(
      'evidence_records_source_reliability_unit_interval',
      sql`${table.sourceReliability} is null or (${table.sourceReliability} >= 0 and ${table.sourceReliability} <= 1)`,
    ),
    check(
      'evidence_records_specificity_unit_interval',
      sql`${table.specificity} is null or (${table.specificity} >= 0 and ${table.specificity} <= 1)`,
    ),
    check(
      'evidence_records_recency_unit_interval',
      sql`${table.recency} is null or (${table.recency} >= 0 and ${table.recency} <= 1)`,
    ),
    check(
      'evidence_records_cross_source_agreement_unit_interval',
      sql`${table.crossSourceAgreement} is null or (${table.crossSourceAgreement} >= 0 and ${table.crossSourceAgreement} <= 1)`,
    ),
    check(
      'evidence_records_extraction_certainty_unit_interval',
      sql`${table.extractionCertainty} is null or (${table.extractionCertainty} >= 0 and ${table.extractionCertainty} <= 1)`,
    ),
  ],
);

export const permissionEvidenceLinks = pgTable(
  'permission_evidence_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: permissionEvidenceSubjectTypeEnum('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    evidenceRecordId: uuid('evidence_record_id')
      .notNull()
      .references(() => evidenceRecords.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('permission_evidence_links_subject_evidence_unique').on(
      table.subjectType,
      table.subjectId,
      table.evidenceRecordId,
    ),
    index('permission_evidence_links_evidence_record_id_idx').on(table.evidenceRecordId),
  ],
);
