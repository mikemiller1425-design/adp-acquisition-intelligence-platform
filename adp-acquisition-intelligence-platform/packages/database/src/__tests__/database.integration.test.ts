import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  auditEvents,
  checkDatabaseHealth,
  contacts,
  evidenceRecords,
  mapDatabaseError,
  organizationLocations,
  organizations,
  permissionEvidenceLinks,
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

  it('applies the Prompt 3 migration after the Prompt 2 schema migrations', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const client = createTestDatabaseClient(testDatabaseUrl);

    try {
      const journalCount = await migrationJournalCount();
      const journal = JSON.parse(
        await readFile(new URL('../../migrations/meta/_journal.json', import.meta.url), 'utf8'),
      ) as { entries: Array<{ tag: string }> };

      expect(journalCount).toBe(3);
      expect(journal.entries.map((row) => row.tag)).toEqual([
        '0000_parched_electro',
        '0001_integrity_guards',
        '0002_lyrical_daimon_hellstrom',
      ]);
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
