import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.ADP_WEB_E2E_PORT ?? 3102);
const baseURL = `http://127.0.0.1:${PORT}`;
const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgres://adp:adp@127.0.0.1:5432/adp_acquisition_test';

/**
 * Phase 1.2 durable research-run PostgreSQL E2E (separate from Phase 1.1 workflow).
 * Spec owns Next.js + worker process lifecycle.
 */
// Ensure global setup / spawned processes share the same Postgres URL (local default 5432).
process.env.DATABASE_URL = databaseUrl;
process.env.TEST_DATABASE_URL = databaseUrl;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/research-run-postgres-durable-orchestration.spec.ts',
  globalSetup: './e2e/postgres-global-setup.mts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 420_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
  },
  metadata: {
    databaseUrl,
    provider: 'postgres',
    jobQueue: 'durable',
  },
});
