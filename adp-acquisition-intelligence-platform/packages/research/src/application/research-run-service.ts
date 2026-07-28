import { randomUUID } from 'node:crypto';

import type { JobDispatcherPort } from '@adp/platform';

import { AllowListResearchCapabilityChecker, type ResearchRole } from '../domain/authz.js';
import {
  assertCircuitClosed,
  createCircuitBreakerState,
  evaluateRequestBudget,
  recordCircuitAttempt,
  type CircuitBreakerState,
} from '../domain/circuit-breaker.js';
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
import type {
  ApprovedSourceRecord,
  ExtractionRunRepository,
  SnapshotRepository,
} from '../domain/persistence-ports.js';
import { EXTRACTOR_VERSION, MAPPING_VERSION, extractClaimsFromHtml } from '../domain/extraction.js';
import { contentHash } from '../domain/snapshot.js';
import { sourcePolicySnapshot, type SourceRegistryPort } from '../domain/source-registry.js';
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
  lastError?: string | null;
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
  addApproval(input: {
    researchRunId: string;
    approvalType: string;
    status: string;
    evidence?: Record<string, unknown>;
  }): Promise<void>;
  listApprovals(
    runId: string,
  ): Promise<Array<{ approvalType: string; status: string; evidence: Record<string, unknown> }>>;
  recordMetric(
    runId: string,
    metricKey: string,
    metricValue: Record<string, unknown>,
  ): Promise<void>;
  listMetrics(
    runId: string,
  ): Promise<Array<{ metricKey: string; metricValue: Record<string, unknown> }>>;
};

export type FreshSnapshotLookup = (input: {
  organizationId: string;
  domain: string;
  freshnessThresholdHours: number;
}) => Promise<{ id: string; contentHash: string; retrievedAt: Date } | null>;

export type ResearchRunOrchestratorDeps = {
  runs: ResearchRunRepository;
  jobs: JobDispatcherPort;
  claims: ClaimRepository;
  snapshots: SnapshotRepository;
  extractionRuns: ExtractionRunRepository;
  liveResearchEnabled: boolean;
  globalKillSwitchActive: boolean;
  /** Canonical approved_sources port — revalidated before every retrieval. */
  sourceRegistry: SourceRegistryPort;
  fixturePages?: Record<string, { body: string }>;
  archiveRecords?: ArchiveIndexRecord[];
  commonCrawl?: CommonCrawlArchiveAdapter;
  officialWebsite?: OfficialWebsiteAdapter;
  /** Optional internal-snapshot reuse (preferred order step 2). */
  findFreshSnapshot?: FreshSnapshotLookup;
  /**
   * Test barrier: delay (ms) after authorizing a target and before retrieval.
   * Used to hold durable_jobs in `running` for abandoned-lease proofs.
   */
  targetDelayMs?: number;
};

export type SourceAuthorizationDenied = {
  ok: false;
  code: string;
  message: string;
  launchPolicyVersion: string | null;
  currentPolicyVersion: string;
  launchSourceSnapshot: Record<string, unknown> | null;
  currentSourceSnapshot: Record<string, unknown> | null;
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
  private readonly circuitByRun = new Map<string, CircuitBreakerState>();

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

  /**
   * Load the *current* approved_sources record and enforce authorization.
   * Launch snapshot is historical evidence only — revocation/kill switch wins.
   */
  async authorizeSourceForRetrieval(input: {
    sourceKey: string;
    run: ResearchRunRecord;
    config: ResearchRunConfigInput;
  }): Promise<
    { ok: true; gate: SourceGateInput; record: ApprovedSourceRecord } | SourceAuthorizationDenied
  > {
    const launchSnap = (
      input.run.configSnapshot as { sourcePolicySnapshot?: Record<string, unknown> }
    ).sourcePolicySnapshot;
    const launchPolicyVersion =
      launchSnap && typeof launchSnap.policyVersion === 'string' ? launchSnap.policyVersion : null;
    const launchSources = Array.isArray(launchSnap?.sources)
      ? (launchSnap!.sources as Array<Record<string, unknown>>)
      : [];
    const launchSource =
      launchSources.find((s) => s.sourceKey === input.sourceKey) ??
      (launchSources[0] as Record<string, unknown> | undefined) ??
      null;

    if (this.deps.globalKillSwitchActive || input.run.killSwitchActive) {
      return {
        ok: false,
        code: 'kill_switch',
        message: 'Run or global kill switch active',
        launchPolicyVersion,
        currentPolicyVersion: 'research-run-policy-v1',
        launchSourceSnapshot: launchSource,
        currentSourceSnapshot: null,
      };
    }

    const loaded = await this.deps.sourceRegistry.requireGate(input.sourceKey);
    if (!loaded.ok) {
      return {
        ok: false,
        code: loaded.code,
        message: loaded.message,
        launchPolicyVersion,
        currentPolicyVersion: 'research-run-policy-v1',
        launchSourceSnapshot: launchSource,
        currentSourceSnapshot: null,
      };
    }

    const record = loaded.source;
    const currentPolicy = sourcePolicySnapshot([record]);
    const currentOne = (currentPolicy.sources as Array<Record<string, unknown>>)[0] ?? null;

    if (record.rateLimitPerMinute < 1 || record.concurrencyLimit < 1) {
      return {
        ok: false,
        code: 'source_limits_invalid',
        message: 'Source rate/concurrency limits are not positive',
        launchPolicyVersion,
        currentPolicyVersion: 'research-run-policy-v1',
        launchSourceSnapshot: launchSource,
        currentSourceSnapshot: currentOne,
      };
    }
    if (!record.permittedFields.length) {
      return {
        ok: false,
        code: 'permitted_fields_empty',
        message: 'Source has no permitted fields',
        launchPolicyVersion,
        currentPolicyVersion: 'research-run-policy-v1',
        launchSourceSnapshot: launchSource,
        currentSourceSnapshot: currentOne,
      };
    }
    const orgType = input.config.organizationType;
    if (
      orgType &&
      record.permittedOrganizationTypes.length > 0 &&
      !record.permittedOrganizationTypes.includes(orgType)
    ) {
      return {
        ok: false,
        code: 'organization_type_not_permitted',
        message: `Organization type ${orgType} is not permitted for ${input.sourceKey}`,
        launchPolicyVersion,
        currentPolicyVersion: 'research-run-policy-v1',
        launchSourceSnapshot: launchSource,
        currentSourceSnapshot: currentOne,
      };
    }

    return { ok: true, gate: loaded.gate, record };
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
    /** When true, non-fixture runs stop at awaiting_approval until approveRun. */
    requireOperatorApproval?: boolean;
  }): Promise<{ run: ResearchRunRecord; blockers: LaunchBlocker[] }> {
    const authz = new AllowListResearchCapabilityChecker(input.role);
    authz.assert('research_run:create');

    const preview = this.preview(input);
    const definitionId = randomUUID();
    const configSnapshot = {
      ...input.config,
      estimates: preview.estimates,
      sources: input.sources,
      policyVersion: 'research-run-policy-v1',
    };
    await this.deps.runs.createDefinition({
      id: definitionId,
      name: input.config.name,
      objective: input.config.objective,
      mode: input.config.mode,
      configSnapshot,
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
      configSnapshot,
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
      await this.deps.runs.addApproval({
        researchRunId: runId,
        approvalType: 'launch_gate',
        status: 'denied',
        evidence: { blockers: preview.blockers },
      });
      return { run, blockers: preview.blockers };
    }

    authz.assert('research_run:launch');

    const fixtureLike = input.config.mode === 'fixture' || input.config.mode === 'dry_run';
    const needsApproval =
      Boolean(input.requireOperatorApproval) ||
      (!fixtureLike &&
        input.sources.some(
          (s) => s.adapterType === 'archived_web' || s.adapterType === 'organization_website',
        ));

    await this.deps.runs.addTargets(
      bounded.map((t) => ({
        id: randomUUID(),
        researchRunId: runId,
        organizationId: t.organizationId,
        canonicalDomain: t.canonicalDomain,
        status: 'queued',
      })),
    );

    if (needsApproval && !fixtureLike) {
      assertTransitionResearchRun(run.status, 'awaiting_approval');
      run = await this.deps.runs.updateRun(runId, { status: 'awaiting_approval' });
      await this.deps.runs.addApproval({
        researchRunId: runId,
        approvalType: 'operator_confirmation',
        status: 'pending',
        evidence: { mode: input.config.mode, sources: input.config.sourceKeys },
      });
      await this.deps.runs.addEvent(runId, 'research_run.awaiting_approval', {});
      await this.deps.runs.recordMetric(runId, 'launch_gate', {
        allowed: true,
        awaitingApproval: true,
        estimates: preview.estimates,
      });
      return { run, blockers: [] };
    }

    await this.deps.runs.addApproval({
      researchRunId: runId,
      approvalType: fixtureLike ? 'fixture_exempt' : 'operator_confirmation',
      status: 'approved',
      evidence: {
        mode: input.config.mode,
        role: input.role,
        note: fixtureLike
          ? 'Fixture/dry_run uses not_required_for_fixture reviews; not a legal approval'
          : 'Operator launch confirmation',
      },
    });

    assertTransitionResearchRun(run.status, 'queued');
    run = await this.deps.runs.updateRun(runId, { status: 'queued' });
    await this.deps.runs.addEvent(runId, 'research_run.queued', { targets: bounded.length });
    await this.deps.runs.recordMetric(runId, 'launch_gate', {
      allowed: true,
      estimates: preview.estimates,
    });

    await this.deps.jobs.enqueue({
      name: 'research.run.execute',
      idempotencyKey: `research.run.execute:${runId}`,
      correlationId,
      payload: { researchRunId: runId },
    });

    return { run: (await this.deps.runs.getRun(runId))!, blockers: [] };
  }

  /** Promote awaiting_approval → queued after operator confirmation. */
  async approveRun(runId: string, role: ResearchRole, evidence: Record<string, unknown> = {}) {
    new AllowListResearchCapabilityChecker(role).assert('research_run:launch');
    const run = await this.requireRun(runId);
    assertTransitionResearchRun(run.status, 'queued');
    await this.deps.runs.addApproval({
      researchRunId: runId,
      approvalType: 'operator_confirmation',
      status: 'approved',
      evidence: { ...evidence, role },
    });
    const updated = await this.deps.runs.updateRun(runId, { status: 'queued' });
    await this.deps.runs.addEvent(runId, 'research_run.queued', { via: 'approveRun' });
    await this.deps.jobs.enqueue({
      name: 'research.run.execute',
      idempotencyKey: `research.run.execute:${runId}:approved`,
      correlationId: run.correlationId,
      payload: { researchRunId: runId },
    });
    return updated;
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

  async listApprovals(runId: string) {
    return this.deps.runs.listApprovals(runId);
  }

  async listMetrics(runId: string) {
    return this.deps.runs.listMetrics(runId);
  }

  /** Exportable operator report (no secrets; provenance summaries only). */
  async exportRunReport(runId: string): Promise<Record<string, unknown>> {
    const run = await this.requireRun(runId);
    const targets = await this.deps.runs.listTargets(runId);
    const events = await this.deps.runs.listEvents(runId);
    const approvals = await this.deps.runs.listApprovals(runId);
    const metrics = await this.deps.runs.listMetrics(runId);
    return {
      run,
      targets,
      events,
      approvals,
      metrics,
      policyVersion: 'research-run-policy-v1',
      liveResearchEnabledDefault: false,
      exportedAt: new Date().toISOString(),
    };
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

    const budget = evaluateRequestBudget({
      requestsConsumed: run.requestsConsumed,
      maxTotalRequests: config.maxTotalRequests || 0,
    });
    if (!budget.allowed) {
      await this.deps.runs.addEvent(researchRunId, 'research_run.budget_exhausted', {
        reason: budget.reason,
      });
      assertTransitionResearchRun(run.status, 'completed');
      await this.deps.runs.updateRun(researchRunId, { status: 'completed' });
      await this.deps.runs.recordMetric(researchRunId, 'circuit_breaker', {
        open: true,
        reason: budget.reason,
      });
      return;
    }

    const circuit = this.circuitByRun.get(researchRunId) ?? createCircuitBreakerState();
    try {
      assertCircuitClosed(circuit);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.deps.runs.updateTarget(target.id, { status: 'blocked', lastError: message });
      await this.deps.runs.updateRun(researchRunId, {
        targetsBlocked: run.targetsBlocked + 1,
      });
      await this.deps.runs.addEvent(researchRunId, 'research_run.circuit_open', { message });
      await this.deps.runs.recordMetric(researchRunId, 'circuit_breaker', {
        ...circuit,
        open: true,
      });
      // Fall through to completion check below.
      run = await this.requireRun(researchRunId);
    }

    if (run.status === 'running' && !circuit.open) {
      if (run.killSwitchActive || this.deps.globalKillSwitchActive) {
        await this.deps.runs.updateTarget(target.id, {
          status: 'blocked',
          lastError: 'kill_switch',
        });
        await this.deps.runs.updateRun(researchRunId, {
          targetsBlocked: run.targetsBlocked + 1,
        });
      } else {
        const checkpointKey = `target:${target.id}:done`;
        const existing = await this.deps.runs.getCheckpoint(researchRunId, checkpointKey);
        if (existing) {
          // Worker/web restart recovery: do not repeat successful work.
          if (target.status !== 'succeeded') {
            await this.deps.runs.updateTarget(target.id, {
              status: 'succeeded',
              checkpoint: existing,
            });
            run = await this.deps.runs.updateRun(researchRunId, {
              targetsCompleted: run.targetsCompleted + 1,
            });
          }
        } else {
          await this.deps.runs.updateTarget(target.id, { status: 'running' });
          try {
            const result = await this.processTarget(run, config, target, dryRun);
            await this.deps.runs.upsertCheckpoint(researchRunId, checkpointKey, result, target.id);
            await this.deps.runs.updateTarget(target.id, {
              status: 'succeeded',
              checkpoint: result,
            });
            run = await this.deps.runs.updateRun(researchRunId, {
              targetsCompleted: run.targetsCompleted + 1,
              pagesRetrieved: run.pagesRetrieved + Number(result.pagesRetrieved ?? 0),
              snapshotsCreated: run.snapshotsCreated + Number(result.snapshotsCreated ?? 0),
              claimsProposed: run.claimsProposed + Number(result.claimsProposed ?? 0),
              archiveHits: run.archiveHits + Number(result.archiveHits ?? 0),
              liveFallbacks: run.liveFallbacks + Number(result.liveFallbacks ?? 0),
              requestsConsumed: run.requestsConsumed + Number(result.requestsConsumed ?? 0),
            });
            const nextCircuit = recordCircuitAttempt(circuit, 'success', {
              maxConsecutiveFailures: 5,
              maxFailureRate: 0.8,
              minAttempts: 5,
              maxTotalRequests: config.maxTotalRequests,
            });
            this.circuitByRun.set(researchRunId, nextCircuit);
            await this.deps.runs.recordMetric(researchRunId, 'progress', {
              targetsCompleted: run.targetsCompleted,
              requestsConsumed: run.requestsConsumed,
              archiveHits: run.archiveHits,
              liveFallbacks: run.liveFallbacks,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const authzBlocked =
              message.startsWith('source_authorization_revoked:') ||
              message.includes('kill_switch') ||
              message.includes('lifecycle_not_enabled') ||
              message.includes('terms_not_approved') ||
              message.includes('privacy_not_approved') ||
              message.includes('legal_not_approved') ||
              message.includes('security_not_approved');
            const nextCircuit = recordCircuitAttempt(
              circuit,
              authzBlocked ? 'success' : 'failure',
              {
                maxConsecutiveFailures: 5,
                maxFailureRate: 0.8,
                minAttempts: 5,
                maxTotalRequests: config.maxTotalRequests,
              },
            );
            this.circuitByRun.set(researchRunId, nextCircuit);
            if (authzBlocked) {
              await this.deps.runs.updateTarget(target.id, {
                status: 'blocked',
                lastError: message,
              });
              await this.deps.runs.updateRun(researchRunId, {
                targetsBlocked: run.targetsBlocked + 1,
              });
              await this.deps.runs.addEvent(researchRunId, 'research_run.target_blocked', {
                targetId: target.id,
                message,
                reason: 'source_authorization',
              });
              await this.deps.runs.recordMetric(researchRunId, 'source_authorization', {
                blocked: true,
                message,
              });
            } else {
              await this.deps.runs.updateTarget(target.id, {
                status: 'failed',
                lastError: message,
              });
              await this.deps.runs.updateRun(researchRunId, {
                targetsFailed: run.targetsFailed + 1,
              });
              await this.deps.runs.addEvent(researchRunId, 'research_run.target_failed', {
                targetId: target.id,
                message,
              });
            }
            if (nextCircuit.open) {
              await this.deps.runs.recordMetric(researchRunId, 'circuit_breaker', {
                ...nextCircuit,
              });
            }
          }
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

  private resolveSources(config: ResearchRunConfigInput): SourceGateInput[] {
    const snap = config as ResearchRunConfigInput & { sources?: SourceGateInput[] };
    if (Array.isArray(snap.sources) && snap.sources.length) return snap.sources;
    return config.sourceKeys.map((sourceKey) => ({
      sourceKey,
      adapterType: sourceKey.includes('archive')
        ? 'archived_web'
        : sourceKey.includes('fixture')
          ? 'fixture'
          : 'organization_website',
      lifecycle: 'draft' as const,
      killSwitchActive: true,
      termsReviewStatus: 'pending',
      privacyReviewStatus: 'pending',
      legalReviewStatus: 'pending',
      securityReviewStatus: 'pending',
    }));
  }

  private async persistRetrievalAsClaims(input: {
    run: ResearchRunRecord;
    target: ResearchRunTargetRecord;
    domain: string;
    url: string;
    body: string;
    contentType: string;
    httpStatus: number;
    redirectChain: string[];
    adapterVersion: string;
    sourceKey: string;
    adapterType: string;
    provenance: Record<string, unknown>;
  }): Promise<{ snapshotsCreated: number; claimsProposed: number; contentHash: string }> {
    const hash = contentHash(input.body);
    const snapshot = await this.deps.snapshots.insert({
      organizationId: input.target.organizationId,
      requestedUrl: input.url,
      finalUrl: input.url,
      domain: input.domain,
      httpStatus: input.httpStatus,
      contentType: input.contentType,
      contentHash: hash,
      redirectChain: input.redirectChain,
      adapterVersion: input.adapterVersion,
      parserVersion: 'v1',
      policyVersion: 'research-run-policy-v1',
      retrievedAt: new Date(),
    });
    let claimsProposed = 0;
    const proposals = extractClaimsFromHtml(input.body);
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
          organizationId: input.target.organizationId,
          sourceUrl: input.url,
          sourceSnapshotId: snapshot.id,
          extractionRunId: extraction.id,
          extractorVersion: EXTRACTOR_VERSION,
          mappingVersion: MAPPING_VERSION,
        })),
      );
      claimsProposed = inserted.length;
    }
    await this.deps.runs.addSourceAttempt({
      researchRunId: input.run.id,
      targetId: input.target.id,
      sourceKey: input.sourceKey,
      adapterType: input.adapterType,
      status: 'succeeded',
      requestedUrl: input.url,
      contentHash: hash,
      provenance: input.provenance,
    });
    return { snapshotsCreated: 1, claimsProposed, contentHash: hash };
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
    let internalSnapshotHits = 0;
    const licensedHits = 0;

    if (dryRun) {
      return {
        dryRun: true,
        pagesPlanned: pages.length,
        pagesRetrieved: 0,
        snapshotsCreated: 0,
        claimsProposed: 0,
      };
    }

    const sources = this.resolveSources(config);
    const delayMs =
      this.deps.targetDelayMs ?? Number(process.env.ADP_RESEARCH_RUN_TARGET_DELAY_MS ?? 0);

    if (config.mode === 'fixture') {
      const sourceKey =
        sources.find((s) => s.adapterType === 'fixture')?.sourceKey ??
        config.sourceKeys.find((k) => k.includes('fixture')) ??
        'organization_website_fixture';
      const authz = await this.authorizeSourceForRetrieval({ sourceKey, run, config });
      if (!authz.ok) {
        await this.deps.runs.addSourceAttempt({
          researchRunId: run.id,
          targetId: target.id,
          sourceKey,
          adapterType: 'fixture',
          status: 'blocked',
          errorCode: authz.code,
          provenance: {
            reason: 'source_authorization_revoked',
            launchPolicyVersion: authz.launchPolicyVersion,
            currentPolicyVersion: authz.currentPolicyVersion,
            launchSourceSnapshot: authz.launchSourceSnapshot,
            currentSourceSnapshot: authz.currentSourceSnapshot,
            requestsOutbound: 0,
          },
        });
        throw new Error(`source_authorization_revoked:${authz.code}`);
      }
      if (Number.isFinite(delayMs) && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      for (const path of pages) {
        // Re-check immediately before each retrieval page.
        const pageAuthz = await this.authorizeSourceForRetrieval({ sourceKey, run, config });
        if (!pageAuthz.ok) {
          await this.deps.runs.addSourceAttempt({
            researchRunId: run.id,
            targetId: target.id,
            sourceKey,
            adapterType: 'fixture',
            status: 'blocked',
            errorCode: pageAuthz.code,
            provenance: {
              reason: 'source_authorization_revoked',
              launchPolicyVersion: pageAuthz.launchPolicyVersion,
              currentPolicyVersion: pageAuthz.currentPolicyVersion,
              launchSourceSnapshot: pageAuthz.launchSourceSnapshot,
              currentSourceSnapshot: pageAuthz.currentSourceSnapshot,
              requestsOutbound: 0,
              pagesRetrievedSoFar: pagesRetrieved,
            },
          });
          throw new Error(`source_authorization_revoked:${pageAuthz.code}`);
        }
        const url = `https://${domain}${path === '/' ? '/' : path}`;
        const body =
          this.deps.fixturePages?.[url]?.body ??
          this.deps.fixturePages?.[`https://${domain}/`]?.body ??
          FIXTURE_HTML;
        requestsConsumed += 1;
        pagesRetrieved += 1;
        const persisted = await this.persistRetrievalAsClaims({
          run,
          target,
          domain,
          url,
          body,
          contentType: 'text/html',
          httpStatus: 200,
          redirectChain: [],
          adapterVersion: 'fixture-v1',
          sourceKey: pageAuthz.gate.sourceKey,
          adapterType: 'fixture',
          provenance: {
            network: false,
            mode: 'fixture',
            currentLifecycle: pageAuthz.record.lifecycle,
            currentKillSwitch: pageAuthz.record.killSwitchActive,
          },
        });
        snapshotsCreated += persisted.snapshotsCreated;
        claimsProposed += persisted.claimsProposed;
      }
      return {
        pagesRetrieved,
        snapshotsCreated,
        claimsProposed,
        archiveHits,
        liveFallbacks,
        requestsConsumed,
        internalSnapshotHits,
        licensedHits,
      };
    }

    // Preferred collection order for non-fixture modes:
    // 1) licensed/structured  2) internal snapshot  3) archive  4) live fallback
    const licensed = sources.find(
      (s) => s.adapterType === 'licensed' || s.adapterType === 'structured',
    );
    if (licensed) {
      await this.deps.runs.addSourceAttempt({
        researchRunId: run.id,
        targetId: target.id,
        sourceKey: licensed.sourceKey,
        adapterType: licensed.adapterType,
        status: 'skipped',
        errorCode: 'licensed_source_not_enabled_rb014',
        provenance: { order: 1, blocker: 'RB-014' },
      });
    }

    if (this.deps.findFreshSnapshot) {
      const fresh = await this.deps.findFreshSnapshot({
        organizationId: target.organizationId,
        domain,
        freshnessThresholdHours: config.freshnessThresholdHours,
      });
      if (fresh) {
        internalSnapshotHits += 1;
        await this.deps.runs.addSourceAttempt({
          researchRunId: run.id,
          targetId: target.id,
          sourceKey: 'internal_snapshot',
          adapterType: 'internal_snapshot',
          status: 'succeeded',
          contentHash: fresh.contentHash,
          provenance: {
            order: 2,
            snapshotId: fresh.id,
            retrievedAt: fresh.retrievedAt.toISOString(),
            reused: true,
          },
        });
        return {
          pagesRetrieved: 0,
          snapshotsCreated: 0,
          claimsProposed: 0,
          archiveHits: 0,
          liveFallbacks: 0,
          requestsConsumed: 0,
          internalSnapshotHits,
          licensedHits,
          reusedSnapshotId: fresh.id,
        };
      }
    }

    const wantsArchive =
      config.mode === 'archive_only' ||
      config.mode === 'archive_first_live_fallback' ||
      (config.archiveFirst && config.mode !== 'live_official_site_only');
    const wantsLive =
      config.mode === 'live_official_site_only' ||
      config.mode === 'archive_first_live_fallback' ||
      config.liveFallback;

    const archiveSource = sources.find((s) => s.adapterType === 'archived_web');
    const liveSource = sources.find((s) => s.adapterType === 'organization_website');

    let archiveMiss = false;
    if (wantsArchive && archiveSource) {
      try {
        const authz = await this.authorizeSourceForRetrieval({
          sourceKey: archiveSource.sourceKey,
          run,
          config,
        });
        if (!authz.ok) {
          await this.deps.runs.addSourceAttempt({
            researchRunId: run.id,
            targetId: target.id,
            sourceKey: archiveSource.sourceKey,
            adapterType: 'archived_web',
            status: 'blocked',
            errorCode: authz.code,
            provenance: {
              order: 3,
              reason: 'source_authorization_revoked',
              launchPolicyVersion: authz.launchPolicyVersion,
              currentPolicyVersion: authz.currentPolicyVersion,
              launchSourceSnapshot: authz.launchSourceSnapshot,
              currentSourceSnapshot: authz.currentSourceSnapshot,
              requestsOutbound: 0,
            },
          });
          throw new Error(`source_authorization_revoked:${authz.code}`);
        }
        if (Number.isFinite(delayMs) && delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        const archived = await this.commonCrawl.retrieveSelected({
          domain,
          source: authz.gate,
          mode: run.mode,
          liveResearchEnabled: this.deps.liveResearchEnabled,
          globalKillSwitchActive: this.deps.globalKillSwitchActive,
          runKillSwitchActive: run.killSwitchActive,
        });
        if (archived) {
          archiveHits += 1;
          requestsConsumed += 1;
          pagesRetrieved += 1;
          const persisted = await this.persistRetrievalAsClaims({
            run,
            target,
            domain,
            url: archived.finalUrl,
            body: archived.body,
            contentType: archived.contentType ?? 'text/html',
            httpStatus: archived.status,
            redirectChain: archived.redirectChain ?? [],
            adapterVersion: 'archived-web-v1',
            sourceKey: archiveSource.sourceKey,
            adapterType: 'archived_web',
            provenance: { ...archived.provenance, order: 3 },
          });
          snapshotsCreated += persisted.snapshotsCreated;
          claimsProposed += persisted.claimsProposed;
          return {
            pagesRetrieved,
            snapshotsCreated,
            claimsProposed,
            archiveHits,
            liveFallbacks,
            requestsConsumed,
            internalSnapshotHits,
            licensedHits,
          };
        }
        archiveMiss = true;
        await this.deps.runs.addSourceAttempt({
          researchRunId: run.id,
          targetId: target.id,
          sourceKey: archiveSource.sourceKey,
          adapterType: 'archived_web',
          status: 'miss',
          provenance: { order: 3, domain },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.deps.runs.addSourceAttempt({
          researchRunId: run.id,
          targetId: target.id,
          sourceKey: archiveSource.sourceKey,
          adapterType: 'archived_web',
          status: 'blocked',
          errorCode: message,
          provenance: { order: 3 },
        });
        if (!wantsLive || config.mode === 'archive_only') throw error;
        archiveMiss = true;
      }
    } else if (wantsArchive && !archiveSource) {
      archiveMiss = true;
    }

    const mayLive =
      wantsLive &&
      (config.mode === 'live_official_site_only' || archiveMiss || !wantsArchive) &&
      liveSource;

    if (mayLive && liveSource) {
      try {
        const authz = await this.authorizeSourceForRetrieval({
          sourceKey: liveSource.sourceKey,
          run,
          config,
        });
        if (!authz.ok) {
          await this.deps.runs.addSourceAttempt({
            researchRunId: run.id,
            targetId: target.id,
            sourceKey: liveSource.sourceKey,
            adapterType: 'organization_website',
            status: 'blocked',
            errorCode: authz.code,
            provenance: {
              order: 4,
              reason: 'source_authorization_revoked',
              launchPolicyVersion: authz.launchPolicyVersion,
              currentPolicyVersion: authz.currentPolicyVersion,
              launchSourceSnapshot: authz.launchSourceSnapshot,
              currentSourceSnapshot: authz.currentSourceSnapshot,
              requestsOutbound: 0,
            },
          });
          throw new Error(`source_authorization_revoked:${authz.code}`);
        }
        if (Number.isFinite(delayMs) && delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        const live = await this.officialWebsite.retrievePage({
          url: `https://${domain}/`,
          domain,
          source: authz.gate,
          mode: run.mode,
          liveResearchEnabled: this.deps.liveResearchEnabled,
          globalKillSwitchActive: this.deps.globalKillSwitchActive,
          runKillSwitchActive: run.killSwitchActive,
          timeoutMs: 10_000,
          maxBytes: 1_048_576,
        });
        liveFallbacks += 1;
        requestsConsumed += 1;
        pagesRetrieved += 1;
        const persisted = await this.persistRetrievalAsClaims({
          run,
          target,
          domain,
          url: live.finalUrl,
          body: live.body,
          contentType: live.contentType ?? 'text/html',
          httpStatus: live.status,
          redirectChain: live.redirectChain ?? [],
          adapterVersion: 'organization-website-v1',
          sourceKey: liveSource.sourceKey,
          adapterType: 'organization_website',
          provenance: { ...live.provenance, order: 4 },
        });
        snapshotsCreated += persisted.snapshotsCreated;
        claimsProposed += persisted.claimsProposed;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.deps.runs.addSourceAttempt({
          researchRunId: run.id,
          targetId: target.id,
          sourceKey: liveSource.sourceKey,
          adapterType: 'organization_website',
          status: 'blocked',
          errorCode: message,
          provenance: { order: 4 },
        });
        throw error;
      }
    }

    return {
      pagesRetrieved,
      snapshotsCreated,
      claimsProposed,
      archiveHits,
      liveFallbacks,
      requestsConsumed,
      internalSnapshotHits,
      licensedHits,
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
