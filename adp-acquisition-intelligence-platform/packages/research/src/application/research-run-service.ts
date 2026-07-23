import { randomUUID } from 'node:crypto';

import type { JobDispatcherPort } from '@adp/platform';

import { AllowListResearchCapabilityChecker, type ResearchRole } from '../domain/authz.js';
import {
  assertTransitionResearchRun,
  estimateResearchRun,
  type ResearchRunConfigInput,
  type ResearchRunMode,
  type ResearchRunStatus,
} from '../domain/research-run.js';
import {
  evaluateLaunchGates,
  type LaunchBlocker,
  type SourceGateInput,
} from '../domain/research-run-gates.js';
import type { ClaimRepository } from '../domain/ports.js';
import type { ExtractionRunRepository, SnapshotRepository } from '../domain/persistence-ports.js';
import { EXTRACTOR_VERSION, MAPPING_VERSION, extractClaimsFromHtml } from '../domain/extraction.js';
import { contentHash } from '../domain/snapshot.js';
import {
  CommonCrawlArchiveAdapter,
  OfficialWebsiteAdapter,
  type ArchiveIndexRecord,
} from '../infrastructure/adapters/archive-and-live.js';
import { FixtureRetrievalPort } from '../infrastructure/fixture-retrieval.js';

export type ResearchRunRecord = {
  id: string;
  definitionId: string;
  status: ResearchRunStatus;
  mode: ResearchRunMode;
  correlationId: string;
  idempotencyKey: string;
  configSnapshot: Record<string, unknown>;
  killSwitchActive: boolean;
  targetsTotal: number;
  targetsCompleted: number;
  targetsFailed: number;
  targetsBlocked: number;
  requestsConsumed: number;
  archiveHits: number;
  liveFallbacks: number;
  pagesRetrieved: number;
  snapshotsCreated: number;
  claimsProposed: number;
  pauseReason: string | null;
  cancelReason: string | null;
};

export type ResearchRunTargetRecord = {
  id: string;
  researchRunId: string;
  organizationId: string;
  canonicalDomain: string | null;
  status: string;
  checkpoint: Record<string, unknown>;
};

export type ResearchRunRepository = {
  createDefinition(input: {
    id: string;
    name: string;
    objective: string;
    mode: ResearchRunMode;
    configSnapshot: Record<string, unknown>;
    targetQuerySnapshot: Record<string, unknown>;
    sourceKeys: string[];
    maxOrganizations: number;
    maxPagesPerOrganization: number;
    maxTotalRequests: number;
    archiveFirst: boolean;
    liveFallback: boolean;
    dryRun: boolean;
    freshnessThresholdHours: number;
  }): Promise<{ id: string }>;
  createRun(
    input: Omit<ResearchRunRecord, 'pauseReason' | 'cancelReason'> & {
      pauseReason?: string | null;
      cancelReason?: string | null;
      approvalEvidence?: Record<string, unknown>;
    },
  ): Promise<ResearchRunRecord>;
  getRun(id: string): Promise<ResearchRunRecord | null>;
  listRuns(): Promise<ResearchRunRecord[]>;
  updateRun(
    id: string,
    patch: Partial<ResearchRunRecord> & { errorSummary?: Record<string, unknown> },
  ): Promise<ResearchRunRecord>;
  addTargets(
    targets: Array<{
      id: string;
      researchRunId: string;
      organizationId: string;
      canonicalDomain: string | null;
      status: string;
    }>,
  ): Promise<void>;
  listTargets(runId: string): Promise<ResearchRunTargetRecord[]>;
  updateTarget(
    id: string,
    patch: Partial<ResearchRunTargetRecord> & { lastError?: string | null },
  ): Promise<void>;
  addEvent(runId: string, eventType: string, payload?: Record<string, unknown>): Promise<void>;
  listEvents(
    runId: string,
  ): Promise<Array<{ eventType: string; payload: Record<string, unknown> }>>;
  upsertCheckpoint(
    runId: string,
    checkpointKey: string,
    payload: Record<string, unknown>,
    targetId?: string,
  ): Promise<void>;
  getCheckpoint(runId: string, checkpointKey: string): Promise<Record<string, unknown> | null>;
  addSourceAttempt(input: {
    researchRunId: string;
    targetId: string;
    sourceKey: string;
    adapterType: string;
    status: string;
    requestedUrl?: string;
    provenance?: Record<string, unknown>;
    contentHash?: string;
    errorCode?: string;
  }): Promise<void>;
};

export type ResearchRunOrchestratorDeps = {
  runs: ResearchRunRepository;
  jobs: JobDispatcherPort;
  claims: ClaimRepository;
  snapshots: SnapshotRepository;
  extractionRuns: ExtractionRunRepository;
  liveResearchEnabled: boolean;
  globalKillSwitchActive: boolean;
  fixturePages?: Record<string, { body: string }>;
  archiveRecords?: ArchiveIndexRecord[];
  commonCrawl?: CommonCrawlArchiveAdapter;
  officialWebsite?: OfficialWebsiteAdapter;
};

const FIXTURE_HTML = `<!doctype html><html><body>
<script type="application/ld+json">{"@type":"Organization","name":"Acme Advisory"}</script>
<p>We offer payroll and bookkeeping services for accounting firms.</p>
</body></html>`;

export class ResearchRunService {
  private readonly commonCrawl: CommonCrawlArchiveAdapter;
  private readonly officialWebsite: OfficialWebsiteAdapter;
  private readonly fixture: FixtureRetrievalPort;
  private readonly deps: ResearchRunOrchestratorDeps;

  constructor(deps: ResearchRunOrchestratorDeps) {
    this.deps = deps;
    this.commonCrawl =
      deps.commonCrawl ??
      new CommonCrawlArchiveAdapter({ recordedRecords: deps.archiveRecords ?? [] });
    this.officialWebsite = deps.officialWebsite ?? new OfficialWebsiteAdapter();
    this.fixture = new FixtureRetrievalPort(deps.fixturePages ?? {});
    void this.fixture;
  }

  /** Attach / replace job dispatcher after runtime composition (web/worker). */
  setJobDispatcher(jobs: JobDispatcherPort): void {
    this.deps.jobs = jobs;
  }

  getOfficialWebsiteProbe() {
    return this.officialWebsite.getRequestProbe();
  }

  getCommonCrawlProbe() {
    return this.commonCrawl.getRequestProbe();
  }

  preview(input: {
    role: ResearchRole;
    config: ResearchRunConfigInput;
    sources: SourceGateInput[];
  }) {
    const gate = evaluateLaunchGates({
      role: input.role,
      config: input.config,
      sources: input.sources,
      liveResearchEnabled: this.deps.liveResearchEnabled,
      globalKillSwitchActive: this.deps.globalKillSwitchActive,
    });
    return {
      ...gate,
      policyVersion: 'research-run-policy-v1',
      killSwitchStatus: this.deps.globalKillSwitchActive ? 'active' : 'off',
      liveResearchEnabled: this.deps.liveResearchEnabled,
      confirmationSummary: {
        name: input.config.name,
        mode: input.config.mode,
        sources: input.config.sourceKeys,
        segment: input.config.savedTargetSegment,
        limits: {
          orgs: input.config.maxOrganizations,
          pages: input.config.maxPagesPerOrganization,
          requests: input.config.maxTotalRequests,
        },
        estimates: gate.estimates,
      },
    };
  }

  async createAndLaunch(input: {
    role: ResearchRole;
    config: ResearchRunConfigInput;
    sources: SourceGateInput[];
    targets: Array<{ organizationId: string; canonicalDomain: string | null }>;
    idempotencyKey: string;
    correlationId?: string;
  }): Promise<{ run: ResearchRunRecord; blockers: LaunchBlocker[] }> {
    const authz = new AllowListResearchCapabilityChecker(input.role);
    authz.assert('research_run:create');

    const preview = this.preview(input);
    const definitionId = randomUUID();
    await this.deps.runs.createDefinition({
      id: definitionId,
      name: input.config.name,
      objective: input.config.objective,
      mode: input.config.mode,
      configSnapshot: { ...input.config, estimates: preview.estimates },
      targetQuerySnapshot: {
        segment: input.config.savedTargetSegment,
        territory: input.config.territory,
        organizationType: input.config.organizationType,
      },
      sourceKeys: input.config.sourceKeys,
      maxOrganizations: input.config.maxOrganizations,
      maxPagesPerOrganization: input.config.maxPagesPerOrganization,
      maxTotalRequests: input.config.maxTotalRequests,
      archiveFirst: input.config.archiveFirst,
      liveFallback: input.config.liveFallback,
      dryRun: input.config.dryRun || input.config.mode === 'dry_run',
      freshnessThresholdHours: input.config.freshnessThresholdHours,
    });

    const bounded = input.targets.slice(0, input.config.maxOrganizations);
    let status: ResearchRunStatus = 'draft';
    const runId = randomUUID();
    const correlationId = input.correlationId ?? randomUUID();

    let run = await this.deps.runs.createRun({
      id: runId,
      definitionId,
      status,
      mode: input.config.mode,
      correlationId,
      idempotencyKey: input.idempotencyKey,
      configSnapshot: { ...input.config, estimates: preview.estimates },
      killSwitchActive: false,
      targetsTotal: bounded.length,
      targetsCompleted: 0,
      targetsFailed: 0,
      targetsBlocked: 0,
      requestsConsumed: 0,
      archiveHits: 0,
      liveFallbacks: 0,
      pagesRetrieved: 0,
      snapshotsCreated: 0,
      claimsProposed: 0,
      approvalEvidence: { preview },
    });

    status = 'validating';
    assertTransitionResearchRun(run.status, status);
    run = await this.deps.runs.updateRun(runId, { status });
    await this.deps.runs.addEvent(runId, 'research_run.validating', { blockers: preview.blockers });

    if (!preview.allowed) {
      assertTransitionResearchRun(run.status, 'blocked');
      run = await this.deps.runs.updateRun(runId, {
        status: 'blocked',
        errorSummary: { blockers: preview.blockers },
      });
      await this.deps.runs.addEvent(runId, 'research_run.blocked', { blockers: preview.blockers });
      return { run, blockers: preview.blockers };
    }

    authz.assert('research_run:launch');
    assertTransitionResearchRun(run.status, 'queued');
    run = await this.deps.runs.updateRun(runId, { status: 'queued' });

    await this.deps.runs.addTargets(
      bounded.map((t) => ({
        id: randomUUID(),
        researchRunId: runId,
        organizationId: t.organizationId,
        canonicalDomain: t.canonicalDomain,
        status: 'queued',
      })),
    );
    await this.deps.runs.addEvent(runId, 'research_run.queued', { targets: bounded.length });

    await this.deps.jobs.enqueue({
      name: 'research.run.execute',
      idempotencyKey: `research.run.execute:${runId}`,
      correlationId,
      payload: { researchRunId: runId },
    });

    return { run: (await this.deps.runs.getRun(runId))!, blockers: [] };
  }

  async pause(runId: string, role: ResearchRole, reason: string) {
    new AllowListResearchCapabilityChecker(role).assert('research_run:pause');
    const run = await this.requireRun(runId);
    assertTransitionResearchRun(run.status, 'pausing');
    await this.deps.runs.updateRun(runId, { status: 'pausing', pauseReason: reason });
    assertTransitionResearchRun('pausing', 'paused');
    const updated = await this.deps.runs.updateRun(runId, {
      status: 'paused',
      pauseReason: reason,
    });
    await this.deps.runs.addEvent(runId, 'research_run.paused', { reason });
    return updated;
  }

  async resume(runId: string, role: ResearchRole) {
    new AllowListResearchCapabilityChecker(role).assert('research_run:launch');
    const run = await this.requireRun(runId);
    assertTransitionResearchRun(run.status, 'queued');
    const updated = await this.deps.runs.updateRun(runId, { status: 'queued', pauseReason: null });
    await this.deps.runs.addEvent(runId, 'research_run.resumed', {});
    await this.deps.jobs.enqueue({
      name: 'research.run.execute',
      idempotencyKey: `research.run.execute:${runId}:resume:${Date.now()}`,
      correlationId: run.correlationId,
      payload: { researchRunId: runId },
    });
    return updated;
  }

  async cancel(runId: string, role: ResearchRole, reason: string) {
    new AllowListResearchCapabilityChecker(role).assert('research_run:cancel');
    const run = await this.requireRun(runId);
    assertTransitionResearchRun(run.status, 'cancelled');
    const updated = await this.deps.runs.updateRun(runId, {
      status: 'cancelled',
      cancelReason: reason,
    });
    await this.deps.runs.addEvent(runId, 'research_run.cancelled', { reason });
    return updated;
  }

  async activateKillSwitch(runId: string, role: ResearchRole) {
    new AllowListResearchCapabilityChecker(role).assert('kill_switch:operate');
    const updated = await this.deps.runs.updateRun(runId, { killSwitchActive: true });
    await this.deps.runs.addEvent(runId, 'research_run.kill_switch', {});
    return updated;
  }

  async getRun(id: string): Promise<ResearchRunRecord | null> {
    return this.deps.runs.getRun(id);
  }

  async listRuns(): Promise<ResearchRunRecord[]> {
    return this.deps.runs.listRuns();
  }

  async listTargets(runId: string): Promise<ResearchRunTargetRecord[]> {
    return this.deps.runs.listTargets(runId);
  }

  async listEvents(
    runId: string,
  ): Promise<Array<{ eventType: string; payload: Record<string, unknown> }>> {
    return this.deps.runs.listEvents(runId);
  }

  /**
   * Worker entry — idempotent per target checkpoint.
   * Processes at most one pending target per invocation, then re-enqueues when more remain
   * so pause/resume can interleave (durable workers and deferred web dispatchers).
   */
  async executeRun(researchRunId: string): Promise<void> {
    let run = await this.requireRun(researchRunId);
    if (run.status === 'paused' || run.status === 'pausing') return;
    if (run.status === 'cancelled' || run.status === 'completed' || run.status === 'blocked')
      return;

    if (run.status === 'queued') {
      assertTransitionResearchRun(run.status, 'running');
      run = await this.deps.runs.updateRun(researchRunId, { status: 'running' });
      await this.deps.runs.addEvent(researchRunId, 'research_run.started', {});
    }

    if (run.status !== 'running') return;

    const config = run.configSnapshot as unknown as ResearchRunConfigInput;
    const targets = await this.deps.runs.listTargets(researchRunId);
    const dryRun = Boolean(config.dryRun) || run.mode === 'dry_run';

    const isTerminalTarget = (status: string) =>
      status === 'succeeded' ||
      status === 'skipped' ||
      status === 'cancelled' ||
      status === 'blocked' ||
      status === 'failed';

    const pending = targets.filter((t) => !isTerminalTarget(t.status));
    if (pending.length === 0) {
      assertTransitionResearchRun(run.status, 'completed');
      await this.deps.runs.updateRun(researchRunId, { status: 'completed' });
      await this.deps.runs.addEvent(researchRunId, 'research_run.completed', {});
      return;
    }

    const target = pending[0]!;
    run = await this.requireRun(researchRunId);
    if (run.status === 'paused' || run.status === 'pausing' || run.status === 'cancelled') return;
    if (run.killSwitchActive || this.deps.globalKillSwitchActive) {
      await this.deps.runs.updateTarget(target.id, { status: 'blocked', lastError: 'kill_switch' });
      await this.deps.runs.updateRun(researchRunId, {
        targetsBlocked: run.targetsBlocked + 1,
      });
    } else {
      const checkpointKey = `target:${target.id}:done`;
      const existing = await this.deps.runs.getCheckpoint(researchRunId, checkpointKey);
      if (existing) {
        await this.deps.runs.updateTarget(target.id, { status: 'succeeded' });
      } else {
        await this.deps.runs.updateTarget(target.id, { status: 'running' });
        try {
          const result = await this.processTarget(run, config, target, dryRun);
          await this.deps.runs.upsertCheckpoint(researchRunId, checkpointKey, result, target.id);
          await this.deps.runs.updateTarget(target.id, { status: 'succeeded', checkpoint: result });
          run = await this.deps.runs.updateRun(researchRunId, {
            targetsCompleted: run.targetsCompleted + 1,
            pagesRetrieved: run.pagesRetrieved + Number(result.pagesRetrieved ?? 0),
            snapshotsCreated: run.snapshotsCreated + Number(result.snapshotsCreated ?? 0),
            claimsProposed: run.claimsProposed + Number(result.claimsProposed ?? 0),
            archiveHits: run.archiveHits + Number(result.archiveHits ?? 0),
            liveFallbacks: run.liveFallbacks + Number(result.liveFallbacks ?? 0),
            requestsConsumed: run.requestsConsumed + Number(result.requestsConsumed ?? 0),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.deps.runs.updateTarget(target.id, { status: 'failed', lastError: message });
          await this.deps.runs.updateRun(researchRunId, {
            targetsFailed: run.targetsFailed + 1,
          });
          await this.deps.runs.addEvent(researchRunId, 'research_run.target_failed', {
            targetId: target.id,
            message,
          });
        }
      }
    }

    run = await this.requireRun(researchRunId);
    if (run.status !== 'running') return;

    if (run.requestsConsumed >= (config.maxTotalRequests || Number.MAX_SAFE_INTEGER)) {
      await this.deps.runs.addEvent(researchRunId, 'research_run.budget_exhausted', {});
      assertTransitionResearchRun(run.status, 'completed');
      await this.deps.runs.updateRun(researchRunId, { status: 'completed' });
      await this.deps.runs.addEvent(researchRunId, 'research_run.completed', {});
      return;
    }

    const remaining = (await this.deps.runs.listTargets(researchRunId)).filter(
      (t) => !isTerminalTarget(t.status),
    );
    if (remaining.length === 0) {
      assertTransitionResearchRun(run.status, 'completed');
      await this.deps.runs.updateRun(researchRunId, { status: 'completed' });
      await this.deps.runs.addEvent(researchRunId, 'research_run.completed', {});
      return;
    }

    await this.deps.jobs.enqueue({
      name: 'research.run.execute',
      idempotencyKey: `research.run.execute:${researchRunId}:cont:${remaining[0]!.id}`,
      correlationId: run.correlationId,
      payload: { researchRunId },
    });
  }

  private async processTarget(
    run: ResearchRunRecord,
    config: ResearchRunConfigInput,
    target: ResearchRunTargetRecord,
    dryRun: boolean,
  ): Promise<Record<string, unknown>> {
    const domain = (target.canonicalDomain ?? 'example.test').replace(/^www\./, '');
    const pages = ['/', '/about', '/services'].slice(0, config.maxPagesPerOrganization);
    let pagesRetrieved = 0;
    let snapshotsCreated = 0;
    let claimsProposed = 0;
    let archiveHits = 0;
    let liveFallbacks = 0;
    let requestsConsumed = 0;

    if (dryRun) {
      return {
        dryRun: true,
        pagesPlanned: pages.length,
        pagesRetrieved: 0,
        snapshotsCreated: 0,
        claimsProposed: 0,
      };
    }

    // Preferred order: internal snapshot reuse is modeled as checkpoint skip above.
    // Archive before live when mode requests it.
    if (
      config.mode === 'archive_only' ||
      config.mode === 'archive_first_live_fallback' ||
      (config.archiveFirst &&
        config.mode !== 'fixture' &&
        config.mode !== 'live_official_site_only')
    ) {
      // Archive path requires enabled source + liveResearchEnabled; fixture tests use recorded bodies
      // only when mode is not fixture — for fixture mode we skip to fixture retrieval.
    }

    if (config.mode === 'fixture') {
      for (const path of pages) {
        if (run.killSwitchActive) break;
        const url = `https://${domain}${path === '/' ? '/' : path}`;
        // Kill switch checked before each retrieval
        if (this.deps.globalKillSwitchActive || run.killSwitchActive) {
          throw new Error('kill_switch_active');
        }
        const body =
          this.deps.fixturePages?.[url]?.body ??
          this.deps.fixturePages?.[`https://${domain}/`]?.body ??
          FIXTURE_HTML;
        requestsConsumed += 1;
        pagesRetrieved += 1;
        const hash = contentHash(body);
        const snapshot = await this.deps.snapshots.insert({
          organizationId: target.organizationId,
          requestedUrl: url,
          finalUrl: url,
          domain,
          httpStatus: 200,
          contentType: 'text/html',
          contentHash: hash,
          redirectChain: [],
          adapterVersion: 'fixture-v1',
          parserVersion: 'v1',
          policyVersion: 'research-run-policy-v1',
          retrievedAt: new Date(),
        });
        snapshotsCreated += 1;
        const proposals = extractClaimsFromHtml(body);
        if (proposals.length) {
          const extraction = await this.deps.extractionRuns.insert({
            sourceSnapshotId: snapshot.id,
            extractorVersion: EXTRACTOR_VERSION,
            mappingVersion: MAPPING_VERSION,
            status: 'completed',
            summary: { proposalCount: proposals.length },
          });
          const inserted = await this.deps.claims.insertProposals(
            proposals.map((p) => ({
              ...p,
              organizationId: target.organizationId,
              sourceUrl: url,
              sourceSnapshotId: snapshot.id,
              extractionRunId: extraction.id,
              extractorVersion: EXTRACTOR_VERSION,
              mappingVersion: MAPPING_VERSION,
            })),
          );
          claimsProposed += inserted.length;
        }
        await this.deps.runs.addSourceAttempt({
          researchRunId: run.id,
          targetId: target.id,
          sourceKey: 'organization_website_fixture',
          adapterType: 'fixture',
          status: 'succeeded',
          requestedUrl: url,
          contentHash: hash,
          provenance: { network: false, mode: 'fixture' },
        });
      }
      return {
        pagesRetrieved,
        snapshotsCreated,
        claimsProposed,
        archiveHits,
        liveFallbacks,
        requestsConsumed,
      };
    }

    // Non-fixture modes: attempt archive then optional live — both dual-gated.
    const archiveSource: SourceGateInput = {
      sourceKey: 'archived_web_fixture',
      adapterType: 'archived_web',
      lifecycle: 'draft',
      killSwitchActive: false,
      termsReviewStatus: 'pending',
      privacyReviewStatus: 'pending',
      legalReviewStatus: 'pending',
      securityReviewStatus: 'pending',
    };

    try {
      const archived = await this.commonCrawl.retrieveSelected({
        domain,
        source: archiveSource,
        mode: run.mode,
        liveResearchEnabled: this.deps.liveResearchEnabled,
        globalKillSwitchActive: this.deps.globalKillSwitchActive,
        runKillSwitchActive: run.killSwitchActive,
      });
      if (archived) {
        archiveHits += 1;
        requestsConsumed += 1;
        if (!dryRun) {
          const snapshot = await this.deps.snapshots.insert({
            organizationId: target.organizationId,
            requestedUrl: archived.finalUrl,
            finalUrl: archived.finalUrl,
            domain,
            httpStatus: archived.status,
            contentType: archived.contentType,
            contentHash: String(archived.provenance.contentHash ?? contentHash(archived.body)),
            redirectChain: archived.redirectChain,
            adapterVersion: 'archived-web-v1',
            parserVersion: 'v1',
            policyVersion: 'research-run-policy-v1',
            retrievedAt: new Date(),
          });
          snapshotsCreated += 1;
          pagesRetrieved += 1;
          void snapshot;
        }
      } else if (config.mode === 'archive_first_live_fallback' || config.liveFallback) {
        const liveSource: SourceGateInput = {
          sourceKey: 'organization_website_live',
          adapterType: 'organization_website',
          lifecycle: 'draft',
          killSwitchActive: true,
          termsReviewStatus: 'pending',
          privacyReviewStatus: 'pending',
          legalReviewStatus: 'pending',
          securityReviewStatus: 'pending',
        };
        await this.officialWebsite.retrievePage({
          url: `https://${domain}/`,
          domain,
          source: liveSource,
          mode: run.mode,
          liveResearchEnabled: this.deps.liveResearchEnabled,
          globalKillSwitchActive: this.deps.globalKillSwitchActive,
          runKillSwitchActive: run.killSwitchActive,
          timeoutMs: 10_000,
          maxBytes: 1_048_576,
        });
        liveFallbacks += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.deps.runs.addSourceAttempt({
        researchRunId: run.id,
        targetId: target.id,
        sourceKey: 'gated',
        adapterType: 'gated',
        status: 'blocked',
        errorCode: message,
      });
      throw error;
    }

    return {
      pagesRetrieved,
      snapshotsCreated,
      claimsProposed,
      archiveHits,
      liveFallbacks,
      requestsConsumed,
    };
  }

  private async requireRun(id: string): Promise<ResearchRunRecord> {
    const run = await this.deps.runs.getRun(id);
    if (!run) throw new Error('research_run_not_found');
    return run;
  }
}

export function isLiveResearchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.ADP_LIVE_RESEARCH_ENABLED ?? 'false').trim().toLowerCase() === 'true';
}

export function isGlobalKillSwitchActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.ADP_RESEARCH_GLOBAL_KILL_SWITCH ?? 'false').trim().toLowerCase() === 'true';
}

void estimateResearchRun;
