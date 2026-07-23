/**
 * PERSISTENT PostgreSQL Phase 1.1 E2E — controlled-pilot acceptance gate.
 *
 * Requires ADP_RESEARCH_PROVIDER=postgres, migrations through 0011, and seeded
 * variable definitions. Live network retrieval remains disabled.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, test } from '@playwright/test';

const PORT = Number(process.env.ADP_WEB_E2E_PORT ?? 3101);
const BASE_URL = `http://127.0.0.1:${PORT}`;

let server: ChildProcess | null = null;

async function waitReady(timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/research`);
      if (res.status > 0) return;
    } catch {
      // retry
    }
    await delay(400);
  }
  throw new Error(`Next.js not ready on ${BASE_URL}`);
}

async function startServer() {
  if (server) return;
  const webRoot = process.cwd();
  server = spawn(
    'pnpm',
    ['exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', String(PORT)],
    {
      cwd: webRoot,
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          process.env.TEST_DATABASE_URL ??
          'postgres://adp:adp@127.0.0.1:5433/adp_acquisition_test',
        ADP_RESEARCH_PROVIDER: 'postgres',
        // Demo actor ids are not seeded users; collection runs store requested_by as null.
        ADP_WEB_USER_ROLES: 'admin,sales,reviewer',
        ADP_ENV: 'development',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let bootLog = '';
  server.stdout?.on('data', (chunk) => {
    bootLog += String(chunk);
  });
  server.stderr?.on('data', (chunk) => {
    bootLog += String(chunk);
  });
  try {
    await waitReady();
  } catch (error) {
    throw new Error(`Next.js boot failed. Log:\n${bootLog}\n${String(error)}`);
  }
}

async function stopServer() {
  if (!server?.pid) {
    server = null;
    return;
  }
  server.kill('SIGTERM');
  await delay(1200);
  try {
    process.kill(server.pid, 0);
    server.kill('SIGKILL');
  } catch {
    // gone
  }
  server = null;
  await delay(800);
}

async function restartServer() {
  await stopServer();
  await startServer();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

test.describe('Phase 1.1 PostgreSQL persistent fixture workflow', () => {
  test('dry-run is non-mutating; full workflow persists across Next.js restart', async ({
    page,
    request,
  }) => {
    await page.goto('/research');
    await expect(page.getByTestId('research-hub')).toBeVisible();

    const baseline = await (await request.get('/api/research/persistence-probe')).json();
    expect(baseline.provider).toBe('postgres');

    // Dry-run must not persist candidates / orgs delta / evidence / variables / collection runs.
    await page.goto('/research/population-imports');
    await page.getByTestId('import-dry-run').check();
    await page.getByTestId('import-universe').click();
    await expect(page.getByTestId('dry-run-banner')).toBeVisible();

    const afterDry = await (await request.get('/api/research/persistence-probe')).json();
    expect(afterDry.tables.raw_candidates).toBe(baseline.tables.raw_candidates);
    expect(afterDry.tables.organizations).toBe(baseline.tables.organizations);
    expect(afterDry.tables.evidence_records).toBe(baseline.tables.evidence_records);
    expect(afterDry.tables.variable_values).toBe(baseline.tables.variable_values);
    expect(afterDry.tables.collection_runs).toBe(baseline.tables.collection_runs);

    // Mutating import through worker job boundary
    await page.goto('/research/population-imports');
    await page.getByTestId('import-universe').click();
    await expect(page.getByTestId('entity-resolution')).toBeVisible();
    await expect(page.getByTestId('candidate-count')).toContainText(/Candidates:\s*[1-9]/);
    await expect(page.getByTestId('organization-count')).toContainText(/Organizations:\s*[1-9]/);

    await page.getByTestId('resolve-entities').click();
    await expect(page.getByTestId('research-priorities')).toBeVisible();
    await page.getByTestId('calculate-priorities').click();
    await expect(page.getByTestId('collection-jobs')).toBeVisible();

    await page.getByTestId('start-collection-run').click();
    await expect(page.getByTestId('collection-job-detail')).toBeVisible();
    await expect(page.getByTestId('collection-run-status')).toHaveText(/completed/);

    const mid = await (await request.get('/api/research/persistence-probe')).json();
    expect(mid.tables.raw_candidates).toBeGreaterThan(baseline.tables.raw_candidates);
    expect(mid.tables.organizations).toBeGreaterThan(baseline.tables.organizations);
    expect(mid.tables.source_snapshots).toBeGreaterThan(0);
    expect(mid.tables.extracted_claims).toBeGreaterThan(0);
    expect(mid.tables.collection_runs).toBeGreaterThan(0);

    // Restart Next.js — PostgreSQL records must remain visible via UI.
    await restartServer();

    await page.goto('/research/entity-resolution');
    await expect(page.getByTestId('organization-count')).toContainText(/Organizations:\s*[1-9]/);
    await page.goto('/research/collection-jobs');
    await expect(page.getByTestId('collection-runs-table')).toBeVisible();
    await page.goto('/research/extraction-review');
    await expect(page.getByTestId('proposed-claim-count')).toContainText(
      /Proposed claims:\s*[1-9]/,
    );

    const acceptButton = page.locator('[data-testid^="accept-claim-"]').first();
    await acceptButton.click();
    await expect(page.getByTestId('research-coverage-dashboard')).toBeVisible();
    await expect(page.getByTestId('claim-accepted-banner')).toBeVisible();
    await expect(page.getByTestId('dash-claims-accepted')).toHaveText(/[1-9]/);
    await expect(page.getByTestId('dash-evidence-records')).toHaveText(/[1-9]/);
    await expect(page.getByTestId('dash-variable-proposals')).toHaveText(/[1-9]/);
    await expect(page.getByTestId('dash-score-recalcs')).toHaveText(/[1-9]/);

    const finalBody = await (await request.get('/api/research/persistence-probe')).json();
    expect(finalBody.provider).toBe('postgres');
    expect(finalBody.tables.population_imports).toBeGreaterThan(0);
    expect(finalBody.tables.raw_candidates).toBeGreaterThan(baseline.tables.raw_candidates);
    expect(finalBody.tables.organizations).toBeGreaterThan(baseline.tables.organizations);
    expect(finalBody.tables.collection_runs).toBeGreaterThan(0);
    expect(finalBody.tables.source_snapshots).toBeGreaterThan(0);
    expect(finalBody.tables.extracted_claims).toBeGreaterThan(0);
    expect(finalBody.tables.evidence_records).toBeGreaterThan(0);
    expect(finalBody.tables.variable_values).toBeGreaterThan(0);
    expect(finalBody.tables.outbox_events).toBeGreaterThan(0);
    expect(finalBody.tables.research_priority_assessments).toBeGreaterThan(0);
  });
});
