import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.ADP_WEB_E2E_PORT ?? 3101);
const baseURL = `http://127.0.0.1:${PORT}`;
const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgres://adp:adp@127.0.0.1:5433/adp_acquisition_test';

/**
 * Persistent PostgreSQL-backed Phase 1.1 E2E (controlled-pilot gate).
 * Server lifecycle is owned by the spec so mid-test restart is possible.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/research-postgres-persistent-workflow.spec.ts',
  globalSetup: './e2e/postgres-global-setup.mts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 360_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
  },
  // No Playwright-managed webServer — the spec starts/restarts Next.js.
  metadata: {
    databaseUrl,
    provider: 'postgres',
  },
});
