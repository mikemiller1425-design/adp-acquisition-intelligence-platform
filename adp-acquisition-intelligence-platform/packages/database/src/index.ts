import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import postgres from 'postgres';

import * as schema from './schema/index.js';

export * from './schema/index.js';

export type Database = PostgresJsDatabase<typeof schema>;
export type RepositoryTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
export type RepositoryExecutor = Database | RepositoryTransaction;

export interface RepositoryContext {
  db: RepositoryExecutor;
}

export interface DatabaseClient {
  sql: SqlConnection;
  db: Database;
  ping: () => Promise<boolean>;
  close: () => Promise<void>;
  withTransaction: <T>(work: (tx: RepositoryTransaction) => Promise<T>) => Promise<T>;
}

export interface DatabaseConnectionOptions {
  max?: number;
  idleTimeoutSeconds?: number;
  connectTimeoutSeconds?: number;
  prepare?: boolean;
}

export interface DatabaseHealth {
  status: 'ok' | 'unavailable';
  checkedAt: string;
  latencyMs: number;
  error?: {
    message: string;
    code?: string;
  };
}

export type DatabaseConstraintKind = 'unique' | 'foreign_key' | 'check';

export class DbConstraintError extends Error {
  readonly kind: DatabaseConstraintKind;
  readonly code: 'DB_UNIQUE_VIOLATION' | 'DB_FOREIGN_KEY_VIOLATION' | 'DB_CHECK_VIOLATION';
  readonly statusCode: number;
  readonly constraint: string | undefined;
  readonly table: string | undefined;
  readonly detail: string | undefined;

  constructor(input: {
    kind: DatabaseConstraintKind;
    message: string;
    constraint?: string | undefined;
    table?: string | undefined;
    detail?: string | undefined;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = 'DbConstraintError';
    this.kind = input.kind;
    this.code = constraintCode(input.kind);
    this.statusCode = input.kind === 'unique' ? 409 : 400;
    this.constraint = input.constraint;
    this.table = input.table;
    this.detail = input.detail;
  }
}

export type SqlConnection = ReturnType<typeof createSqlConnection>;

export function createSqlConnection(databaseUrl: string, options: DatabaseConnectionOptions = {}) {
  const connectionOptions: postgres.Options<Record<string, never>> = {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  };

  if (options.max !== undefined) {
    connectionOptions.max = options.max;
  }
  if (options.idleTimeoutSeconds !== undefined) {
    connectionOptions.idle_timeout = options.idleTimeoutSeconds;
  }
  if (options.connectTimeoutSeconds !== undefined) {
    connectionOptions.connect_timeout = options.connectTimeoutSeconds;
  }
  if (options.prepare !== undefined) {
    connectionOptions.prepare = options.prepare;
  }

  return postgres(databaseUrl, connectionOptions);
}

export function createDatabaseClient(
  databaseUrl: string,
  options: DatabaseConnectionOptions = {},
): DatabaseClient {
  const sql = createSqlConnection(databaseUrl, options);
  const db = drizzle(sql, { schema });

  return {
    sql,
    db,
    async ping(): Promise<boolean> {
      await sql`select 1`;
      return true;
    },
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
    },
    async withTransaction<T>(work: (tx: RepositoryTransaction) => Promise<T>): Promise<T> {
      return withTransaction(db, work);
    },
  };
}

export async function withTransaction<T>(
  db: Database,
  work: (tx: RepositoryTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction((tx) => work(tx));
}

export async function checkDatabaseHealth(
  client: Pick<DatabaseClient, 'ping'>,
): Promise<DatabaseHealth> {
  const startedAt = process.hrtime.bigint();
  const checkedAt = new Date().toISOString();

  try {
    await client.ping();

    return {
      status: 'ok',
      checkedAt,
      latencyMs: elapsedMs(startedAt),
    };
  } catch (error) {
    const mapped = mapDatabaseError(error);

    return {
      status: 'unavailable',
      checkedAt,
      latencyMs: elapsedMs(startedAt),
      error: {
        message: error instanceof Error ? error.message : 'Database health check failed',
        ...(mapped ? { code: mapped.code } : {}),
      },
    };
  }
}

export function mapDatabaseError(error: unknown): DbConstraintError | undefined {
  const pgCode = readStringProperty(error, 'code');

  switch (pgCode) {
    case '23505':
      return new DbConstraintError({
        kind: 'unique',
        message: 'Database unique constraint violated',
        constraint:
          readStringProperty(error, 'constraint_name') ?? readStringProperty(error, 'constraint'),
        table: readStringProperty(error, 'table_name') ?? readStringProperty(error, 'table'),
        detail: readStringProperty(error, 'detail'),
        cause: error,
      });
    case '23503':
      return new DbConstraintError({
        kind: 'foreign_key',
        message: 'Database foreign key constraint violated',
        constraint:
          readStringProperty(error, 'constraint_name') ?? readStringProperty(error, 'constraint'),
        table: readStringProperty(error, 'table_name') ?? readStringProperty(error, 'table'),
        detail: readStringProperty(error, 'detail'),
        cause: error,
      });
    case '23514':
      return new DbConstraintError({
        kind: 'check',
        message: 'Database check constraint violated',
        constraint:
          readStringProperty(error, 'constraint_name') ?? readStringProperty(error, 'constraint'),
        table: readStringProperty(error, 'table_name') ?? readStringProperty(error, 'table'),
        detail: readStringProperty(error, 'detail'),
        cause: error,
      });
    default:
      return readErrorCause(error) ? mapDatabaseError(readErrorCause(error)) : undefined;
  }
}

export function isDatabaseConstraintError(error: unknown): error is DbConstraintError {
  return error instanceof DbConstraintError;
}

function elapsedMs(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function constraintCode(kind: DatabaseConstraintKind): DbConstraintError['code'] {
  switch (kind) {
    case 'unique':
      return 'DB_UNIQUE_VIOLATION';
    case 'foreign_key':
      return 'DB_FOREIGN_KEY_VIOLATION';
    case 'check':
      return 'DB_CHECK_VIOLATION';
  }
}

function readStringProperty(value: unknown, property: string): string | undefined {
  if (typeof value !== 'object' || value === null || !(property in value)) {
    return undefined;
  }

  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === 'string' ? propertyValue : undefined;
}

function readErrorCause(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('cause' in value)) {
    return undefined;
  }

  return (value as { cause?: unknown }).cause;
}
