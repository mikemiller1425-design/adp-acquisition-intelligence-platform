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
import {
  assertCircuitClosed,
  createCircuitBreakerState,
  evaluateRequestBudget,
  recordCircuitAttempt,
} from '../domain/circuit-breaker.js';
import { ResearchRunService } from '../application/research-run-service.js';
import { registerResearchJobHandlers } from '../application/job-handlers.js';
import { createResearchRuntime } from '../application/research-runtime.js';
import { createSourceRegistry } from '../domain/source-registry.js';
import { getFixtureApprovedSource } from '../infrastructure/research-queries.js';
import { OfficialWebsiteAdapter } from '../infrastructure/adapters/archive-and-live.js';
import type { CommonCrawlArchiveAdapter } from '../infrastructure/adapters/archive-and-live.js';
import { InMemoryDurableJobStore } from '../infrastructure/durable-job-store.js';
import { InMemoryResearchRunRepository } from '../infrastructure/research-run-store.js';
import { createInMemoryResearchUnitOfWork } from '../infrastructure/in-memory.js';
import { InProcessConcurrencyGate } from '../infrastructure/concurrency-gate.js';
import type { ApprovedSourceRecord } from '../domain/persistence-ports.js';

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

const ARCHIVE_SOURCE: SourceGateInput = {
  sourceKey: 'archived_web_fixture',
  adapterType: 'archived_web',
  lifecycle: 'enabled',
  killSwitchActive: false,
  termsReviewStatus: 'approved',
  privacyReviewStatus: 'approved',
  legalReviewStatus: 'approved',
  securityReviewStatus: 'approved',
};

const APPROVED_LIVE_SOURCE: SourceGateInput = {
  sourceKey: 'organization_website_live',
  adapterType: 'organization_website',
  lifecycle: 'enabled',
  killSwitchActive: false,
  termsReviewStatus: 'approved',
  privacyReviewStatus: 'approved',
  legalReviewStatus: 'approved',
  securityReviewStatus: 'approved',
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
    archiveRecords?: Array<{
      domain: string;
      originalUrl: string;
      crawlId: string;
      indexRecord: Record<string, unknown>;
      warcLocation: string;
      body?: string;
    }>;
    findFreshSnapshot?: (input: {
      organizationId: string;
      domain: string;
      freshnessThresholdHours: number;
    }) => Promise<{ id: string; contentHash: string; retrievedAt: Date } | null>;
    extraSources?: ApprovedSourceRecord[];
    targetDelayMs?: number;
  } = {},
) {
  const concurrency = new InProcessConcurrencyGate();
  const uow = createInMemoryResearchUnitOfWork(concurrency);
  const approved = uow.approvedSources as {
    seed: (source: ApprovedSourceRecord) => void;
  };
  approved.seed(getFixtureApprovedSource());
  for (const extra of opts.extraSources ?? []) approved.seed(extra);
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
    sourceRegistry: createSourceRegistry(uow.approvedSources),
    fixturePages: opts.fixturePages,
    officialWebsite: opts.officialWebsite,
    commonCrawl: opts.commonCrawl,
    archiveRecords: opts.archiveRecords,
    findFreshSnapshot: opts.findFreshSnapshot,
    targetDelayMs: opts.targetDelayMs,
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

    (runtime.uow.approvedSources as { seed: (s: ApprovedSourceRecord) => void }).seed(
      getFixtureApprovedSource(),
    );
    const wired = new ResearchRunService({
      runs,
      jobs,
      claims: runtime.uow.claims,
      snapshots: runtime.uow.snapshots,
      extractionRuns: runtime.uow.extractionRuns,
      liveResearchEnabled: false,
      globalKillSwitchActive: false,
      sourceRegistry: createSourceRegistry(runtime.uow.approvedSources),
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

describe('source-registry authorization', () => {
  it('denies launch for viewer lacking research_run:launch', () => {
    const result = evaluateLaunchGates({
      role: 'viewer',
      config: fixtureConfig(),
      sources: [FIXTURE_SOURCE],
      liveResearchEnabled: false,
      globalKillSwitchActive: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => b.code === 'capability_denied')).toBe(true);
    expect(result.blockers.find((b) => b.code === 'capability_denied')?.href).toBeTruthy();
  });
});

describe('circuit breaker', () => {
  it('opens on consecutive failures and request budget', () => {
    let state = createCircuitBreakerState();
    const cfg = {
      maxConsecutiveFailures: 3,
      maxFailureRate: 0.9,
      minAttempts: 10,
      maxTotalRequests: 5,
    };
    state = recordCircuitAttempt(state, 'failure', cfg);
    state = recordCircuitAttempt(state, 'failure', cfg);
    expect(state.open).toBe(false);
    state = recordCircuitAttempt(state, 'failure', cfg);
    expect(state.open).toBe(true);
    expect(state.reason).toBe('consecutive_failures');
    expect(() => assertCircuitClosed(state)).toThrow(/circuit_open/);

    expect(evaluateRequestBudget({ requestsConsumed: 5, maxTotalRequests: 5 }).allowed).toBe(false);
    expect(evaluateRequestBudget({ requestsConsumed: 2, maxTotalRequests: 5 }).allowed).toBe(true);
  });
});

describe('archive hit / miss and live fallback gating', () => {
  it('records archive hit with snapshot + claims when dual gates permit recorded body', async () => {
    const html = `<!doctype html><html><body>
<script type="application/ld+json">{"@type":"Organization","name":"Archive Co"}</script>
<p>We offer payroll and bookkeeping services.</p>
</body></html>`;
    const archiveRecord: ApprovedSourceRecord = {
      ...getFixtureApprovedSource(),
      id: '00000000-0000-4000-8000-0000000000a2',
      sourceKey: 'archived_web_fixture',
      displayName: 'Archived Web Fixture',
      adapterType: 'archived_web',
      termsReviewStatus: 'approved',
      privacyReviewStatus: 'approved',
      legalReviewStatus: 'approved',
      securityReviewStatus: 'approved',
      lifecycle: 'enabled',
      killSwitchActive: false,
    };
    const { service, runs, uow } = buildService({
      liveResearchEnabled: true,
      extraSources: [archiveRecord],
      archiveRecords: [
        {
          domain: 'archive-hit.test',
          originalUrl: 'https://archive-hit.test/',
          crawlId: 'CC-MAIN-TEST',
          indexRecord: { urlkey: 'test' },
          warcLocation: 'warc://test',
          body: html,
        },
      ],
    });
    service.setJobDispatcher({ enqueue: async () => ({ jobId: 'noop' }) });

    const { run, blockers } = await service.createAndLaunch({
      role: 'ops',
      config: fixtureConfig({
        mode: 'archive_only',
        sourceKeys: ['archived_web_fixture'],
        archiveFirst: true,
        maxOrganizations: 1,
        maxPagesPerOrganization: 1,
      }),
      sources: [ARCHIVE_SOURCE],
      targets: [{ organizationId: crypto.randomUUID(), canonicalDomain: 'archive-hit.test' }],
      idempotencyKey: 'archive-hit-1',
      requireOperatorApproval: false,
    });
    // Live dual-gate + enabled archive source: may still await approval for non-fixture.
    expect(blockers).toEqual([]);
    if (run.status === 'awaiting_approval') {
      await service.approveRun(run.id, 'ops');
    }
    const enqueueQueue: Array<{ researchRunId: string }> = [{ researchRunId: run.id }];
    service.setJobDispatcher({
      enqueue: async (job) => {
        const researchRunId = String(job.payload.researchRunId ?? '');
        if (researchRunId) enqueueQueue.push({ researchRunId });
        return { jobId: `noop-${enqueueQueue.length}` };
      },
    });
    while (enqueueQueue.length) {
      await service.executeRun(enqueueQueue.shift()!.researchRunId);
    }

    const completed = await runs.getRun(run.id);
    expect(completed?.status).toBe('completed');
    expect(completed?.archiveHits).toBeGreaterThanOrEqual(1);
    expect(completed?.snapshotsCreated).toBeGreaterThanOrEqual(1);
    expect(completed?.claimsProposed).toBeGreaterThanOrEqual(1);
    expect(
      [...(uow.snapshots as { snapshots: Map<string, unknown> }).snapshots.values()].length,
    ).toBeGreaterThan(0);
  });

  it('archive miss + live fallback produces zero outbound when live is unapproved', async () => {
    const probeRetrieval = {
      outbound: 0,
      async retrieve() {
        this.outbound += 1;
        return {
          status: 200,
          finalUrl: 'https://miss.test/',
          body: '<html></html>',
          contentType: 'text/html',
          etag: null,
          lastModified: null,
          redirectChain: [],
        };
      },
    };
    const official = new OfficialWebsiteAdapter({
      retrieval: probeRetrieval,
      resolveAddresses: async () => ['203.0.113.10'],
    });
    const { service } = buildService({
      liveResearchEnabled: false,
      officialWebsite: official,
      archiveRecords: [],
    });

    // Launch itself should be blocked for live fallback mode.
    const preview = service.preview({
      role: 'ops',
      config: fixtureConfig({
        mode: 'archive_first_live_fallback',
        sourceKeys: ['archived_web_fixture', 'organization_website_live'],
        liveFallback: true,
      }),
      sources: [
        { ...ARCHIVE_SOURCE, lifecycle: 'draft', termsReviewStatus: 'pending' },
        LIVE_SOURCE,
      ],
    });
    expect(preview.allowed).toBe(false);
    expect(official.getRequestProbe().outboundRequests).toBe(0);
    expect(probeRetrieval.outbound).toBe(0);
  });
});

describe('official website DNS safety', () => {
  it('blocks private resolved IPs before transport', async () => {
    const probeRetrieval = {
      outbound: 0,
      async retrieve() {
        this.outbound += 1;
        return {
          status: 200,
          finalUrl: 'https://rebind.test/',
          body: '<html></html>',
          contentType: 'text/html',
          etag: null,
          lastModified: null,
          redirectChain: [],
        };
      },
    };
    const adapter = new OfficialWebsiteAdapter({
      retrieval: probeRetrieval,
      resolveAddresses: async () => ['127.0.0.1'],
    });

    await expect(
      adapter.retrievePage({
        url: 'https://rebind.test/',
        domain: 'rebind.test',
        source: APPROVED_LIVE_SOURCE,
        mode: 'live_official_site_only',
        liveResearchEnabled: true,
        globalKillSwitchActive: false,
        runKillSwitchActive: false,
        timeoutMs: 5_000,
        maxBytes: 100_000,
      }),
    ).rejects.toThrow(/private_network|blocked|dns_rebinding/);

    expect(adapter.getRequestProbe().outboundRequests).toBe(0);
    expect(probeRetrieval.outbound).toBe(0);
  });
});

describe('worker restart checkpoint recovery', () => {
  it('skips re-processing targets that already have checkpoints', async () => {
    const html = `<html><body><p>payroll services</p></body></html>`;
    const { service, runs } = buildService({
      fixturePages: { 'https://restart.test/': { body: html } },
    });
    service.setJobDispatcher({ enqueue: async () => ({ jobId: 'noop' }) });

    const orgId = crypto.randomUUID();
    const { run } = await service.createAndLaunch({
      role: 'ops',
      config: fixtureConfig({ maxOrganizations: 1, maxPagesPerOrganization: 1 }),
      sources: [FIXTURE_SOURCE],
      targets: [{ organizationId: orgId, canonicalDomain: 'restart.test' }],
      idempotencyKey: 'restart-1',
    });

    const targets = await runs.listTargets(run.id);
    const target = targets[0]!;
    await runs.upsertCheckpoint(run.id, `target:${target.id}:done`, {
      pagesRetrieved: 1,
      snapshotsCreated: 1,
      claimsProposed: 0,
    });
    await runs.updateRun(run.id, { status: 'running', targetsCompleted: 0 });

    await service.executeRun(run.id);
    const after = await runs.getRun(run.id);
    expect(after?.status).toBe('completed');
    expect(after?.targetsCompleted).toBe(1);
    // No new snapshot side effects beyond checkpoint recovery path.
    expect(after?.snapshotsCreated ?? 0).toBe(0);
  });
});

describe('approvals and metrics persistence', () => {
  it('writes fixture_exempt approval and launch_gate metric on fixture launch', async () => {
    const { service, runs } = buildService();
    service.setJobDispatcher({ enqueue: async () => ({ jobId: 'noop' }) });
    const { run } = await service.createAndLaunch({
      role: 'ops',
      config: fixtureConfig({ dryRun: true, mode: 'dry_run' }),
      sources: [FIXTURE_SOURCE],
      targets: [{ organizationId: crypto.randomUUID(), canonicalDomain: 'metrics.test' }],
      idempotencyKey: 'metrics-1',
    });
    const approvals = await runs.listApprovals(run.id);
    expect(approvals.some((a) => a.approvalType === 'fixture_exempt')).toBe(true);
    const metrics = await runs.listMetrics(run.id);
    expect(metrics.some((m) => m.metricKey === 'launch_gate')).toBe(true);
  });
});

describe('internal snapshot reuse', () => {
  it('prefers fresh internal snapshot over archive/live', async () => {
    const snapshotId = crypto.randomUUID();
    const { service, runs } = buildService({
      liveResearchEnabled: true,
      findFreshSnapshot: async () => ({
        id: snapshotId,
        contentHash: 'abc',
        retrievedAt: new Date(),
      }),
      archiveRecords: [
        {
          domain: 'reuse.test',
          originalUrl: 'https://reuse.test/',
          crawlId: 'CC',
          indexRecord: {},
          warcLocation: 'warc://x',
          body: '<html><body>payroll</body></html>',
        },
      ],
    });
    service.setJobDispatcher({ enqueue: async () => ({ jobId: 'noop' }) });

    const { run } = await service.createAndLaunch({
      role: 'ops',
      config: fixtureConfig({
        mode: 'archive_only',
        sourceKeys: ['archived_web_fixture'],
        maxOrganizations: 1,
        maxPagesPerOrganization: 1,
      }),
      sources: [ARCHIVE_SOURCE],
      targets: [{ organizationId: crypto.randomUUID(), canonicalDomain: 'reuse.test' }],
      idempotencyKey: 'reuse-1',
      requireOperatorApproval: false,
    });
    if (run.status === 'awaiting_approval') {
      await service.approveRun(run.id, 'ops');
    }
    const enqueueQueue: Array<{ researchRunId: string }> = [{ researchRunId: run.id }];
    service.setJobDispatcher({
      enqueue: async (job) => {
        const researchRunId = String(job.payload.researchRunId ?? '');
        if (researchRunId) enqueueQueue.push({ researchRunId });
        return { jobId: `noop-${enqueueQueue.length}` };
      },
    });
    while (enqueueQueue.length) {
      await service.executeRun(enqueueQueue.shift()!.researchRunId);
    }
    const completed = await runs.getRun(run.id);
    expect(completed?.status).toBe('completed');
    expect(completed?.archiveHits).toBe(0);
    expect(completed?.pagesRetrieved).toBe(0);
    expect(runs.sourceAttempts.some((a) => a.adapterType === 'internal_snapshot')).toBe(true);
  });
});

describe('zero-egress probes', () => {
  const cases: Array<{
    name: string;
    liveResearchEnabled: boolean;
    globalKillSwitchActive: boolean;
    runKillSwitchActive: boolean;
    source: SourceGateInput;
    mode: ResearchRunConfigInput['mode'];
  }> = [
    {
      name: 'ADP_LIVE_RESEARCH_ENABLED false',
      liveResearchEnabled: false,
      globalKillSwitchActive: false,
      runKillSwitchActive: false,
      source: APPROVED_LIVE_SOURCE,
      mode: 'live_official_site_only',
    },
    {
      name: 'source draft',
      liveResearchEnabled: true,
      globalKillSwitchActive: false,
      runKillSwitchActive: false,
      source: { ...APPROVED_LIVE_SOURCE, lifecycle: 'draft' },
      mode: 'live_official_site_only',
    },
    {
      name: 'owner review pending',
      liveResearchEnabled: true,
      globalKillSwitchActive: false,
      runKillSwitchActive: false,
      source: { ...APPROVED_LIVE_SOURCE, legalReviewStatus: 'pending' },
      mode: 'live_official_site_only',
    },
    {
      name: 'global kill switch',
      liveResearchEnabled: true,
      globalKillSwitchActive: true,
      runKillSwitchActive: false,
      source: APPROVED_LIVE_SOURCE,
      mode: 'live_official_site_only',
    },
    {
      name: 'source kill switch',
      liveResearchEnabled: true,
      globalKillSwitchActive: false,
      runKillSwitchActive: false,
      source: { ...APPROVED_LIVE_SOURCE, killSwitchActive: true },
      mode: 'live_official_site_only',
    },
    {
      name: 'run kill switch',
      liveResearchEnabled: true,
      globalKillSwitchActive: false,
      runKillSwitchActive: true,
      source: APPROVED_LIVE_SOURCE,
      mode: 'live_official_site_only',
    },
    {
      name: 'fixture mode forbids network',
      liveResearchEnabled: true,
      globalKillSwitchActive: false,
      runKillSwitchActive: false,
      source: APPROVED_LIVE_SOURCE,
      mode: 'fixture',
    },
  ];

  for (const c of cases) {
    it(`produces zero outbound when ${c.name}`, async () => {
      const probeRetrieval = {
        outbound: 0,
        async retrieve() {
          this.outbound += 1;
          return {
            status: 200,
            finalUrl: 'https://zero.test/',
            body: '<html></html>',
            contentType: 'text/html',
            etag: null,
            lastModified: null,
            redirectChain: [],
          };
        },
      };
      const adapter = new OfficialWebsiteAdapter({
        retrieval: probeRetrieval,
        resolveAddresses: async () => ['203.0.113.50'],
      });
      await expect(
        adapter.retrievePage({
          url: 'https://zero.test/',
          domain: 'zero.test',
          source: c.source,
          mode: c.mode,
          liveResearchEnabled: c.liveResearchEnabled,
          globalKillSwitchActive: c.globalKillSwitchActive,
          runKillSwitchActive: c.runKillSwitchActive,
          timeoutMs: 5_000,
          maxBytes: 100_000,
        }),
      ).rejects.toThrow();
      expect(adapter.getRequestProbe().outboundRequests).toBe(0);
      expect(probeRetrieval.outbound).toBe(0);
    });
  }

  it('launch gates deny when source is absent', () => {
    const result = evaluateLaunchGates({
      role: 'ops',
      config: fixtureConfig({
        mode: 'live_official_site_only',
        sourceKeys: ['missing_source'],
      }),
      sources: [],
      liveResearchEnabled: true,
      globalKillSwitchActive: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => b.code === 'source_not_found')).toBe(true);
  });
});

describe('durable lease reclaim', () => {
  it('requeues abandoned running jobs after lease expiry', async () => {
    const store = new InMemoryDurableJobStore();
    const dispatcher = new DurableJobDispatcher(store, {
      processInline: false,
      workerId: 'w1',
      leaseMs: 10,
    });
    let executions = 0;
    dispatcher.register('research.run.execute', async () => {
      executions += 1;
    });

    await dispatcher.enqueue({
      name: 'research.run.execute',
      idempotencyKey: 'lease-1',
      payload: { researchRunId: 'run-lease' },
    });

    // Simulate abandoned claim without complete.
    const claimed = await store.claim('dead-worker');
    expect(claimed?.status).toBe('running');
    const job = [...store.jobs.values()][0]!;
    (job as { lockedAtMs?: number }).lockedAtMs = Date.now() - 60_000;

    const reclaimed = await store.reclaimExpiredLeases({ leaseMs: 1_000 });
    expect(reclaimed).toBe(1);
    expect(job.status).toBe('queued');

    await dispatcher.processOne();
    expect(executions).toBe(1);
  });
});

describe('source registry port', () => {
  it('fail-closes on missing source and maps enabled fixture', async () => {
    const { createSourceRegistry } = await import('../domain/source-registry.js');
    const repo = {
      async getByKey(sourceKey: string) {
        if (sourceKey !== FIXTURE_SOURCE.sourceKey) return null;
        return {
          id: '00000000-0000-4000-8000-0000000000a1',
          ...FIXTURE_SOURCE,
          displayName: 'Fixture',
          domains: ['*'],
          classification: 'live_simulated',
          businessPurpose: 'pilot',
          permittedOrganizationTypes: ['accounting'],
          permittedFields: ['services'],
          prohibitedFields: ['personal_email'],
          robotsBehavior: 'respect',
          rateLimitPerMinute: 60,
          concurrencyLimit: 2,
          pageLimit: 3,
          responseSizeLimitBytes: 1_048_576,
          timeoutMs: 5_000,
          redirectPolicy: 'same_registrable_domain',
          refreshIntervalHours: 168,
          snapshotRetentionDays: 90,
          parserVersion: 'v1',
          owner: 'research_eng',
          approvalEvidence: {},
        };
      },
      async setKillSwitch() {},
      async getKillSwitch() {
        return false;
      },
    };
    const registry = createSourceRegistry(repo);
    const missing = await registry.requireGate('nope');
    expect(missing.ok).toBe(false);
    const ok = await registry.requireGate(FIXTURE_SOURCE.sourceKey);
    expect(ok.ok).toBe(true);
  });
});

describe('dynamic source revocation (worker revalidation)', () => {
  it('blocks subsequent targets after source kill switch with zero additional retrievals', async () => {
    const enqueueQueue: Array<{ researchRunId: string }> = [];
    const html = `<!doctype html><html><body>
<script type="application/ld+json">{"@type":"Organization","name":"Revoke Co"}</script>
<p>We offer payroll and bookkeeping services.</p>
</body></html>`;
    const { service, runs, uow } = buildService({
      fixturePages: {
        'https://alpha.test/': { body: html },
        'https://alpha.test/about': { body: html },
        'https://beta.test/': { body: html },
        'https://beta.test/about': { body: html },
        'https://gamma.test/': { body: html },
        'https://gamma.test/about': { body: html },
      },
    });
    service.setJobDispatcher({
      enqueue: async (job) => {
        const researchRunId = String(job.payload.researchRunId ?? '');
        if (researchRunId) enqueueQueue.push({ researchRunId });
        return { jobId: `noop-${enqueueQueue.length}` };
      },
    });

    const { run, blockers } = await service.createAndLaunch({
      role: 'admin',
      config: fixtureConfig({
        maxOrganizations: 3,
        maxPagesPerOrganization: 1,
        maxTotalRequests: 20,
        name: 'revocation-run',
      }),
      sources: [FIXTURE_SOURCE],
      targets: [
        { organizationId: crypto.randomUUID(), canonicalDomain: 'alpha.test' },
        { organizationId: crypto.randomUUID(), canonicalDomain: 'beta.test' },
        { organizationId: crypto.randomUUID(), canonicalDomain: 'gamma.test' },
      ],
      idempotencyKey: 'revocation-1',
    });
    expect(blockers).toEqual([]);
    expect(enqueueQueue.length).toBe(1);

    await service.executeRun(enqueueQueue.shift()!.researchRunId);
    let current = await runs.getRun(run.id);
    expect(current?.targetsCompleted).toBe(1);
    const requestsAfterFirst = current?.requestsConsumed ?? 0;
    expect(requestsAfterFirst).toBeGreaterThan(0);
    const snapshotsAfterFirst = current?.snapshotsCreated ?? 0;
    // Continuation enqueued after first target.
    expect(enqueueQueue.length).toBeGreaterThanOrEqual(1);

    await uow.approvedSources.setKillSwitch('organization_website_fixture', true);

    await service.executeRun(enqueueQueue.shift()!.researchRunId);
    current = await runs.getRun(run.id);
    expect(current?.requestsConsumed).toBe(requestsAfterFirst);
    expect(current?.snapshotsCreated).toBe(snapshotsAfterFirst);
    expect(current?.targetsBlocked).toBeGreaterThanOrEqual(1);

    const targets = await runs.listTargets(run.id);
    const blocked = targets.filter((t) => t.status === 'blocked');
    expect(blocked.length).toBeGreaterThanOrEqual(1);
    expect(blocked.some((t) => String(t.lastError).includes('kill_switch'))).toBe(true);

    const metrics = await runs.listMetrics(run.id);
    expect(metrics.some((m) => m.metricKey === 'source_authorization')).toBe(true);
    const events = await runs.listEvents(run.id);
    expect(events.some((e) => e.eventType === 'research_run.target_blocked')).toBe(true);

    // Clearing kill switch alone must not bypass still-pending approvals.
    await uow.approvedSources.setKillSwitch('organization_website_fixture', false);
    const record = await uow.approvedSources.getByKey('organization_website_fixture');
    expect(record).toBeTruthy();
    (uow.approvedSources as { seed: (s: ApprovedSourceRecord) => void }).seed({
      ...record!,
      killSwitchActive: false,
      termsReviewStatus: 'pending',
      privacyReviewStatus: 'pending',
      legalReviewStatus: 'pending',
      securityReviewStatus: 'pending',
    });

    while (enqueueQueue.length) {
      await service.executeRun(enqueueQueue.shift()!.researchRunId);
    }
    current = await runs.getRun(run.id);
    expect(current?.requestsConsumed).toBe(requestsAfterFirst);
    expect(current?.snapshotsCreated).toBe(snapshotsAfterFirst);
    const finalTargets = await runs.listTargets(run.id);
    const succeeded = finalTargets.filter((t) => t.status === 'succeeded');
    expect(succeeded.length).toBe(1);
    expect(finalTargets.every((t) => t.status === 'succeeded' || t.status === 'blocked')).toBe(
      true,
    );
    expect(
      finalTargets.some(
        (t) =>
          t.status === 'blocked' &&
          (String(t.lastError).includes('terms_not_approved') ||
            String(t.lastError).includes('source_authorization_revoked')),
      ),
    ).toBe(true);
  });
});
