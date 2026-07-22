import postgres from 'postgres';

import { createDatabaseClient, type DatabaseClient } from '../index.js';
import { runMigrations } from '../migrate.js';

export const DEFAULT_TEST_DATABASE_URL = 'postgres://adp:adp@localhost:5432/adp_acquisition_test';

export interface TestDatabaseSetupOptions {
  databaseUrl?: string;
  reset?: boolean;
}

export interface TestDatabaseLock {
  release: () => Promise<void>;
}

const TEST_DATABASE_LOCK_ID = 20_260_722;

export function getTestDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
}

export async function acquireTestDatabaseLock(
  databaseUrl = getTestDatabaseUrl(),
): Promise<TestDatabaseLock> {
  assertTestDatabaseUrl(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1 });
  let released = false;

  await sql`select pg_advisory_lock(${TEST_DATABASE_LOCK_ID})`;

  return {
    async release(): Promise<void> {
      if (released) return;
      released = true;
      try {
        await sql`select pg_advisory_unlock(${TEST_DATABASE_LOCK_ID})`;
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
  };
}

export async function resetTestDatabase(databaseUrl = getTestDatabaseUrl()): Promise<void> {
  assertTestDatabaseUrl(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    await sql`drop schema if exists drizzle cascade`;
    await sql`drop schema if exists public cascade`;
    await sql`create schema public`;
    await sql`grant all on schema public to public`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function migrateTestDatabase(options: TestDatabaseSetupOptions = {}): Promise<string> {
  const databaseUrl = options.databaseUrl ?? getTestDatabaseUrl();
  assertTestDatabaseUrl(databaseUrl);

  if (options.reset === true) {
    await resetTestDatabase(databaseUrl);
  }

  await runMigrations({ databaseUrl });
  return databaseUrl;
}

export function createTestDatabaseClient(databaseUrl = getTestDatabaseUrl()): DatabaseClient {
  assertTestDatabaseUrl(databaseUrl);
  return createDatabaseClient(databaseUrl);
}

function assertTestDatabaseUrl(databaseUrl: string): void {
  const url = new URL(databaseUrl);
  const databaseName = url.pathname.replace(/^\//, '');

  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to reset or migrate non-test database "${databaseName}".`);
  }
}
