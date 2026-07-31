import { describe, expect, it } from 'vitest';
import { DurableJobDispatcher, InMemoryJobDispatcher } from '@adp/platform';

import {
  assertTransitionResearchRun,
  canTransitionResearchRun,
  type ResearchRunConfigInput,
} from '../domain/research-run.js';
import {
  assertNetworkRetrievalPermitted,
  evaluateLaunchGates,
  type SourceGateInput,
} from '../domain/research-run-gates.js';
import { ResearchRunService } from '../application/research-run-service.js';
import { registerResearchJobHandlers } from '../application/job-handlers.js';
import { createResearchRuntime } from '../application/research-runtime.js';
import { OfficialWebsiteAdapter } from '../infrastructure/adapters/archive-and-live.js';
import type { CommonCrawlArchiveAdapter } from '../infrastructure/adapters/archive-and-live.js';
import { InMemoryDurableJobStore } from '../infrastructure/durable-job-store.js';
import { InMemoryResearchRunRepository } from '../infrastructure/research-run-store.js';
import { createInMemoryResearchUnitOfWork } from '../infrastructure/in-memory.js';
import { InProcessConcurrencyGate } from '../infrastructure/concurrency-gate.js';

const FIXTURE_SOURCE: SourceGateInput = {
  sourceKey: 'organization_website_fixture',
  adapterType: 'fixture',
  lifecycle: 'enabled',
  killSwitchActive: false,
  termsReviewStatus: 'not_required_for_fixture',
  privacyReviewStatus: 'not_required_for_fixture',
  legalReviewStatus: 'not_required_for_fixture',
  securityReviewStatus: 'not_required_for_fixture',
};

const LIVE_SOURCE: SourceGateInput = {
  sourceKey: 'organization_website_live',
  adapterType: 'organization_website',
  lifecycle: 'draft',
  killSwitchActive: true,
  termsReviewStatus: 'pending',
  privacyReviewStatus: 'pending',
  legalReviewStatus: 'pending',
  securityReviewStatus: 'pending',
};

function fixtureConfig(overrides: Partial<ResearchRunConfigInput> = {}): ResearchRunConfigInput {
  return {
    name: 'Fixture run',
    objective: 'Validate orchestration',
    mode: 'fixture',
    savedTargetSegment: 'segment-a',
    territory: null,
    organizationType: null,
    maxOrganizations: 2,
    maxPagesPerOrganization: 2,
    maxTotalRequests: 10,
    sourceKeys: ['organization_website_fixture'],
    archiveFirst: false,
    liveFallback: false,
    dryRun: false,
    freshnessThresholdHours: 168,
    ...overrides,
  };
}

function buildService(
  opts: {
    liveResearchEnabled?: boolean;
    globalKillSwitchActive?: boolean;
    jobs?: InMemoryJobDispatcher;
    fixturePages?: Record<string, { body: string }>;
    officialWebsite?: OfficialWebsiteAdapter;
    commonCrawl?: CommonCrawlArchiveAdapter;
  } = {},
) {
  const concurrency = new InProcessConcurrencyGate();
  const uow = createInMemoryResearchUnitOfWork(concurrency);
  const runs = new InMemoryResearchRunRepository();
  const jobs = opts.jobs ?? new InMemoryJobDispatcher();
  const service = new ResearchRunService({
    runs,
    jobs,
    claims: uow.claims,
    snapshots: uow.snapshots,
    extractionRuns: uow.extractionRuns,
    liveResearchEnabled: opts.liveResearchEnabled ?? false,
    globalKillSwitchActive: opts.globalKillSwitchActive ?? false,
    fixturePages: opts.fixturePages,
    officialWebsite: opts.officialWebsite,
    commonCrawl: opts.commonCrawl,
  });
  return { service, runs, jobs, uow };
}

describe('research run state machine', () => {
  it('allows valid transitions and rejects invalid ones', () => {
    expect(canTransitionResearchRun('draft', 'validating')).toBe(true);
    expect(canTransitionResearchRun('validating', 'queued')).toBe(true);
    expect(canTransitionResearchRun('queued', 'running')).toBe(true);
    expect(canTransitionResearchRun('running', 'pausing')).toBe(true);
    expect(canTransitionResearchRun('pausing', 'paused')).toBe(true);
    expect(canTransitionResearchRun('paused', 'queued')).toBe(true);
    expect(canTransitionResearchRun('running', 'completed')).toBe(true);
    expect(canTransitionResearchRun('completed', 'running')).toBe(false);
    expect(() => assertTransitionResearchRun('blocked', 'queued')).toThrow(
      /invalid_research_run_transition/,
    );
    expect(() => assertTransitionResearchRun('queued', 'paused')).toThrow(
      /invalid_research_run_transition/,
    );
  });
});

describe('research run launch gates', () => {
  it('blocks launch when saved target segment is missing', () => {
    const result = evaluateLaunchGates({
      role: 'ops',
      config: fixtureConfig({ savedTargetSegment: null }),
      sources: [FIXTURE_SOURCE],
      liveResearchEnabled: false,
      globalKillSwitchActive: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => b.code === 'target_segment_required')).toBe(true);
  });

  it('blocks live mode when ADP_LIVE_RESEARCH_ENABLED is false', () => {
    const result = evaluateLaunchGates({
      role: 'ops',
      config: fixtureConfig({
        mode: 'live_official_site_only',
        sourceKeys: ['organization_website_live'],
        liveFallback: false,
      }),
      sources: [LIVE_SOURCE],
      liveResearchEnabled: false,
      globalKillSwitchActive: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => b.code === 'live_research_disabled')).toBe(true);
  });
});

describe('fixture mode launch + execute', () => {
  it('launches and completes with snapshots and claims via in-memory UoW', async () => {
    const html = `<!doctype html><html><body>
<script type="application/ld+json">{"@type":"Organization","name":"Acme Advisory"}</script>
<p>We offer payroll and bookkeeping services for accounting firms.</p>
</body></html>`;
    const { service, runs, uow } = buildService({
      fixturePages: {
        'https://acme-advisory.test/': { body: html },
        'https://acme-advisory.test/about': { body: html },
      },
    });

    // Avoid auto-executing via InMemoryJobDispatcher handlers — call executeRun in a drain loop.
    const enqueueQueue: Array<{ researchRunId: string }> = [];
    service.setJobDispatcher({
      enqueue: async (job) => {
        const researchRunId = String(job.payload.researchRunId ?? '');
        if (researchRunId) enqueueQueue.push({ researchRunId });
        return { jobId: `noop-${enqueueQueue.length}` };
      },
    });

    const { run, blockers } = await service.createAndLaunch({
      role: 'ops',
      config: fixtureConfig({ maxPagesPerOrganization: 2, maxOrganizations: 1 }),
      sources: [FIXTURE_SOURCE],
      targets: [{ organizationId: crypto.randomUUID(), canonicalDomain: 'acme-advisory.test' }],
      idempotencyKey: 'fixture-launch-1',
    });

    expect(blockers).toEqual([]);
    expect(run.status).toBe('queued');

    // Drain continuation jobs (one target per executeRun invocation).
    enqueueQueue.push({ researchRunId: run.id });
    while (enqueueQueue.length) {
      const next = enqueueQueue.shift()!;
      await service.executeRun(next.researchRunId);
    }

    const completed = await runs.getRun(run.id);
    expect(completed?.status).toBe('completed');
    expect(completed?.snapshotsCreated).toBeGreaterThan(0);
    expect(completed?.claimsProposed).toBeGreaterThan(0);
    expect(completed?.pagesRetrieved).toBeGreaterThan(0);

    const snapshots = [
      ...(uow.snapshots as { snapshots: Map<string, unknown> }).snapshots.values(),
    ];
    expect(snapshots.length).toBeGreaterThan(0);
    const claims = [...(uow.claims as { claims: Map<string, unknown> }).claims.values()];
    expect(claims.length).toBeGreaterThan(0);
  });
});

describe('unauthorized live retrieval', () => {
  it('OfficialWebsiteAdapter produces zero outbound when gated', async () => {
    const probeRetrieval = {
      outbound: 0,
      async retrieve() {
        this.outbound += 1;
        return {
          status: 200,
          finalUrl: 'https://example.com/',
          body: '<html></html>',
          contentType: 'text/html',
          etag: null,
          lastModified: null,
          redirectChain: [],
        };
      },
    };
    const adapter = new OfficialWebsiteAdapter({ retrieval: probeRetrieval });

    await expect(
      adapter.retrievePage({
        url: 'https://example.com/',
        domain: 'example.com',
        source: LIVE_SOURCE,
        mode: 'live_official_site_only',
        liveResearchEnabled: false,
        globalKillSwitchActive: false,
        runKillSwitchActive: false,
        timeoutMs: 5_000,
        maxBytes: 100_000,
      }),
    ).rejects.toThrow();

    expect(adapter.getRequestProbe().outboundRequests).toBe(0);
    expect(probeRetrieval.outbound).toBe(0);

    expect(() =>
      assertNetworkRetrievalPermitted({
        liveResearchEnabled: false,
        source: LIVE_SOURCE,
        globalKillSwitchActive: false,
        runKillSwitchActive: false,
        mode: 'live_official_site_only',
      }),
    ).toThrow();
  });
});

describe('pause / resume / cancel', () => {
  it('transitions pause, resume, and cancel correctly', async () => {
    const { service, runs } = buildService();
    service.setJobDispatcher({ enqueue: async () => ({ jobId: 'noop' }) });

    const { run } = await service.createAndLaunch({
      role: 'ops',
      config: fixtureConfig({ dryRun: true, mode: 'dry_run' }),
      sources: [FIXTURE_SOURCE],
      targets: [{ organizationId: crypto.randomUUID(), canonicalDomain: 'pause.test' }],
      idempotencyKey: 'pause-resume-1',
    });

    await runs.updateRun(run.id, { status: 'running' });

    const paused = await service.pause(run.id, 'ops', 'operator_request');
    expect(paused.status).toBe('paused');
    expect(paused.pauseReason).toBe('operator_request');

    const resumed = await service.resume(run.id, 'ops');
    expect(resumed.status).toBe('queued');

    await runs.updateRun(run.id, { status: 'running' });
    const cancelled = await service.cancel(run.id, 'ops', 'stop');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelReason).toBe('stop');
  });
});

describe('DurableJobDispatcher idempotency', () => {
  it('replays duplicate idempotency keys without double-processing', async () => {
    const store = new InMemoryDurableJobStore();
    const dispatcher = new DurableJobDispatcher(store, { processInline: true });
    let executions = 0;
    dispatcher.register('research.run.execute', async () => {
      executions += 1;
    });

    const first = await dispatcher.enqueue({
      name: 'research.run.execute',
      idempotencyKey: 'research.run.execute:run-1',
      payload: { researchRunId: 'run-1' },
    });
    const second = await dispatcher.enqueue({
      name: 'research.run.execute',
      idempotencyKey: 'research.run.execute:run-1',
      payload: { researchRunId: 'run-1' },
    });

    expect(first.jobId).toBe(second.jobId);
    expect(executions).toBe(1);
    expect(dispatcher.processed).toHaveLength(1);
    expect(await store.depth()).toBe(0);
  });
});

describe('kill switch before request', () => {
  it('blocks target processing when kill switch is active before retrieval', async () => {
    const html = `<html><body><p>payroll services</p></body></html>`;
    const { service, runs } = buildService({
      fixturePages: { 'https://kill.test/': { body: html } },
    });
    const enqueueQueue: Array<{ researchRunId: string }> = [];
    service.setJobDispatcher({
      enqueue: async (job) => {
        const researchRunId = String(job.payload.researchRunId ?? '');
        if (researchRunId) enqueueQueue.push({ researchRunId });
        return { jobId: `noop-${enqueueQueue.length}` };
      },
    });

    const { run } = await service.createAndLaunch({
      role: 'ops',
      config: fixtureConfig({ maxOrganizations: 1, maxPagesPerOrganization: 1 }),
      sources: [FIXTURE_SOURCE],
      targets: [{ organizationId: crypto.randomUUID(), canonicalDomain: 'kill.test' }],
      idempotencyKey: 'kill-switch-1',
    });

    await service.activateKillSwitch(run.id, 'ops');
    enqueueQueue.push({ researchRunId: run.id });
    while (enqueueQueue.length) {
      const next = enqueueQueue.shift()!;
      await service.executeRun(next.researchRunId);
    }

    const updated = await runs.getRun(run.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.targetsBlocked).toBeGreaterThanOrEqual(1);
    expect(updated?.pagesRetrieved).toBe(0);
    expect(updated?.snapshotsCreated).toBe(0);

    const targets = await runs.listTargets(run.id);
    expect(targets.every((t) => t.status === 'blocked')).toBe(true);
  });
});

describe('research.run.execute job handler', () => {
  it('wires execute through registerResearchJobHandlers', async () => {
    const runtime = createResearchRuntime({ ADP_RESEARCH_PROVIDER: 'memory' });
    const jobs = new InMemoryJobDispatcher();
    const runs = new InMemoryResearchRunRepository();
    const html = `<!doctype html><html><body>
<script type="application/ld+json">{"@type":"Organization","name":"Wire Co"}</script>
<p>We offer payroll services.</p>
</body></html>`;

    const wired = new ResearchRunService({
      runs,
      jobs,
      claims: runtime.uow.claims,
      snapshots: runtime.uow.snapshots,
      extractionRuns: runtime.uow.extractionRuns,
      liveResearchEnabled: false,
      globalKillSwitchActive: false,
      fixturePages: {
        'https://wire.test/': { body: html },
        'https://wire.test/about': { body: html },
      },
    });
    (runtime as { researchRuns: ResearchRunService }).researchRuns = wired;
    registerResearchJobHandlers(jobs, runtime);

    const { run, blockers } = await wired.createAndLaunch({
      role: 'admin',
      config: fixtureConfig({
        maxOrganizations: 1,
        maxPagesPerOrganization: 1,
        name: 'wired',
      }),
      sources: [FIXTURE_SOURCE],
      targets: [{ organizationId: crypto.randomUUID(), canonicalDomain: 'wire.test' }],
      idempotencyKey: 'job-handler-wire-1',
    });

    expect(blockers).toEqual([]);
    // InMemoryJobDispatcher runs research.run.execute inline on enqueue
    const after = await runs.getRun(run.id);
    expect(after?.status).toBe('completed');
    expect(after?.snapshotsCreated).toBeGreaterThan(0);
  });
});
