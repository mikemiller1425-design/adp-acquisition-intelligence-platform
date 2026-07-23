import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.ADP_WEB_E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/research-postgres-persistent-workflow.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      ADP_WEB_USER_ROLES: 'admin,sales,reviewer',
      ADP_RESEARCH_PROVIDER: 'memory',
      ADP_ENV: 'development',
    },
  },
});
