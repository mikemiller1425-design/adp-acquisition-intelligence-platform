import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  auditEvents,
  checkDatabaseHealth,
  completenessDefinitions,
  contacts,
  disqualificationReasons,
  duplicateCandidates,
  evidenceRecords,
  importBatches,
  importRows,
  mapDatabaseError,
  mergeEvents,
  organizationLocations,
  organizations,
  permissionEvidenceLinks,
  qualificationReviews,
  scoreDefinitions,
  sources,
  users,
  variableDefinitions,
  variableDefinitionVersions,
  variableValues,
} from '../index.js';
import {
  acquireTestDatabaseLock,
  createTestDatabaseClient,
  getTestDatabaseUrl,
  migrateTestDatabase,
  type TestDatabaseLock,
} from '../testing/setup.js';

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const testDatabaseUrl = getTestDatabaseUrl();
const expectedVariableDefinitionCount = 56;

describe.sequential('database integration tooling', () => {
  let lock: TestDatabaseLock;

  beforeAll(async () => {
    lock = await acquireTestDatabaseLock(testDatabaseUrl);
  }, 120_000);

  afterAll(async () => {
    await lock?.release();
  });

  it('applies migrations on an empty database', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const client = createTestDatabaseClient(testDatabaseUrl);

    try {
      const tables = await client.sql<{ table_name: string }[]>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
        order by table_name
      `;

      expect(tables.map((row) => row.table_name)).toContain('organizations');
      expect(tables.map((row) => row.table_name)).toContain('contact_channel_permissions');
      expect(tables.map((row) => row.table_name)).toContain('sources');
      expect(tables.map((row) => row.table_name)).toContain('evidence_records');
      expect(tables.map((row) => row.table_name)).toContain('research_observations');
      expect(tables.map((row) => row.table_name)).toContain('variable_definitions');
      expect(tables.map((row) => row.table_name)).toContain('variable_definition_versions');
      expect(tables.map((row) => row.table_name)).toContain('variable_values');
      expect(tables.map((row) => row.table_name)).toContain('variable_value_evidence');
      expect(tables.map((row) => row.table_name)).toContain('permission_evidence_links');
      expect(tables.map((row) => row.table_name)).toContain('confidence_assessments');
      expect(tables.map((row) => row.table_name)).toContain('outbox_events');
    } finally {
      await client.close();
    }
  });

  it('is idempotent when migrations are re-run through the Drizzle journal', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const before = await migrationJournalCount();

    await migrateTestDatabase({ databaseUrl: testDatabaseUrl });
    const after = await migrationJournalCount();

    expect(after).toBe(before);
    expect(after).toBeGreaterThan(0);
  });

  it('applies Prompt 6 and Prompt 7 migrations after the Prompt 5 schema migrations', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const client = createTestDatabaseClient(testDatabaseUrl);

    try {
      const journalCount = await migrationJournalCount();
      const journal = JSON.parse(
        await readFile(new URL('../../migrations/meta/_journal.json', import.meta.url), 'utf8'),
      ) as { entries: Array<{ tag: string }> };

      expect(journalCount).toBe(12);
      expect(journal.entries.map((row) => row.tag)).toEqual([
        '0000_parched_electro',
        '0001_integrity_guards',
        '0002_lyrical_daimon_hellstrom',
        '0003_melted_inertia',
        '0004_prompt_5_scoring_engine',
        '0005_prompt_6_qualification_workflow',
        '0006_lowly_molly_hayes',
        '0007_square_galactus',
        '0008_bizarre_tarantula',
        '0009_prompt_10_reporting',
        '0010_phase_1_1_population_research',
        '0011_phase_1_1_collection_attempts',
      ]);

      const researchCore = await client.sql<{ table_name: string }[]>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in (
            'population_sources',
            'raw_candidates',
            'approved_sources',
            'collection_runs',
            'source_snapshots',
            'extracted_claims',
            'collection_coverage'
          )
        order by table_name
      `;
      expect(researchCore.map((row) => row.table_name)).toEqual([
        'approved_sources',
        'collection_coverage',
        'collection_runs',
        'extracted_claims',
        'population_sources',
        'raw_candidates',
        'source_snapshots',
      ]);

      const discoveryTables = await client.sql<{ table_name: string }[]>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name like 'discovery_%'
        order by table_name
      `;
      expect(discoveryTables.map((row) => row.table_name)).toEqual([
        'discovery_agenda_items',
        'discovery_agendas',
        'discovery_answers',
        'discovery_follow_ups',
        'discovery_interpretations',
        'discovery_mappings',
        'discovery_participants',
        'discovery_questions',
        'discovery_score_snapshots',
        'discovery_sessions',
        'discovery_template_questions',
        'discovery_templates',
      ]);

      const outreachTables = await client.sql<{ table_name: string }[]>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in (
            'outreach_campaigns',
            'outreach_campaign_versions',
            'message_templates',
            'message_template_versions',
            'outreach_sequences',
            'outreach_sequence_versions',
            'outreach_sequence_steps',
            'campaign_enrollments',
            'outreach_recipients',
            'message_drafts',
            'message_approvals',
            'outreach_activities',
            'outreach_responses',
            'response_classifications',
            'outreach_next_actions',
            'outreach_sequence_history',
            'outreach_readiness_assessments'
          )
        order by table_name
      `;
      expect(outreachTables.map((row) => row.table_name)).toEqual([
        'campaign_enrollments',
        'message_approvals',
        'message_drafts',
        'message_template_versions',
        'message_templates',
        'outreach_activities',
        'outreach_campaign_versions',
        'outreach_campaigns',
        'outreach_next_actions',
        'outreach_readiness_assessments',
        'outreach_recipients',
        'outreach_responses',
        'outreach_sequence_history',
        'outreach_sequence_steps',
        'outreach_sequence_versions',
        'outreach_sequences',
        'response_classifications',
      ]);

      const opportunityTables = await client.sql<{ table_name: string }[]>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in (
            'opportunities',
            'opportunity_contacts',
            'opportunity_context_links',
            'opportunity_eligibility_assessments',
            'opportunity_history',
            'opportunity_loss_reasons',
            'opportunity_next_actions',
            'opportunity_outcomes',
            'opportunity_probabilities',
            'opportunity_risk_flags',
            'opportunity_stage_definitions',
            'opportunity_stage_transitions',
            'opportunity_values'
          )
        order by table_name
      `;
      expect(opportunityTables.map((row) => row.table_name)).toEqual([
        'opportunities',
        'opportunity_contacts',
        'opportunity_context_links',
        'opportunity_eligibility_assessments',
        'opportunity_history',
        'opportunity_loss_reasons',
        'opportunity_next_actions',
        'opportunity_outcomes',
        'opportunity_probabilities',
        'opportunity_risk_flags',
        'opportunity_stage_definitions',
        'opportunity_stage_transitions',
        'opportunity_values',
      ]);

      const reportingTables = await client.sql<{ table_name: string }[]>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in ('saved_views', 'export_jobs')
        order by table_name
      `;
      expect(reportingTables.map((row) => row.table_name)).toEqual(['export_jobs', 'saved_views']);
    } finally {
      await client.close();
    }
  });

  it('applies Prompt 4 collection tables, constraints, and deletion guards', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const client = createTestDatabaseClient(testDatabaseUrl);

    try {
      const tables = await client.sql<{ table_name: string }[]>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in (
            'import_batches',
            'import_rows',
            'import_entity_links',
            'duplicate_candidates',
            'merge_events'
          )
        order by table_name
      `;
      expect(tables.map((row) => row.table_name)).toEqual([
        'duplicate_candidates',
        'import_batches',
        'import_entity_links',
        'import_rows',
        'merge_events',
      ]);

      const constraints = await client.sql<{ conname: string }[]>`
        select conname
        from pg_constraint
        where conname in (
          'import_batches_filename_safe',
          'import_batches_artifact_ref_private',
          'duplicate_candidates_distinct_organizations',
          'merge_events_completion_metadata_valid'
        )
        order by conname
      `;
      expect(constraints.map((row) => row.conname)).toEqual([
        'duplicate_candidates_distinct_organizations',
        'import_batches_artifact_ref_private',
        'import_batches_filename_safe',
        'merge_events_completion_metadata_valid',
      ]);

      const indexes = await client.sql<{ indexname: string }[]>`
        select indexname
        from pg_indexes
        where schemaname = 'public'
          and indexname in (
            'import_batches_idempotency_key_unique',
            'import_rows_batch_source_row_unique',
            'import_entity_links_entity_idx',
            'duplicate_candidates_review_queue_idx',
            'merge_events_incomplete_pair_unique'
          )
        order by indexname
      `;
      expect(indexes.map((row) => row.indexname)).toEqual([
        'duplicate_candidates_review_queue_idx',
        'import_batches_idempotency_key_unique',
        'import_entity_links_entity_idx',
        'import_rows_batch_source_row_unique',
        'merge_events_incomplete_pair_unique',
      ]);

      const triggers = await client.sql<{ tgname: string }[]>`
        select tgname
        from pg_trigger
        where tgname in (
          'import_batches_reject_hard_delete',
          'import_rows_reject_hard_delete',
          'merge_events_reject_hard_delete'
        )
        order by tgname
      `;
      expect(triggers.map((row) => row.tgname)).toEqual([
        'import_batches_reject_hard_delete',
        'import_rows_reject_hard_delete',
        'merge_events_reject_hard_delete',
      ]);

      await expect(
        client.db.insert(importBatches).values({
          filename: 'unsafe/name.csv',
          artifactRef: 'private/imports/unsafe.csv',
          contentHash: 'sha256:unsafe',
          fileSizeBytes: 12,
          source: 'csv_upload',
          idempotencyKey: 'unsafe-import',
        }),
      ).rejects.toSatisfy((error: unknown) => mapDatabaseError(error)?.kind === 'check');

      const batch = first(
        await client.db
          .insert(importBatches)
          .values({
            filename: 'safe-import.csv',
            artifactRef: 'private/imports/safe-import.csv',
            contentHash: 'sha256:safe-import',
            fileSizeBytes: 128,
            source: 'csv_upload',
            idempotencyKey: 'safe-import',
          })
          .returning({ id: importBatches.id }),
      );

      const row = first(
        await client.db
          .insert(importRows)
          .values({
            batchId: batch.id,
            sourceRowNumber: 1,
            rawRowHash: 'sha256:row-1',
          })
          .returning({ id: importRows.id }),
      );

      await expect(
        client.db.insert(importRows).values({
          batchId: batch.id,
          sourceRowNumber: 1,
          rawRowHash: 'sha256:row-1-duplicate',
        }),
      ).rejects.toSatisfy((error: unknown) => mapDatabaseError(error)?.kind === 'unique');

      await expect(client.db.delete(importRows).where(eq(importRows.id, row.id))).rejects.toSatisfy(
        (error: unknown) => errorText(error).includes('hard delete is forbidden'),
      );
      await expect(
        client.db.delete(importBatches).where(eq(importBatches.id, batch.id)),
      ).rejects.toSatisfy((error: unknown) =>
        errorText(error).includes('hard delete is forbidden'),
      );

      const leftOrganization = first(
        await client.db
          .insert(organizations)
          .values({
            displayName: 'Left Merge Advisors',
            normalizedName: 'left merge advisors',
            normalizedDomain: 'left-merge.example.com',
          })
          .returning({ id: organizations.id }),
      );
      const rightOrganization = first(
        await client.db
          .insert(organizations)
          .values({
            displayName: 'Right Merge Advisors',
            normalizedName: 'right merge advisors',
            normalizedDomain: 'right-merge.example.com',
          })
          .returning({ id: organizations.id }),
      );

      await expect(
        client.db.insert(duplicateCandidates).values({
          batchId: batch.id,
          leftOrganizationId: leftOrganization.id,
          rightOrganizationId: leftOrganization.id,
          matchTier: 'exact',
          matchScore: '1.0000',
          matchPolicyVersion: 'duplicate_match.v1',
        }),
      ).rejects.toSatisfy((error: unknown) => mapDatabaseError(error)?.kind === 'check');

      const mergeEvent = first(
        await client.db
          .insert(mergeEvents)
          .values({
            survivorOrganizationId: leftOrganization.id,
            absorbedOrganizationId: rightOrganization.id,
            status: 'planned',
          })
          .returning({ id: mergeEvents.id }),
      );

      await expect(
        client.db.delete(mergeEvents).where(eq(mergeEvents.id, mergeEvent.id)),
      ).rejects.toSatisfy((error: unknown) =>
        errorText(error).includes('hard delete is forbidden'),
      );
    } finally {
      await client.close();
    }
  });

  it('applies Prompt 5 scoring tables, activation guards, and append-only protections', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const client = createTestDatabaseClient(testDatabaseUrl);

    try {
      const tables = await client.sql<{ table_name: string }[]>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in (
            'completeness_definitions',
            'completeness_definition_versions',
            'completeness_results',
            'score_definitions',
            'score_definition_versions',
            'score_components',
            'score_results',
            'score_factors',
            'score_input_snapshots',
            'score_recalculation_jobs'
          )
        order by table_name
      `;
      expect(tables.map((row) => row.table_name)).toEqual([
        'completeness_definition_versions',
        'completeness_definitions',
        'completeness_results',
        'score_components',
        'score_definition_versions',
        'score_definitions',
        'score_factors',
        'score_input_snapshots',
        'score_recalculation_jobs',
        'score_results',
      ]);

      const triggers = await client.sql<{ tgname: string }[]>`
        select tgname
        from pg_trigger
        where tgname in (
          'score_definitions_reject_unapproved_activation',
          'score_definition_versions_reject_active_rewrite',
          'score_results_append_only',
          'score_input_snapshots_append_only',
          'score_factors_append_only'
        )
        order by tgname
      `;
      expect(triggers.map((row) => row.tgname)).toEqual([
        'score_definition_versions_reject_active_rewrite',
        'score_definitions_reject_unapproved_activation',
        'score_factors_append_only',
        'score_input_snapshots_append_only',
        'score_results_append_only',
      ]);

      await expect(
        client.db.insert(scoreDefinitions).values({
          key: 'unapproved_active_database_test',
          displayName: 'Unapproved Active Database Test',
          description: 'Should be blocked by Prompt 5 activation guard.',
          family: 'motion',
          subjectType: 'organization',
          status: 'active',
          approvalStatus: 'draft_unapproved',
        }),
      ).rejects.toSatisfy((error: unknown) => {
        const mapped = mapDatabaseError(error);
        return mapped?.kind === 'check' || errorText(error).includes('approval_status=approved');
      });
    } finally {
      await client.close();
    }
  });

  it('enforces key partial indexes, checks, and foreign keys', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const client = createTestDatabaseClient(testDatabaseUrl);

    try {
      const organization = first(
        await client.db
          .insert(organizations)
          .values({
            displayName: 'Constraint Advisors',
            normalizedName: 'constraint advisors',
            domain: 'constraint.example.com',
            normalizedDomain: 'constraint.example.com',
          })
          .returning({ id: organizations.id }),
      );

      await expect(
        client.db.insert(organizations).values({
          displayName: 'Duplicate Constraint Advisors',
          normalizedName: 'duplicate constraint advisors',
          normalizedDomain: 'constraint.example.com',
        }),
      ).rejects.toSatisfy((error: unknown) => mapDatabaseError(error)?.kind === 'unique');

      await client.db.insert(organizations).values({
        displayName: 'Archived Constraint Advisors',
        normalizedName: 'archived constraint advisors',
        normalizedDomain: 'constraint.example.com',
        recordStatus: 'archived',
      });

      await expect(
        client.db.insert(organizations).values({
          displayName: 'Invalid Version Advisors',
          normalizedName: 'invalid version advisors',
          normalizedDomain: 'invalid-version.example.com',
          recordVersion: 0,
        }),
      ).rejects.toSatisfy((error: unknown) => mapDatabaseError(error)?.kind === 'check');

      await expect(
        client.db.insert(organizationLocations).values({
          organizationId: organization.id,
          territoryId: '00000000-0000-0000-0000-000000000001',
          name: 'Invalid Territory',
        }),
      ).rejects.toSatisfy((error: unknown) => mapDatabaseError(error)?.kind === 'foreign_key');

      await client.db.insert(contacts).values({
        organizationId: organization.id,
        displayName: 'Casey Constraint',
        email: 'casey.constraint@example.com',
        normalizedEmail: 'casey.constraint@example.com',
      });

      await expect(
        client.db.insert(contacts).values({
          organizationId: organization.id,
          displayName: 'Duplicate Casey Constraint',
          email: 'casey.constraint@example.com',
          normalizedEmail: 'casey.constraint@example.com',
        }),
      ).rejects.toSatisfy((error: unknown) => mapDatabaseError(error)?.kind === 'unique');
    } finally {
      await client.close();
    }
  });

  it('enforces Prompt 3 subject, uniqueness, and immutability constraints', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const client = createTestDatabaseClient(testDatabaseUrl);

    try {
      const organization = first(
        await client.db
          .insert(organizations)
          .values({
            displayName: 'Prompt Three Advisors',
            normalizedName: 'prompt three advisors',
            normalizedDomain: 'prompt-three.example.com',
          })
          .returning({ id: organizations.id }),
      );
      const source = first(
        await client.db
          .insert(sources)
          .values({
            sourceType: 'company_website',
            title: 'Prompt Three Website',
            locator: 'https://prompt-three.example.com/services',
            defaultReliability: '0.8000',
          })
          .returning({ id: sources.id }),
      );

      await expect(
        client.db.insert(evidenceRecords).values({
          subjectType: 'organization',
          sourceId: source.id,
          claim: 'Invalid evidence lacks an organization subject.',
          structuredPayload: {},
          evidenceType: 'verified_fact',
          observedAt: new Date(),
          contentHash: 'test:invalid-subject',
        }),
      ).rejects.toSatisfy((error: unknown) => mapDatabaseError(error)?.kind === 'check');

      const evidence = first(
        await client.db
          .insert(evidenceRecords)
          .values({
            subjectType: 'organization',
            organizationId: organization.id,
            sourceId: source.id,
            claim: 'Prompt Three Advisors offers payroll advisory.',
            structuredPayload: { payroll_offered: true },
            evidenceType: 'verified_fact',
            observedAt: new Date(),
            contentHash: 'test:prompt-three-evidence',
          })
          .returning({ id: evidenceRecords.id }),
      );

      await expect(
        client.db
          .update(evidenceRecords)
          .set({ claim: 'Rewritten evidence claim.' })
          .where(eq(evidenceRecords.id, evidence.id)),
      ).rejects.toSatisfy((error: unknown) =>
        errorText(error).includes('material evidence fields are immutable'),
      );

      const definition = first(
        await client.db
          .insert(variableDefinitions)
          .values({
            key: 'test_prompt_three_payroll_offered',
            displayLabel: 'Test Payroll Offered',
            description: 'Test variable definition for Prompt 3 constraints.',
            subjectType: 'organization',
            dataType: 'boolean',
            status: 'active',
          })
          .returning({ id: variableDefinitions.id }),
      );
      const version = first(
        await client.db
          .insert(variableDefinitionVersions)
          .values({
            definitionId: definition.id,
            version: 1,
            allowedValues: { values: [true, false] },
            nullStatusSemantics: { unknown: 'No reliable evidence.' },
            lifecycleStatus: 'active',
            publishedAt: new Date(),
          })
          .returning({ id: variableDefinitionVersions.id }),
      );

      await expect(
        client.db
          .update(variableDefinitionVersions)
          .set({ helpText: 'Rewritten active version.' })
          .where(eq(variableDefinitionVersions.id, version.id)),
      ).rejects.toSatisfy((error: unknown) =>
        errorText(error).includes(
          'active variable_definition_versions material fields are immutable',
        ),
      );

      await client.db.insert(variableValues).values({
        subjectType: 'organization',
        organizationId: organization.id,
        variableDefinitionId: definition.id,
        definitionVersionId: version.id,
        typedValue: { value: true },
        normalizedValue: { value: true },
        valueStatus: 'known',
        evidenceType: 'verified_fact',
        lifecycle: 'current',
      });

      await expect(
        client.db.insert(variableValues).values({
          subjectType: 'organization',
          organizationId: organization.id,
          variableDefinitionId: definition.id,
          definitionVersionId: version.id,
          typedValue: { value: false },
          normalizedValue: { value: false },
          valueStatus: 'known',
          evidenceType: 'verified_fact',
          lifecycle: 'current',
        }),
      ).rejects.toSatisfy((error: unknown) => mapDatabaseError(error)?.kind === 'unique');
    } finally {
      await client.close();
    }
  });

  it('runs the synthetic seed twice successfully', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });

    await runSeedScript();
    await runSeedScript();

    const client = createTestDatabaseClient(testDatabaseUrl);
    try {
      const userCount = first(await client.db.select({ value: count() }).from(users)).value;
      const organizationCount = first(
        await client.db.select({ value: count() }).from(organizations),
      ).value;
      const pendingOutboxCount = first(
        await client.sql<{ count: number }[]>`
          select count(*)::int as count
          from outbox_events
          where status = 'pending'
        `,
      ).count;
      const variableDefinitionCount = first(
        await client.db.select({ value: count() }).from(variableDefinitions),
      ).value;
      const scoreDefinitionCount = first(
        await client.db.select({ value: count() }).from(scoreDefinitions),
      ).value;
      const activeScoreDefinitionCount = first(
        await client.db
          .select({ value: count() })
          .from(scoreDefinitions)
          .where(eq(scoreDefinitions.status, 'active')),
      ).value;
      const activeCompletenessDefinitionCount = first(
        await client.db
          .select({ value: count() })
          .from(completenessDefinitions)
          .where(eq(completenessDefinitions.status, 'active')),
      ).value;
      const evidenceRecordCount = first(
        await client.db.select({ value: count() }).from(evidenceRecords),
      ).value;
      const permissionEvidenceLinkCount = first(
        await client.db.select({ value: count() }).from(permissionEvidenceLinks),
      ).value;

      expect(userCount).toBeGreaterThanOrEqual(4);
      expect(organizationCount).toBeGreaterThanOrEqual(3);
      expect(pendingOutboxCount).toBeGreaterThanOrEqual(1);
      expect(variableDefinitionCount).toBe(expectedVariableDefinitionCount);
      expect(scoreDefinitionCount).toBe(9);
      expect(activeScoreDefinitionCount).toBe(9);
      expect(activeCompletenessDefinitionCount).toBeGreaterThanOrEqual(1);
      expect(evidenceRecordCount).toBeGreaterThanOrEqual(6);
      expect(permissionEvidenceLinkCount).toBeGreaterThanOrEqual(1);
    } finally {
      await client.close();
    }
  });

  it('commits or rolls back transaction work as one unit', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const client = createTestDatabaseClient(testDatabaseUrl);

    try {
      const committed = await client.withTransaction(async (tx) => {
        const rows = await tx
          .insert(organizations)
          .values({
            displayName: 'Committed Transaction Advisors',
            normalizedName: 'committed transaction advisors',
            normalizedDomain: 'committed-transaction.example.com',
          })
          .returning({ id: organizations.id });
        return first(rows).id;
      });

      await expect(
        client.withTransaction(async (tx) => {
          await tx.insert(organizations).values({
            displayName: 'Rolled Back Transaction Advisors',
            normalizedName: 'rolled back transaction advisors',
            normalizedDomain: 'rolled-back-transaction.example.com',
          });
          throw new Error('force rollback');
        }),
      ).rejects.toThrow('force rollback');

      const committedCount = first(
        await client.db
          .select({ value: count() })
          .from(organizations)
          .where(eq(organizations.id, committed)),
      ).value;
      const rolledBackCount = first(
        await client.db
          .select({ value: count() })
          .from(organizations)
          .where(eq(organizations.normalizedDomain, 'rolled-back-transaction.example.com')),
      ).value;

      expect(committedCount).toBe(1);
      expect(rolledBackCount).toBe(0);
    } finally {
      await client.close();
    }
  });

  it('applies Prompt 6 qualification tables, reason catalog, and deletion guards', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const client = createTestDatabaseClient(testDatabaseUrl);

    try {
      const tables = await client.sql<{ table_name: string }[]>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in (
            'qualification_reviews',
            'qualification_review_scores',
            'qualification_conditions',
            'qualification_decisions',
            'disqualification_reasons',
            'qualification_recommendation_overrides'
          )
        order by table_name
      `;
      expect(tables.map((row) => row.table_name)).toEqual([
        'disqualification_reasons',
        'qualification_conditions',
        'qualification_decisions',
        'qualification_recommendation_overrides',
        'qualification_review_scores',
        'qualification_reviews',
      ]);

      const triggers = await client.sql<{ tgname: string }[]>`
        select tgname
        from pg_trigger
        where tgname in (
          'qualification_reviews_prevent_delete',
          'qualification_review_scores_prevent_delete',
          'qualification_conditions_prevent_delete',
          'qualification_decisions_prevent_delete',
          'disqualification_reasons_prevent_delete',
          'qualification_recommendation_overrides_prevent_delete'
        )
        order by tgname
      `;
      expect(triggers.map((row) => row.tgname)).toEqual([
        'disqualification_reasons_prevent_delete',
        'qualification_conditions_prevent_delete',
        'qualification_decisions_prevent_delete',
        'qualification_recommendation_overrides_prevent_delete',
        'qualification_review_scores_prevent_delete',
        'qualification_reviews_prevent_delete',
      ]);

      const reasonCount = first(
        await client.db.select({ value: count() }).from(disqualificationReasons),
      ).value;
      expect(reasonCount).toBeGreaterThanOrEqual(15);

      const user = first(
        await client.db
          .insert(users)
          .values({
            externalSubjectId: 'auth0|prompt6-db',
            email: 'prompt6-db@example.com',
            displayName: 'Prompt 6 DB',
            status: 'active',
          })
          .returning({ id: users.id }),
      );
      const org = first(
        await client.db
          .insert(organizations)
          .values({
            displayName: 'Prompt 6 DB Advisors',
            normalizedName: 'prompt 6 db advisors',
            normalizedDomain: 'prompt6-db.example.com',
          })
          .returning({ id: organizations.id }),
      );
      const review = first(
        await client.db
          .insert(qualificationReviews)
          .values({
            organizationId: org.id,
            requestedByUserId: user.id,
          })
          .returning({ id: qualificationReviews.id }),
      );

      await expect(
        client.db.delete(qualificationReviews).where(eq(qualificationReviews.id, review.id)),
      ).rejects.toSatisfy((error: unknown) =>
        errorText(error).includes('hard delete is not allowed for qualification workflow tables'),
      );
    } finally {
      await client.close();
    }
  });

  it('rejects forbidden hard deletion for canonical rows', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const client = createTestDatabaseClient(testDatabaseUrl);

    try {
      const organization = first(
        await client.db
          .insert(organizations)
          .values({
            displayName: 'No Delete Advisors',
            normalizedName: 'no delete advisors',
            normalizedDomain: 'no-delete.example.com',
          })
          .returning({ id: organizations.id }),
      );

      await expect(
        client.db.delete(organizations).where(eq(organizations.id, organization.id)),
      ).rejects.toSatisfy((error: unknown) =>
        errorText(error).includes('hard delete is forbidden'),
      );

      const remaining = first(
        await client.db
          .select({ value: count() })
          .from(organizations)
          .where(eq(organizations.id, organization.id)),
      ).value;
      expect(remaining).toBe(1);
    } finally {
      await client.close();
    }
  });

  it('keeps audit events append-only', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const client = createTestDatabaseClient(testDatabaseUrl);

    try {
      const audit = first(
        await client.db
          .insert(auditEvents)
          .values({
            actorType: 'system',
            actorUserId: null,
            action: 'test.audit.created',
            subjectType: 'system',
            subjectId: null,
            organizationId: null,
            contactId: null,
            commandCorrelationId: null,
            beforeData: null,
            afterData: null,
            metadata: { test: true },
          })
          .returning({ id: auditEvents.id }),
      );

      await expect(
        client.db
          .update(auditEvents)
          .set({ action: 'test.audit.rewritten' })
          .where(eq(auditEvents.id, audit.id)),
      ).rejects.toSatisfy((error: unknown) => errorText(error).includes('append-only'));
      await expect(
        client.db.delete(auditEvents).where(eq(auditEvents.id, audit.id)),
      ).rejects.toSatisfy((error: unknown) => errorText(error).includes('append-only'));
    } finally {
      await client.close();
    }
  });

  it('reports database health from a ping', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const client = createTestDatabaseClient(testDatabaseUrl);

    try {
      const healthy = await checkDatabaseHealth(client);
      expect(healthy.status).toBe('ok');
      expect(healthy.latencyMs).toBeGreaterThanOrEqual(0);

      const unhealthy = await checkDatabaseHealth({
        async ping(): Promise<boolean> {
          throw Object.assign(new Error('synthetic ping failure'), { code: '23505' });
        },
      });
      expect(unhealthy.status).toBe('unavailable');
      expect(unhealthy.error?.code).toBe('DB_UNIQUE_VIOLATION');
    } finally {
      await client.close();
    }
  });
});

async function migrationJournalCount(): Promise<number> {
  const client = createTestDatabaseClient(testDatabaseUrl);
  try {
    const row = first(
      await client.sql<{ count: number }[]>`
        select count(*)::int as count
        from drizzle.__drizzle_migrations
      `,
    );
    return row.count;
  } finally {
    await client.close();
  }
}

async function runSeedScript(): Promise<void> {
  await execFileAsync('pnpm', ['db:seed'], {
    cwd: packageRoot,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      NODE_ENV: 'test',
    },
    timeout: 60_000,
  });
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Expected at least one row.');
  }
  return row;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n${errorText(error.cause)}`;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error ?? '');
}
