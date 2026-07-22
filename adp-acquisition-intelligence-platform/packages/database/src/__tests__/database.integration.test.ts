import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { count } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  contacts,
  mapDatabaseError,
  organizationLocations,
  organizations,
  users,
} from '../index.js';
import {
  createTestDatabaseClient,
  getTestDatabaseUrl,
  migrateTestDatabase,
} from '../testing/setup.js';

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const testDatabaseUrl = getTestDatabaseUrl();

describe.sequential('database integration tooling', () => {
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

  it('runs the synthetic seed twice successfully', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });

    await runSeedScript();
    await runSeedScript();

    const client = createTestDatabaseClient(testDatabaseUrl);
    try {
      const userCount = first(await client.db.select({ value: count() }).from(users)).value;
      const organizationCount = first(await client.db.select({ value: count() }).from(organizations)).value;
      const pendingOutboxCount = first(
        await client.sql<{ count: number }[]>`
          select count(*)::int as count
          from outbox_events
          where status = 'pending'
        `,
      ).count;

      expect(userCount).toBeGreaterThanOrEqual(4);
      expect(organizationCount).toBeGreaterThanOrEqual(3);
      expect(pendingOutboxCount).toBeGreaterThanOrEqual(1);
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
