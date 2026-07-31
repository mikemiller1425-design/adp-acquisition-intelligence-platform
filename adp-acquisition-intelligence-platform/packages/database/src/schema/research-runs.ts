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

export const researchRunModeEnum = pgEnum('research_run_mode', [
  'fixture',
  'dry_run',
  'archive_only',
  'archive_first_live_fallback',
  'live_official_site_only',
]);

export const researchRunStatusEnum = pgEnum('research_run_status', [
  'draft',
  'validating',
  'awaiting_approval',
  'queued',
  'running',
  'pausing',
  'paused',
  'completed',
  'blocked',
  'cancelled',
  'failed',
]);

export const researchRunTargetStatusEnum = pgEnum('research_run_target_status', [
  'pending',
  'queued',
  'running',
  'succeeded',
  'failed',
  'blocked',
  'skipped',
  'cancelled',
]);

export const durableJobStatusEnum = pgEnum('durable_job_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'dead',
  'cancelled',
]);

export const researchRunDefinitions = pgTable(
  'research_run_definitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    objective: text('objective').notNull(),
    mode: researchRunModeEnum('mode').notNull().default('archive_only'),
    configSnapshot: jsonb('config_snapshot').$type<Record<string, unknown>>().notNull().default({}),
    targetQuerySnapshot: jsonb('target_query_snapshot')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    policyVersions: jsonb('policy_versions').$type<Record<string, unknown>>().notNull().default({}),
    sourceKeys: jsonb('source_keys').$type<string[]>().notNull().default([]),
    maxOrganizations: integer('max_organizations').notNull().default(0),
    maxPagesPerOrganization: integer('max_pages_per_organization').notNull().default(0),
    maxTotalRequests: integer('max_total_requests').notNull().default(0),
    archiveFirst: boolean('archive_first').notNull().default(true),
    liveFallback: boolean('live_fallback').notNull().default(false),
    dryRun: boolean('dry_run').notNull().default(false),
    freshnessThresholdHours: integer('freshness_threshold_hours').notNull().default(168),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'research_run_definitions_limits_non_negative',
      sql`${t.maxOrganizations} >= 0 and ${t.maxPagesPerOrganization} >= 0 and ${t.maxTotalRequests} >= 0`,
    ),
  ],
);

export const researchRuns = pgTable(
  'research_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    definitionId: uuid('definition_id')
      .notNull()
      .references(() => researchRunDefinitions.id, { onDelete: 'cascade' }),
    status: researchRunStatusEnum('status').notNull().default('draft'),
    mode: researchRunModeEnum('mode').notNull().default('archive_only'),
    correlationId: text('correlation_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    configSnapshot: jsonb('config_snapshot').$type<Record<string, unknown>>().notNull().default({}),
    targetQuerySnapshot: jsonb('target_query_snapshot')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    policyVersions: jsonb('policy_versions').$type<Record<string, unknown>>().notNull().default({}),
    approvalEvidence: jsonb('approval_evidence')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    initiatingUserId: uuid('initiating_user_id'),
    killSwitchActive: boolean('kill_switch_active').notNull().default(false),
    pauseReason: text('pause_reason'),
    cancelReason: text('cancel_reason'),
    errorSummary: jsonb('error_summary').$type<Record<string, unknown>>().notNull().default({}),
    targetsTotal: integer('targets_total').notNull().default(0),
    targetsCompleted: integer('targets_completed').notNull().default(0),
    targetsFailed: integer('targets_failed').notNull().default(0),
    targetsBlocked: integer('targets_blocked').notNull().default(0),
    requestsConsumed: integer('requests_consumed').notNull().default(0),
    archiveHits: integer('archive_hits').notNull().default(0),
    liveFallbacks: integer('live_fallbacks').notNull().default(0),
    pagesRetrieved: integer('pages_retrieved').notNull().default(0),
    snapshotsCreated: integer('snapshots_created').notNull().default(0),
    claimsProposed: integer('claims_proposed').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('research_runs_idempotency_key_unique').on(t.idempotencyKey),
    index('research_runs_status_idx').on(t.status),
  ],
);

export const researchRunTargets = pgTable(
  'research_run_targets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    researchRunId: uuid('research_run_id')
      .notNull()
      .references(() => researchRuns.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    canonicalDomain: text('canonical_domain'),
    status: researchRunTargetStatusEnum('status').notNull().default('pending'),
    checkpoint: jsonb('checkpoint').$type<Record<string, unknown>>().notNull().default({}),
    lastError: text('last_error'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('research_run_targets_run_status_idx').on(t.researchRunId, t.status)],
);

export const researchRunSourceAttempts = pgTable('research_run_source_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  researchRunId: uuid('research_run_id')
    .notNull()
    .references(() => researchRuns.id, { onDelete: 'cascade' }),
  targetId: uuid('target_id')
    .notNull()
    .references(() => researchRunTargets.id, { onDelete: 'cascade' }),
  sourceKey: text('source_key').notNull(),
  adapterType: text('adapter_type').notNull(),
  status: text('status').notNull().default('queued'),
  requestedUrl: text('requested_url'),
  finalUrl: text('final_url'),
  httpStatus: integer('http_status'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull().default({}),
  contentHash: text('content_hash'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const researchRunEvents = pgTable('research_run_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  researchRunId: uuid('research_run_id')
    .notNull()
    .references(() => researchRuns.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const researchRunMetrics = pgTable('research_run_metrics', {
  id: uuid('id').defaultRandom().primaryKey(),
  researchRunId: uuid('research_run_id')
    .notNull()
    .references(() => researchRuns.id, { onDelete: 'cascade' }),
  metricKey: text('metric_key').notNull(),
  metricValue: jsonb('metric_value').$type<Record<string, unknown>>().notNull().default({}),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const researchRunApprovals = pgTable('research_run_approvals', {
  id: uuid('id').defaultRandom().primaryKey(),
  researchRunId: uuid('research_run_id')
    .notNull()
    .references(() => researchRuns.id, { onDelete: 'cascade' }),
  approvalType: text('approval_type').notNull(),
  status: text('status').notNull().default('pending'),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  decidedByUserId: uuid('decided_by_user_id'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const researchRunCheckpoints = pgTable(
  'research_run_checkpoints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    researchRunId: uuid('research_run_id')
      .notNull()
      .references(() => researchRuns.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id'),
    checkpointKey: text('checkpoint_key').notNull(),
    checkpointPayload: jsonb('checkpoint_payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('research_run_checkpoints_unique').on(t.researchRunId, t.checkpointKey)],
);

export const durableJobs = pgTable(
  'durable_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    idempotencyKey: text('idempotency_key'),
    correlationId: text('correlation_id'),
    status: durableJobStatusEnum('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('durable_jobs_idempotency_key_unique').on(t.idempotencyKey),
    index('durable_jobs_claim_idx').on(t.status, t.availableAt),
  ],
);

export const workerHeartbeats = pgTable('worker_heartbeats', {
  workerId: text('worker_id').primaryKey(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
});
