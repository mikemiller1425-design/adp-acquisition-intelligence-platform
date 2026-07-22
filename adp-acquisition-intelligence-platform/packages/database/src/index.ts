import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export * from './schema/index.js';

/**
 * Prompt 1 database seam only.
 * Business schemas and migrations begin in Prompt 2 (ADR-005).
 * Phase 1 is single-tenant (ADR-003); do not add speculative tenant_id here.
 */
export type DatabaseClient = ReturnType<typeof createDatabaseClient>;

export function createSqlConnection(databaseUrl: string) {
  return postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

export function createDatabaseClient(databaseUrl: string) {
  const sql = createSqlConnection(databaseUrl);
  return {
    sql,
    db: drizzle(sql),
    async ping(): Promise<boolean> {
      await sql`select 1`;
      return true;
    },
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
    },
  };
}
