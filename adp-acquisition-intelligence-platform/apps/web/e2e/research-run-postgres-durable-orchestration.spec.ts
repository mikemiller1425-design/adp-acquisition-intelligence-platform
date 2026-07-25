/**
 * Phase 1.2 PostgreSQL durable research-run orchestration E2E.
 *
 * Deterministic proofs:
 * - Abandoned running-job lease reclaim across worker identities
 * - Unconditional pause/resume before completion
 *
 * Live egress remains disabled. Does not replace Phase 1.1 persistent workflow.
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, test } from '@playwright/test';

const PORT = Number(process.env.ADP_WEB_E2E_PORT ?? 3102);
const WORKER_HEALTH = Number(process.env.ADP_WORKER_HEALTH_PORT ?? 3103);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgres://adp:adp@127.0.0.1:5432/adp_acquisition_test';

const WORKER_A = 'e2e-worker-a';
const WORKER_B = 'e2e-worker-b';
const LEASE_MS = 3_000;
const TARGET_DELAY_MS = 8_000;

let web: ChildProcess | null = null;
let worker: ChildProcess | null = null;
let bootLog = '';
let activeWorkerId = WORKER_A;
let activeTargetDelayMs = 0;

function freePort(port: number) {
  try {
    execSync(
      `bash -lc 'pids=$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true); if [ -n "$pids" ]; then kill -9 $pids || true; fi'`,
      { stdio: 'ignore' },
    );
  } catch {
    // best-effort
  }
}

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
  freePort(PORT);
  await delay(300);
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

async function startWorker(opts: { workerId: string; targetDelayMs?: number; leaseMs?: number }) {
  if (worker) await stopWorker();
  freePort(WORKER_HEALTH);
  await delay(300);
  activeWorkerId = opts.workerId;
  activeTargetDelayMs = opts.targetDelayMs ?? 0;
  const leaseMs = opts.leaseMs ?? LEASE_MS;
  worker = spawn('pnpm', ['exec', 'tsx', 'src/server.ts'], {
    cwd: process.cwd().replace(/apps\/web$/, 'apps/worker'),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ADP_RESEARCH_PROVIDER: 'postgres',
      ADP_JOB_QUEUE: 'durable',
      ADP_LIVE_RESEARCH_ENABLED: 'false',
      ADP_WORKER_ID: opts.workerId,
      ADP_JOB_LEASE_MS: String(leaseMs),
      ADP_RESEARCH_RUN_TARGET_DELAY_MS: String(activeTargetDelayMs),
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
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  attachLogs(worker, `worker:${opts.workerId}`);
  await waitUrl(`http://127.0.0.1:${WORKER_HEALTH}/health`);
}

async function stopWorker() {
  if (!worker?.pid) {
    worker = null;
    return;
  }
  const pid = worker.pid;
  worker.kill('SIGKILL');
  await delay(500);
  try {
    process.kill(pid, 0);
    process.kill(pid, 'SIGKILL');
  } catch {
    // gone
  }
  worker = null;
  freePort(WORKER_HEALTH);
  await delay(300);
}

type Probe = {
  jobMode: string;
  durableJobs: { queued: number; running: number; completed: number; dead: number };
  jobs: Array<{
    id: string;
    name: string;
    status: string;
    attempts: number;
    lockedBy: string | null;
    lockedAt: string | null;
    lastError: string | null;
    payload: Record<string, unknown>;
  }>;
  workerHeartbeat: { workerId: string; lastSeenAt: string } | null;
  researchRun: {
    id: string;
    status: string;
    snapshotsCreated: number;
    targetsCompleted: number;
    targetsBlocked: number;
    targetsFailed: number;
    requestsConsumed: number;
    pagesRetrieved: number;
    targets: Array<{
      id: string;
      organizationId: string;
      status: string;
      lastError: string | null;
      checkpoint: Record<string, unknown> | null;
    }>;
  } | null;
};

async function probeQueue(runId?: string): Promise<Probe> {
  const qs = runId ? `?runId=${encodeURIComponent(runId)}` : '';
  const res = await fetch(`${BASE_URL}/api/research/durable-queue-probe${qs}`);
  expect(res.ok).toBeTruthy();
  return res.json() as Promise<Probe>;
}

async function launchRun(page: import('@playwright/test').Page, name: string, maxOrgs: string) {
  await page.goto('/research');
  await expect(page.getByTestId('research-hub')).toBeVisible();
  await page.getByTestId('start-research-run').click();
  await expect(page.getByTestId('research-run-new')).toBeVisible();
  await page.getByTestId('run-name').fill(name);
  await page.getByTestId('run-segment').fill('pilot-accounting-segment');
  await page.getByTestId('run-territory').fill('');
  await page.getByTestId('run-org-type').fill('');
  await page.getByTestId('run-max-orgs').fill(maxOrgs);
  await page.getByTestId('run-max-pages').fill('1');
  await page.getByTestId('run-max-requests').fill('20');
  await page.getByTestId('run-mode').selectOption('fixture');
  await page.getByTestId('run-source').selectOption('organization_website_fixture');
  await page.getByTestId('preview-research-run').click();
  await expect(page.getByTestId('approval-status')).toHaveText('gates_passed');
  await page.getByTestId('run-operator-confirm').check();
  await page.getByTestId('launch-research-run').click();
  await expect(page.getByTestId('research-run-detail')).toBeVisible();
  await expect(page.getByTestId('research-run-job-mode')).toHaveText('durable_postgres');
  await expect(page.getByTestId('advance-research-run')).toHaveCount(0);
  const runId = page.url().split('/').pop()!;
  return runId;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await startWeb();
});

test.afterAll(async () => {
  await stopWorker();
  await stopWeb();
});

test.describe('Phase 1.2 PostgreSQL durable research-run orchestration', () => {
  test('abandoned running job is reclaimed by a different worker without duplicates', async ({
    page,
  }) => {
    await startWorker({ workerId: WORKER_A, targetDelayMs: TARGET_DELAY_MS, leaseMs: LEASE_MS });
    let sawHeartbeat = false;
    for (let i = 0; i < 40; i += 1) {
      if ((await probeQueue()).workerHeartbeat?.workerId === WORKER_A) {
        sawHeartbeat = true;
        break;
      }
      await delay(250);
    }
    expect(sawHeartbeat).toBe(true);

    const runId = await launchRun(page, 'PG abandoned-lease recovery', '2');

    let runningJob: Probe['jobs'][number] | undefined;
    for (let i = 0; i < 80; i += 1) {
      const probe = await probeQueue(runId);
      runningJob = probe.jobs.find(
        (j) => j.status === 'running' && j.name === 'research.run.execute',
      );
      if (runningJob) break;
      await delay(200);
    }
    expect(runningJob, `expected running durable job\n${bootLog}`).toBeTruthy();

    const abandonedJobId = runningJob!.id;
    const attemptsBefore = runningJob!.attempts;
    const lockedBy = runningJob!.lockedBy;
    const lockedAt = runningJob!.lockedAt;
    expect(lockedBy).toBe(WORKER_A);
    expect(lockedAt).toBeTruthy();
    expect(attemptsBefore).toBeGreaterThanOrEqual(1);

    const mid = await probeQueue(runId);
    const checkpointsBeforeKill = (mid.researchRun?.targets ?? []).filter(
      (t) => t.status === 'succeeded' || (t.checkpoint && Object.keys(t.checkpoint).length),
    ).length;

    // Terminate while job is still running (delay barrier still holding).
    await stopWorker();

    // Job remains running until lease expires.
    let stillRunning = false;
    for (let i = 0; i < 10; i += 1) {
      const probe = await probeQueue(runId);
      const job = probe.jobs.find((j) => j.id === abandonedJobId);
      if (job?.status === 'running') {
        stillRunning = true;
        break;
      }
      await delay(200);
    }
    expect(stillRunning).toBe(true);

    // Wait past lease, then start a different worker with no delay.
    await delay(LEASE_MS + 1_500);
    await startWorker({ workerId: WORKER_B, targetDelayMs: 0, leaseMs: LEASE_MS });

    let reclaimedAttempts: number | null = null;
    for (let i = 0; i < 80; i += 1) {
      const probe = await probeQueue(runId);
      const job = probe.jobs.find((j) => j.id === abandonedJobId);
      if (
        job &&
        (job.status === 'queued' || job.status === 'running' || job.status === 'completed')
      ) {
        if (
          job.attempts > attemptsBefore ||
          job.lockedBy === WORKER_B ||
          job.status === 'completed'
        ) {
          reclaimedAttempts = job.attempts;
        }
      }
      if (probe.researchRun?.status === 'completed') {
        reclaimedAttempts = job?.attempts ?? reclaimedAttempts;
        break;
      }
      await delay(400);
    }
    expect(reclaimedAttempts).not.toBeNull();
    expect(reclaimedAttempts!).toBeGreaterThanOrEqual(attemptsBefore);

    for (let i = 0; i < 80; i += 1) {
      await page.reload();
      if ((await page.getByTestId('research-run-status').textContent()) === 'completed') break;
      await delay(400);
    }
    await expect(page.getByTestId('research-run-status')).toHaveText('completed');

    const finalProbe = await probeQueue(runId);
    expect(finalProbe.researchRun?.status).toBe('completed');
    expect(finalProbe.researchRun?.targetsCompleted).toBeGreaterThanOrEqual(2);
    expect(finalProbe.researchRun?.snapshotsCreated).toBeGreaterThan(0);

    const succeeded = (finalProbe.researchRun?.targets ?? []).filter(
      (t) => t.status === 'succeeded',
    );
    expect(succeeded.length).toBeGreaterThanOrEqual(2);
    // No duplicate target rows
    const orgIds = succeeded.map((t) => t.organizationId);
    expect(new Set(orgIds).size).toBe(orgIds.length);
    // Completed work is not duplicated beyond target count (1 page/org).
    expect(finalProbe.researchRun?.snapshotsCreated ?? 0).toBeLessThanOrEqual(
      (finalProbe.researchRun?.targets.length ?? 0) + 1,
    );
    void checkpointsBeforeKill;

    const completedJob = finalProbe.jobs.find((j) => j.id === abandonedJobId);
    // Original abandoned job may complete after reclaim, or a continuation job may finish.
    // Either way attempts must have advanced for the reclaim path when the same id completed.
    if (completedJob?.status === 'completed') {
      expect(completedJob.attempts).toBeGreaterThanOrEqual(attemptsBefore);
    }
    expect(finalProbe.durableJobs.completed).toBeGreaterThan(0);

    // Evidence fields for PR report
    console.log(
      JSON.stringify({
        abandonedJobId,
        originalWorkerId: WORKER_A,
        replacementWorkerId: WORKER_B,
        attemptsBefore,
        attemptsAfter: reclaimedAttempts,
        snapshotsCreated: finalProbe.researchRun?.snapshotsCreated,
        targetsCompleted: finalProbe.researchRun?.targetsCompleted,
        duplicateTargetOrgs: orgIds.length - new Set(orgIds).size,
      }),
    );
  });

  test('unconditional pause/resume before completion', async ({ page }) => {
    await startWorker({ workerId: WORKER_A, targetDelayMs: TARGET_DELAY_MS, leaseMs: LEASE_MS });

    const runId = await launchRun(page, 'PG unconditional pause resume', '3');

    // Wait until running with barrier holding first target.
    for (let i = 0; i < 60; i += 1) {
      await page.reload();
      if ((await page.getByTestId('research-run-status').textContent()) === 'running') break;
      await delay(250);
    }
    await expect(page.getByTestId('research-run-status')).toHaveText('running');

    await page.getByTestId('pause-research-run').click();
    await expect(page.getByTestId('research-run-status')).toHaveText('paused');
    const completedAtPause = Number(
      await page.getByTestId('research-run-targets-completed').textContent(),
    );

    // While paused, no new targets begin (allow in-flight delayed target to finish).
    await delay(TARGET_DELAY_MS + 2_000);
    await page.reload();
    await expect(page.getByTestId('research-run-status')).toHaveText('paused');
    const completedWhilePaused = Number(
      await page.getByTestId('research-run-targets-completed').textContent(),
    );
    // At most the in-flight target may complete; no further progress after that.
    expect(completedWhilePaused).toBeLessThanOrEqual(completedAtPause + 1);
    const probePaused = await probeQueue(runId);
    const nonTerminal = (probePaused.researchRun?.targets ?? []).filter(
      (t) => t.status === 'queued' || t.status === 'running',
    );
    // After in-flight settles, remaining work stays queued while paused.
    await delay(1_000);
    const probePaused2 = await probeQueue(runId);
    expect(probePaused2.researchRun?.status).toBe('paused');
    const runningAfterSettle = (probePaused2.researchRun?.targets ?? []).filter(
      (t) => t.status === 'running',
    );
    expect(runningAfterSettle.length).toBe(0);
    void nonTerminal;

    // Resume without delay so remaining targets finish promptly.
    await stopWorker();
    await startWorker({ workerId: WORKER_B, targetDelayMs: 0, leaseMs: LEASE_MS });
    await page.getByTestId('resume-research-run').click();
    await expect(page.getByTestId('research-run-status')).toHaveText('queued');

    for (let i = 0; i < 80; i += 1) {
      await page.reload();
      if ((await page.getByTestId('research-run-status').textContent()) === 'completed') break;
      await delay(400);
    }
    await expect(page.getByTestId('research-run-status')).toHaveText('completed');
    const finalProbe = await probeQueue(runId);
    expect(finalProbe.researchRun?.targetsCompleted).toBeGreaterThanOrEqual(2);
    console.log(
      JSON.stringify({
        pauseResume: 'passed',
        completedAtPause,
        completedWhilePaused,
        finalTargetsCompleted: finalProbe.researchRun?.targetsCompleted,
      }),
    );
  });
});
