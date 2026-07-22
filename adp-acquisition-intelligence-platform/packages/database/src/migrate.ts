import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { createDatabaseClient } from './index.js';

export const DEFAULT_DATABASE_URL = 'postgres://adp:adp@localhost:5432/adp_acquisition';
export const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

export interface RunMigrationsOptions {
  databaseUrl?: string;
  migrationsFolder?: string;
}

export async function runMigrations(options: RunMigrationsOptions = {}): Promise<void> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const migrationsFolder = options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;
  const client = createDatabaseClient(databaseUrl, { max: 1 });

  try {
    await migrate(client.db, { migrationsFolder });
  } finally {
    await client.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await runMigrations();
    console.log('Database migrations applied successfully.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
