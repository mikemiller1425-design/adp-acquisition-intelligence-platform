/**
 * Phase 1.2 PostgreSQL durable research-run orchestration E2E.
 *
 * Starts Next.js (postgres + durable queue) and a separate worker process.
 * Asserts web enqueues durable_jobs, worker claims/executes, pause/resume,
 * worker restart recovery, and Next.js restart persistence.
 *
 * Live egress remains disabled. Does not replace Phase 1.1 persistent workflow.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, test } from '@playwright/test';
import { createTestDatabaseClient } from '@adp/database/testing';
import { durableJobs, researchRuns, researchRunTargets, sourceSnapshots } from '@adp/database';
import { count, eq } from 'drizzle-orm';

const PORT = Number(process.env.ADP_WEB_E2E_PORT ?? 3102);
const WORKER_HEALTH = Number(process.env.ADP_WORKER_HEALTH_PORT ?? 3103);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgres://adp:adp@127.0.0.1:5432/adp_acquisition_test';

let web: ChildProcess | null = null;
let worker: ChildProcess | null = null;
let bootLog = '';

function attachLogs(proc: ChildProcess, label: string) {
  proc.stdout?.on('data', (chunk) => {
    bootLog += `[${label}] ${String(chunk)}`;
  });
  proc.stderr?.on('data', (chunk) => {
    bootLog += `[${label}] ${String(chunk)}`;
  });
}

async function waitUrl(url: string, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status > 0) return;
    } catch {
      // retry
    }
    await delay(400);
  }
  throw new Error(`Not ready: ${url}\n${bootLog}`);
}

async function startWeb() {
  if (web) return;
  web = spawn('pnpm', ['exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', String(PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ADP_RESEARCH_PROVIDER: 'postgres',
      ADP_JOB_QUEUE: 'durable',
      ADP_LIVE_RESEARCH_ENABLED: 'false',
      ADP_WEB_USER_ROLES: 'admin,sales,reviewer',
      ADP_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  attachLogs(web, 'web');
  await waitUrl(`${BASE_URL}/research`);
}

async function stopWeb() {
  if (!web?.pid) {
    web = null;
    return;
  }
  web.kill('SIGTERM');
  await delay(1000);
  try {
    process.kill(web.pid, 0);
    web.kill('SIGKILL');
  } catch {
    // gone
  }
  web = null;
  await delay(500);
}

async function startWorker() {
  if (worker) return;
  const workerEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    ADP_RESEARCH_PROVIDER: 'postgres',
    ADP_JOB_QUEUE: 'durable',
    ADP_LIVE_RESEARCH_ENABLED: 'false',
    ADP_WORKER_ID: 'e2e-worker-1',
    ADP_JOB_LEASE_MS: '5000',
    WORKER_HEALTH_PORT: String(WORKER_HEALTH),
    NODE_ENV: 'development',
    OIDC_ISSUER_URL: 'https://login.microsoftonline.com/common/v2.0',
    OIDC_CLIENT_ID: 'client',
    OIDC_CLIENT_SECRET: 'secret-value',
    SESSION_SECRET: 'dev-only-change-me-now',
    OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
    OBJECT_STORAGE_BUCKET: 'adp-dev',
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'dev',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'dev',
  };
  worker = spawn('pnpm', ['exec', 'tsx', 'src/server.ts'], {
    cwd: process.cwd().replace(/apps\/web$/, 'apps/worker'),
    env: workerEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  attachLogs(worker, 'worker');
  await waitUrl(`http://127.0.0.1:${WORKER_HEALTH}/health`);
}

async function stopWorker() {
  if (!worker?.pid) {
    worker = null;
    return;
  }
  worker.kill('SIGTERM');
  await delay(1000);
  try {
    process.kill(worker.pid, 0);
    worker.kill('SIGKILL');
  } catch {
    // gone
  }
  worker = null;
  await delay(500);
}

async function probeQueue() {
  const res = await fetch(`${BASE_URL}/api/research/durable-queue-probe`);
  expect(res.ok).toBeTruthy();
  return res.json() as Promise<{
    jobMode: string;
    durableJobs: { queued: number; running: number; completed: number; dead: number };
    workerHeartbeat: { workerId: string; lastSeenAt: string } | null;
  }>;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await startWeb();
  await startWorker();
});

test.afterAll(async () => {
  await stopWorker();
  await stopWeb();
});

test.describe('Phase 1.2 PostgreSQL durable research-run orchestration', () => {
  test('launch enqueues durable job; worker executes; pause/resume; restart recovery', async ({
    page,
  }) => {
    const probe0 = await probeQueue();
    expect(probe0.jobMode).toBe('durable_postgres');

    await page.goto('/research');
    await expect(page.getByTestId('research-hub')).toBeVisible();
    await page.getByTestId('start-research-run').click();
    await expect(page.getByTestId('research-run-new')).toBeVisible();

    await page.getByTestId('run-name').fill('PG durable orchestration run');
    await page.getByTestId('run-segment').fill('pilot-accounting-segment');
    await page.getByTestId('run-territory').fill('');
    await page.getByTestId('run-org-type').fill('');
    await page.getByTestId('run-max-orgs').fill('2');
    await page.getByTestId('run-max-pages').fill('1');
    await page.getByTestId('run-max-requests').fill('20');
    await page.getByTestId('run-mode').selectOption('fixture');
    await page.getByTestId('run-source').selectOption('organization_website_fixture');

    await page.getByTestId('preview-research-run').click();
    await expect(page.getByTestId('approval-status')).toHaveText('gates_passed');
    await expect(page.getByTestId('live-research-enabled')).toHaveText('false');
    await page.getByTestId('run-operator-confirm').check();
    await page.getByTestId('launch-research-run').click();

    await expect(page.getByTestId('research-run-detail')).toBeVisible();
    await expect(page.getByTestId('research-run-job-mode')).toHaveText('durable_postgres');
    // Web must not offer Process next target in durable mode.
    await expect(page.getByTestId('advance-research-run')).toHaveCount(0);

    const runUrl = page.url();
    const runId = runUrl.split('/').pop()!;

    // Durable job should appear (queued or already claimed/completed by worker).
    let sawDurableActivity = false;
    for (let i = 0; i < 40; i += 1) {
      const probe = await probeQueue();
      if (probe.durableJobs.queued + probe.durableJobs.running + probe.durableJobs.completed > 0) {
        sawDurableActivity = true;
        break;
      }
      await delay(500);
    }
    expect(sawDurableActivity).toBe(true);

    // Wait for worker progress (at least one target completed or run running/completed).
    for (let i = 0; i < 60; i += 1) {
      await page.reload();
      const status = await page.getByTestId('research-run-status').textContent();
      const completed = await page.getByTestId('research-run-targets-completed').textContent();
      if (status === 'running' || status === 'completed' || Number(completed) > 0) break;
      await delay(500);
    }

    await page.reload();
    const midStatus = await page.getByTestId('research-run-status').textContent();
    if (midStatus === 'running') {
      await page.getByTestId('pause-research-run').click();
      await expect(page.getByTestId('research-run-status')).toHaveText('paused');
      const completedAtPause = Number(
        await page.getByTestId('research-run-targets-completed').textContent(),
      );
      await delay(2000);
      await page.reload();
      expect(await page.getByTestId('research-run-status').textContent()).toBe('paused');
      expect(Number(await page.getByTestId('research-run-targets-completed').textContent())).toBe(
        completedAtPause,
      );

      await page.getByTestId('resume-research-run').click();
      await expect(page.getByTestId('research-run-status')).toHaveText('queued');
    }

    // Worker restart mid-flight.
    await stopWorker();
    await startWorker();

    for (let i = 0; i < 80; i += 1) {
      await page.reload();
      if ((await page.getByTestId('research-run-status').textContent()) === 'completed') break;
      await delay(500);
    }
    await expect(page.getByTestId('research-run-status')).toHaveText('completed');
    const snapshotsBefore = await page.getByTestId('research-run-snapshots').textContent();

    // Next.js restart — state persists.
    await stopWeb();
    await startWeb();
    await page.goto(`/research/runs/${runId}`);
    await expect(page.getByTestId('research-run-status')).toHaveText('completed');
    await expect(page.getByTestId('research-run-snapshots')).toHaveText(snapshotsBefore ?? '');

    // Direct PostgreSQL probe.
    const client = createTestDatabaseClient(databaseUrl);
    try {
      const [runRow] = await client.db
        .select()
        .from(researchRuns)
        .where(eq(researchRuns.id, runId))
        .limit(1);
      expect(runRow?.status).toBe('completed');
      expect(runRow?.snapshotsCreated ?? 0).toBeGreaterThan(0);

      const targets = await client.db
        .select()
        .from(researchRunTargets)
        .where(eq(researchRunTargets.researchRunId, runId));
      expect(targets.length).toBeGreaterThan(0);
      expect(targets.every((t) => t.status === 'succeeded' || t.status === 'blocked')).toBe(true);
      // No synthetic org-fixture-* IDs
      for (const t of targets) {
        expect(t.organizationId).not.toMatch(/^org-fixture-/);
      }

      const [jobCompleted] = await client.db
        .select({ value: count() })
        .from(durableJobs)
        .where(eq(durableJobs.status, 'completed'));
      expect(Number(jobCompleted?.value ?? 0)).toBeGreaterThan(0);

      const [snapCount] = await client.db.select({ value: count() }).from(sourceSnapshots);
      expect(Number(snapCount?.value ?? 0)).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });
});
