import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations.js';
import { users } from './identity.js';

export const populationSourceApprovalStatusEnum = pgEnum('population_source_approval_status', [
  'draft',
  'under_review',
  'approved',
  'enabled',
  'suspended',
  'retired',
]);

export const populationImportStatusEnum = pgEnum('population_import_status', [
  'uploaded',
  'mapping',
  'validating',
  'normalizing',
  'resolving',
  'preview_ready',
  'committing',
  'committed',
  'failed',
  'reversed',
]);

export const rawCandidateStatusEnum = pgEnum('raw_candidate_status', [
  'raw',
  'normalized',
  'resolved',
  'rejected',
  'restricted',
  'ambiguous',
]);

export const entityResolutionDecisionEnum = pgEnum('entity_resolution_decision', [
  'create_new',
  'link_existing',
  'create_location',
  'possible_duplicate',
  'ambiguous_review',
  'reject',
  'restricted',
  'existing_relationship',
  'out_of_territory',
]);

export const approvedSourceLifecycleEnum = pgEnum('approved_source_lifecycle', [
  'draft',
  'under_review',
  'approved',
  'enabled',
  'suspended',
  'retired',
]);

export const approvedSourceAdapterTypeEnum = pgEnum('approved_source_adapter_type', [
  'bulk_archive',
  'public_api',
  'licensed_data',
  'archived_web',
  'structured_metadata',
  'organization_website',
  'fixture',
]);

export const researchPriorityTierEnum = pgEnum('research_priority_tier', ['A', 'B', 'C', 'D']);

export const collectionRunStatusEnum = pgEnum('collection_run_status', [
  'draft',
  'queued',
  'running',
  'cancelling',
  'cancelled',
  'completed',
  'failed',
  'blocked',
]);

export const collectionJobStatusEnum = pgEnum('collection_job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'blocked',
  'skipped',
]);

export const extractedClaimReviewStatusEnum = pgEnum('extracted_claim_review_status', [
  'proposed',
  'accepted',
  'accepted_corrected',
  'rejected',
  'duplicate',
  'contradictory',
  'deferred',
  'needs_research',
  'source_problem',
]);

export const populationSources = pgTable(
  'population_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceKey: text('source_key').notNull(),
    displayName: text('display_name').notNull(),
    provider: text('provider').notNull(),
    sourceType: text('source_type').notNull(),
    licenseStatus: text('license_status').notNull(),
    permittedFields: jsonb('permitted_fields').$type<string[]>().notNull().default([]),
    prohibitedFields: jsonb('prohibited_fields').$type<string[]>().notNull().default([]),
    geographicCoverage: text('geographic_coverage'),
    organizationCoverage: text('organization_coverage'),
    refreshFrequency: text('refresh_frequency'),
    dataOwner: text('data_owner').notNull(),
    approvalStatus: populationSourceApprovalStatusEnum('approval_status')
      .notNull()
      .default('draft'),
    retentionRequirements: text('retention_requirements'),
    currentVersion: text('current_version').notNull().default('v1'),
    effectiveDate: timestamp('effective_date', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('population_sources_source_key_unique').on(t.sourceKey),
    index('population_sources_approval_status_idx').on(t.approvalStatus),
  ],
);

export const populationSourceVersions = pgTable(
  'population_source_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    populationSourceId: uuid('population_source_id')
      .notNull()
      .references(() => populationSources.id, { onDelete: 'restrict' }),
    version: text('version').notNull(),
    licensePolicy: jsonb('license_policy').$type<Record<string, unknown>>().notNull().default({}),
    schemaMapping: jsonb('schema_mapping').$type<Record<string, unknown>>().notNull().default({}),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('population_source_versions_source_version_unique').on(
      t.populationSourceId,
      t.version,
    ),
  ],
);

export const populationImports = pgTable(
  'population_imports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    populationSourceId: uuid('population_source_id')
      .notNull()
      .references(() => populationSources.id, { onDelete: 'restrict' }),
    sourceVersionId: uuid('source_version_id').references(() => populationSourceVersions.id, {
      onDelete: 'set null',
    }),
    status: populationImportStatusEnum('status').notNull().default('uploaded'),
    idempotencyKey: text('idempotency_key').notNull(),
    storageKey: text('storage_key'),
    rowCount: integer('row_count').notNull().default(0),
    acceptedCount: integer('accepted_count').notNull().default(0),
    rejectedCount: integer('rejected_count').notNull().default(0),
    matchedCount: integer('matched_count').notNull().default(0),
    createdCount: integer('created_count').notNull().default(0),
    ambiguousCount: integer('ambiguous_count').notNull().default(0),
    dryRun: boolean('dry_run').notNull().default(true),
    report: jsonb('report').$type<Record<string, unknown>>().notNull().default({}),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    committedAt: timestamp('committed_at', { withTimezone: true }),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('population_imports_idempotency_unique').on(t.idempotencyKey),
    index('population_imports_source_idx').on(t.populationSourceId),
    index('population_imports_status_idx').on(t.status),
    check(
      'population_imports_counts_non_negative',
      sql`${t.rowCount} >= 0 and ${t.acceptedCount} >= 0 and ${t.rejectedCount} >= 0`,
    ),
  ],
);

export const populationImportRows = pgTable(
  'population_import_rows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    populationImportId: uuid('population_import_id')
      .notNull()
      .references(() => populationImports.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    normalizedPayload: jsonb('normalized_payload').$type<Record<string, unknown>>(),
    validationErrors: jsonb('validation_errors').$type<string[]>().notNull().default([]),
    identityKey: text('identity_key'),
    status: rawCandidateStatusEnum('status').notNull().default('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('population_import_rows_import_row_unique').on(t.populationImportId, t.rowNumber),
    index('population_import_rows_identity_idx').on(t.identityKey),
  ],
);

export const rawCandidates = pgTable(
  'raw_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    populationImportId: uuid('population_import_id').references(() => populationImports.id, {
      onDelete: 'set null',
    }),
    populationImportRowId: uuid('population_import_row_id').references(
      () => populationImportRows.id,
      { onDelete: 'set null' },
    ),
    identityKey: text('identity_key').notNull(),
    displayName: text('display_name'),
    legalName: text('legal_name'),
    domain: text('domain'),
    website: text('website'),
    phone: text('phone'),
    addressLine1: text('address_line1'),
    city: text('city'),
    region: text('region'),
    postalCode: text('postal_code'),
    country: text('country'),
    externalIdentifiers: jsonb('external_identifiers')
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
    normalized: jsonb('normalized').$type<Record<string, unknown>>().notNull().default({}),
    status: rawCandidateStatusEnum('status').notNull().default('raw'),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('raw_candidates_identity_idx').on(t.identityKey),
    index('raw_candidates_domain_idx').on(t.domain),
    index('raw_candidates_status_idx').on(t.status),
    index('raw_candidates_organization_idx').on(t.organizationId),
  ],
);

export const entityResolutionRuns = pgTable(
  'entity_resolution_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    populationImportId: uuid('population_import_id').references(() => populationImports.id, {
      onDelete: 'set null',
    }),
    policyVersion: text('policy_version').notNull(),
    status: text('status').notNull().default('completed'),
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('entity_resolution_runs_import_idx').on(t.populationImportId)],
);

export const entityResolutionCandidates = pgTable(
  'entity_resolution_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resolutionRunId: uuid('resolution_run_id')
      .notNull()
      .references(() => entityResolutionRuns.id, { onDelete: 'cascade' }),
    rawCandidateId: uuid('raw_candidate_id')
      .notNull()
      .references(() => rawCandidates.id, { onDelete: 'cascade' }),
    candidateOrganizationId: uuid('candidate_organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    matchConfidence: integer('match_confidence').notNull().default(0),
    contributingSignals: jsonb('contributing_signals').$type<unknown[]>().notNull().default([]),
    conflictingSignals: jsonb('conflicting_signals').$type<unknown[]>().notNull().default([]),
    recommendedAction: entityResolutionDecisionEnum('recommended_action').notNull(),
    decisionVersion: text('decision_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('entity_resolution_candidates_run_idx').on(t.resolutionRunId),
    index('entity_resolution_candidates_raw_idx').on(t.rawCandidateId),
    check(
      'entity_resolution_candidates_confidence_range',
      sql`${t.matchConfidence} >= 0 and ${t.matchConfidence} <= 100`,
    ),
  ],
);

export const entityResolutionDecisions = pgTable(
  'entity_resolution_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resolutionCandidateId: uuid('resolution_candidate_id')
      .notNull()
      .references(() => entityResolutionCandidates.id, { onDelete: 'cascade' }),
    decision: entityResolutionDecisionEnum('decision').notNull(),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    rationale: text('rationale'),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('entity_resolution_decisions_candidate_idx').on(t.resolutionCandidateId)],
);

export const approvedSources = pgTable(
  'approved_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceKey: text('source_key').notNull(),
    displayName: text('display_name').notNull(),
    domains: jsonb('domains').$type<string[]>().notNull().default([]),
    adapterType: approvedSourceAdapterTypeEnum('adapter_type').notNull(),
    classification: text('classification').notNull(),
    businessPurpose: text('business_purpose').notNull(),
    permittedOrganizationTypes: jsonb('permitted_organization_types')
      .$type<string[]>()
      .notNull()
      .default([]),
    permittedFields: jsonb('permitted_fields').$type<string[]>().notNull().default([]),
    prohibitedFields: jsonb('prohibited_fields').$type<string[]>().notNull().default([]),
    termsReviewStatus: text('terms_review_status').notNull().default('pending'),
    robotsBehavior: text('robots_behavior').notNull().default('respect'),
    privacyReviewStatus: text('privacy_review_status').notNull().default('pending'),
    legalReviewStatus: text('legal_review_status').notNull().default('pending'),
    securityReviewStatus: text('security_review_status').notNull().default('pending'),
    rateLimitPerMinute: integer('rate_limit_per_minute').notNull().default(10),
    concurrencyLimit: integer('concurrency_limit').notNull().default(2),
    pageLimit: integer('page_limit').notNull().default(8),
    responseSizeLimitBytes: integer('response_size_limit_bytes').notNull().default(1_048_576),
    timeoutMs: integer('timeout_ms').notNull().default(10_000),
    redirectPolicy: text('redirect_policy').notNull().default('same_registrable_domain'),
    refreshIntervalHours: integer('refresh_interval_hours').notNull().default(168),
    snapshotRetentionDays: integer('snapshot_retention_days').notNull().default(90),
    parserVersion: text('parser_version').notNull().default('v1'),
    owner: text('owner').notNull(),
    lifecycle: approvedSourceLifecycleEnum('lifecycle').notNull().default('draft'),
    killSwitchActive: boolean('kill_switch_active').notNull().default(false),
    approvalEvidence: jsonb('approval_evidence')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('approved_sources_source_key_unique').on(t.sourceKey),
    index('approved_sources_lifecycle_idx').on(t.lifecycle),
  ],
);

export const researchPriorityAssessments = pgTable(
  'research_priority_assessments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    policyVersion: text('policy_version').notNull(),
    tier: researchPriorityTierEnum('tier').notNull(),
    explanation: text('explanation').notNull(),
    highImpactMissingVariables: jsonb('high_impact_missing_variables')
      .$type<string[]>()
      .notNull()
      .default([]),
    recommendedSources: jsonb('recommended_sources').$type<string[]>().notNull().default([]),
    estimatedWork: text('estimated_work'),
    nextEligibleResearchAt: timestamp('next_eligible_research_at', { withTimezone: true }),
    blockingReasons: jsonb('blocking_reasons').$type<string[]>().notNull().default([]),
    factors: jsonb('factors').$type<Record<string, unknown>>().notNull().default({}),
    assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('research_priority_assessments_org_idx').on(t.organizationId),
    index('research_priority_assessments_tier_idx').on(t.tier),
  ],
);

export const collectionRuns = pgTable(
  'collection_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    status: collectionRunStatusEnum('status').notNull().default('draft'),
    approvedSourceId: uuid('approved_source_id').references(() => approvedSources.id, {
      onDelete: 'restrict',
    }),
    policyVersion: text('policy_version').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    killSwitchObserved: boolean('kill_switch_observed').notNull().default(false),
    targetCount: integer('target_count').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    blockedCount: integer('blocked_count').notNull().default(0),
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default({}),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('collection_runs_idempotency_unique').on(t.idempotencyKey),
    index('collection_runs_status_idx').on(t.status),
  ],
);

export const collectionRunTargets = pgTable(
  'collection_run_targets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    collectionRunId: uuid('collection_run_id')
      .notNull()
      .references(() => collectionRuns.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    canonicalDomain: text('canonical_domain'),
    priorityTier: researchPriorityTierEnum('priority_tier'),
    status: collectionJobStatusEnum('status').notNull().default('queued'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('collection_run_targets_run_org_unique').on(t.collectionRunId, t.organizationId),
    index('collection_run_targets_status_idx').on(t.status),
  ],
);

export const collectionJobs = pgTable(
  'collection_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    collectionRunId: uuid('collection_run_id')
      .notNull()
      .references(() => collectionRuns.id, { onDelete: 'cascade' }),
    collectionRunTargetId: uuid('collection_run_target_id').references(
      () => collectionRunTargets.id,
      {
        onDelete: 'set null',
      },
    ),
    jobType: text('job_type').notNull(),
    status: collectionJobStatusEnum('status').notNull().default('queued'),
    attemptCount: integer('attempt_count').notNull().default(0),
    idempotencyKey: text('idempotency_key').notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('collection_jobs_idempotency_unique').on(t.idempotencyKey),
    index('collection_jobs_run_idx').on(t.collectionRunId),
    index('collection_jobs_status_idx').on(t.status),
  ],
);

export const collectionAttempts = pgTable(
  'collection_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    collectionRunId: uuid('collection_run_id')
      .notNull()
      .references(() => collectionRuns.id, { onDelete: 'cascade' }),
    collectionJobId: uuid('collection_job_id').references(() => collectionJobs.id, {
      onDelete: 'set null',
    }),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    approvedSourceId: uuid('approved_source_id').references(() => approvedSources.id, {
      onDelete: 'set null',
    }),
    requestedUrl: text('requested_url').notNull(),
    finalUrl: text('final_url'),
    domain: text('domain'),
    status: text('status').notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    httpStatus: integer('http_status'),
    contentHash: text('content_hash'),
    redirectChain: jsonb('redirect_chain').$type<string[]>().notNull().default([]),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('collection_attempts_run_idx').on(t.collectionRunId),
    index('collection_attempts_organization_idx').on(t.organizationId),
    index('collection_attempts_status_idx').on(t.status),
    check(
      'collection_attempts_status_check',
      sql`${t.status} in ('queued', 'running', 'succeeded', 'failed', 'blocked', 'cancelled')`,
    ),
  ],
);

export const sourceSnapshots = pgTable(
  'source_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    approvedSourceId: uuid('approved_source_id').references(() => approvedSources.id, {
      onDelete: 'set null',
    }),
    collectionJobId: uuid('collection_job_id').references(() => collectionJobs.id, {
      onDelete: 'set null',
    }),
    requestedUrl: text('requested_url').notNull(),
    finalUrl: text('final_url').notNull(),
    domain: text('domain').notNull(),
    adapterVersion: text('adapter_version').notNull(),
    policyVersion: text('policy_version').notNull(),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull(),
    httpStatus: integer('http_status'),
    contentType: text('content_type'),
    contentLength: integer('content_length'),
    contentHash: text('content_hash').notNull(),
    etag: text('etag'),
    lastModified: text('last_modified'),
    redirectChain: jsonb('redirect_chain').$type<string[]>().notNull().default([]),
    parserVersion: text('parser_version').notNull(),
    storageKey: text('storage_key'),
    retentionExpiresAt: timestamp('retention_expires_at', { withTimezone: true }),
    unchangedFromSnapshotId: uuid('unchanged_from_snapshot_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('source_snapshots_org_idx').on(t.organizationId),
    index('source_snapshots_content_hash_idx').on(t.contentHash),
    index('source_snapshots_domain_idx').on(t.domain),
    uniqueIndex('source_snapshots_job_url_hash_unique').on(
      t.collectionJobId,
      t.requestedUrl,
      t.contentHash,
    ),
  ],
);

export const extractionRuns = pgTable(
  'extraction_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceSnapshotId: uuid('source_snapshot_id')
      .notNull()
      .references(() => sourceSnapshots.id, { onDelete: 'cascade' }),
    extractorVersion: text('extractor_version').notNull(),
    mappingVersion: text('mapping_version').notNull(),
    status: text('status').notNull().default('completed'),
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('extraction_runs_snapshot_idx').on(t.sourceSnapshotId)],
);

export const extractedClaims = pgTable(
  'extracted_claims',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    extractionRunId: uuid('extraction_run_id')
      .notNull()
      .references(() => extractionRuns.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    variableKey: text('variable_key').notNull(),
    subjectType: text('subject_type').notNull().default('organization'),
    originalExcerpt: text('original_excerpt').notNull(),
    proposedValue: jsonb('proposed_value').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceSnapshotId: uuid('source_snapshot_id')
      .notNull()
      .references(() => sourceSnapshots.id, { onDelete: 'restrict' }),
    extractorVersion: text('extractor_version').notNull(),
    mappingVersion: text('mapping_version').notNull(),
    confidenceComponents: jsonb('confidence_components')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    explanation: text('explanation').notNull(),
    reviewStatus: extractedClaimReviewStatusEnum('review_status').notNull().default('proposed'),
    existingValueComparison: jsonb('existing_value_comparison').$type<Record<string, unknown>>(),
    affectedCompletenessPurposes: jsonb('affected_completeness_purposes')
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedScores: jsonb('affected_scores').$type<string[]>().notNull().default([]),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewRationale: text('review_rationale'),
    correctedValue: jsonb('corrected_value'),
    canonicalEvidenceId: uuid('canonical_evidence_id'),
    canonicalVariableValueId: uuid('canonical_variable_value_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('extracted_claims_org_idx').on(t.organizationId),
    index('extracted_claims_review_status_idx').on(t.reviewStatus),
    index('extracted_claims_variable_key_idx').on(t.variableKey),
  ],
);

export const collectionCoverage = pgTable(
  'collection_coverage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sourcesEligible: integer('sources_eligible').notNull().default(0),
    sourcesAttempted: integer('sources_attempted').notNull().default(0),
    sourcesCompleted: integer('sources_completed').notNull().default(0),
    sourcesBlocked: integer('sources_blocked').notNull().default(0),
    pagesRetrieved: integer('pages_retrieved').notNull().default(0),
    archivedPagesReused: integer('archived_pages_reused').notNull().default(0),
    pagesUnchanged: integer('pages_unchanged').notNull().default(0),
    claimsExtracted: integer('claims_extracted').notNull().default(0),
    claimsAccepted: integer('claims_accepted').notNull().default(0),
    claimsAwaitingReview: integer('claims_awaiting_review').notNull().default(0),
    variablesImproved: integer('variables_improved').notNull().default(0),
    lastCollectionAt: timestamp('last_collection_at', { withTimezone: true }),
    nextEligibleRefreshAt: timestamp('next_eligible_refresh_at', { withTimezone: true }),
    remainingHighImpactGaps: jsonb('remaining_high_impact_gaps')
      .$type<string[]>()
      .notNull()
      .default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('collection_coverage_org_unique').on(t.organizationId)],
);

export const sourceRateLimitStates = pgTable(
  'source_rate_limit_states',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    approvedSourceId: uuid('approved_source_id')
      .notNull()
      .references(() => approvedSources.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
    requestCount: integer('request_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('source_rate_limit_states_source_domain_unique').on(t.approvedSourceId, t.domain),
  ],
);
