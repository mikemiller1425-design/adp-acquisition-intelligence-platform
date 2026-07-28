import { randomUUID } from 'node:crypto';

import {
  researchRunApprovals,
  researchRunCheckpoints,
  researchRunDefinitions,
  researchRunEvents,
  researchRunMetrics,
  researchRuns,
  researchRunSourceAttempts,
  researchRunTargets,
  type RepositoryExecutor,
} from '@adp/database';
import { and, asc, desc, eq } from 'drizzle-orm';

import type {
  ResearchRunRecord,
  ResearchRunRepository,
  ResearchRunTargetRecord,
} from '../application/research-run-service.js';
import type { ResearchRunMode, ResearchRunStatus } from '../domain/research-run.js';

type Db = RepositoryExecutor;

function mapRun(row: typeof researchRuns.$inferSelect): ResearchRunRecord {
  return {
    id: row.id,
    definitionId: row.definitionId,
    status: row.status as ResearchRunStatus,
    mode: row.mode as ResearchRunMode,
    correlationId: row.correlationId,
    idempotencyKey: row.idempotencyKey,
    configSnapshot: (row.configSnapshot ?? {}) as Record<string, unknown>,
    killSwitchActive: row.killSwitchActive,
    targetsTotal: row.targetsTotal,
    targetsCompleted: row.targetsCompleted,
    targetsFailed: row.targetsFailed,
    targetsBlocked: row.targetsBlocked,
    requestsConsumed: row.requestsConsumed,
    archiveHits: row.archiveHits,
    liveFallbacks: row.liveFallbacks,
    pagesRetrieved: row.pagesRetrieved,
    snapshotsCreated: row.snapshotsCreated,
    claimsProposed: row.claimsProposed,
    pauseReason: row.pauseReason ?? null,
    cancelReason: row.cancelReason ?? null,
  };
}

function mapTarget(row: typeof researchRunTargets.$inferSelect): ResearchRunTargetRecord {
  return {
    id: row.id,
    researchRunId: row.researchRunId,
    organizationId: row.organizationId,
    canonicalDomain: row.canonicalDomain ?? null,
    status: row.status,
    checkpoint: (row.checkpoint ?? {}) as Record<string, unknown>,
    lastError: row.lastError ?? null,
  };
}

/** In-memory research-run repository for unit tests and memory provider. */
export class InMemoryResearchRunRepository implements ResearchRunRepository {
  definitions = new Map<string, Record<string, unknown>>();
  runs = new Map<string, ResearchRunRecord & { errorSummary?: Record<string, unknown> }>();
  targets = new Map<string, ResearchRunTargetRecord & { lastError?: string | null }>();
  events: Array<{
    researchRunId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }> = [];
  checkpoints = new Map<string, Record<string, unknown>>();
  sourceAttempts: Array<Record<string, unknown>> = [];
  approvals: Array<{
    researchRunId: string;
    approvalType: string;
    status: string;
    evidence: Record<string, unknown>;
  }> = [];
  metrics: Array<{
    researchRunId: string;
    metricKey: string;
    metricValue: Record<string, unknown>;
  }> = [];

  private checkpointId(runId: string, key: string): string {
    return `${runId}::${key}`;
  }

  async createDefinition(input: {
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
  }): Promise<{ id: string }> {
    this.definitions.set(input.id, { ...input });
    return { id: input.id };
  }

  async createRun(
    input: Omit<ResearchRunRecord, 'pauseReason' | 'cancelReason'> & {
      pauseReason?: string | null;
      cancelReason?: string | null;
      approvalEvidence?: Record<string, unknown>;
    },
  ): Promise<ResearchRunRecord> {
    const record: ResearchRunRecord = {
      id: input.id,
      definitionId: input.definitionId,
      status: input.status,
      mode: input.mode,
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      configSnapshot: { ...input.configSnapshot },
      killSwitchActive: input.killSwitchActive,
      targetsTotal: input.targetsTotal,
      targetsCompleted: input.targetsCompleted,
      targetsFailed: input.targetsFailed,
      targetsBlocked: input.targetsBlocked,
      requestsConsumed: input.requestsConsumed,
      archiveHits: input.archiveHits,
      liveFallbacks: input.liveFallbacks,
      pagesRetrieved: input.pagesRetrieved,
      snapshotsCreated: input.snapshotsCreated,
      claimsProposed: input.claimsProposed,
      pauseReason: input.pauseReason ?? null,
      cancelReason: input.cancelReason ?? null,
    };
    this.runs.set(record.id, record);
    return { ...record };
  }

  async getRun(id: string): Promise<ResearchRunRecord | null> {
    const row = this.runs.get(id);
    return row ? { ...row } : null;
  }

  async listRuns(): Promise<ResearchRunRecord[]> {
    return [...this.runs.values()].map((r) => ({ ...r }));
  }

  async updateRun(
    id: string,
    patch: Partial<ResearchRunRecord> & { errorSummary?: Record<string, unknown> },
  ): Promise<ResearchRunRecord> {
    const existing = this.runs.get(id);
    if (!existing) throw new Error('research_run_not_found');
    const updated = { ...existing, ...patch };
    this.runs.set(id, updated);
    return { ...updated };
  }

  async addTargets(
    targets: Array<{
      id: string;
      researchRunId: string;
      organizationId: string;
      canonicalDomain: string | null;
      status: string;
    }>,
  ): Promise<void> {
    for (const t of targets) {
      this.targets.set(t.id, {
        id: t.id,
        researchRunId: t.researchRunId,
        organizationId: t.organizationId,
        canonicalDomain: t.canonicalDomain,
        status: t.status,
        checkpoint: {},
      });
    }
  }

  async listTargets(runId: string): Promise<ResearchRunTargetRecord[]> {
    return [...this.targets.values()]
      .filter((t) => t.researchRunId === runId)
      .map((t) => ({ ...t }));
  }

  async updateTarget(
    id: string,
    patch: Partial<ResearchRunTargetRecord> & { lastError?: string | null },
  ): Promise<void> {
    const existing = this.targets.get(id);
    if (!existing) throw new Error('research_run_target_not_found');
    this.targets.set(id, { ...existing, ...patch });
  }

  async addEvent(
    runId: string,
    eventType: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    this.events.push({ researchRunId: runId, eventType, payload: { ...payload } });
  }

  async listEvents(
    runId: string,
  ): Promise<Array<{ eventType: string; payload: Record<string, unknown> }>> {
    return this.events
      .filter((e) => e.researchRunId === runId)
      .map((e) => ({ eventType: e.eventType, payload: { ...e.payload } }));
  }

  async upsertCheckpoint(
    runId: string,
    checkpointKey: string,
    payload: Record<string, unknown>,
    _targetId?: string,
  ): Promise<void> {
    this.checkpoints.set(this.checkpointId(runId, checkpointKey), { ...payload });
  }

  async getCheckpoint(
    runId: string,
    checkpointKey: string,
  ): Promise<Record<string, unknown> | null> {
    const row = this.checkpoints.get(this.checkpointId(runId, checkpointKey));
    return row ? { ...row } : null;
  }

  async addSourceAttempt(input: {
    researchRunId: string;
    targetId: string;
    sourceKey: string;
    adapterType: string;
    status: string;
    requestedUrl?: string;
    provenance?: Record<string, unknown>;
    contentHash?: string;
    errorCode?: string;
  }): Promise<void> {
    this.sourceAttempts.push({ id: randomUUID(), ...input });
  }

  async addApproval(input: {
    researchRunId: string;
    approvalType: string;
    status: string;
    evidence?: Record<string, unknown>;
  }): Promise<void> {
    this.approvals.push({
      researchRunId: input.researchRunId,
      approvalType: input.approvalType,
      status: input.status,
      evidence: { ...(input.evidence ?? {}) },
    });
  }

  async listApprovals(
    runId: string,
  ): Promise<Array<{ approvalType: string; status: string; evidence: Record<string, unknown> }>> {
    return this.approvals
      .filter((a) => a.researchRunId === runId)
      .map((a) => ({
        approvalType: a.approvalType,
        status: a.status,
        evidence: { ...a.evidence },
      }));
  }

  async recordMetric(
    runId: string,
    metricKey: string,
    metricValue: Record<string, unknown>,
  ): Promise<void> {
    this.metrics.push({ researchRunId: runId, metricKey, metricValue: { ...metricValue } });
  }

  async listMetrics(
    runId: string,
  ): Promise<Array<{ metricKey: string; metricValue: Record<string, unknown> }>> {
    return this.metrics
      .filter((m) => m.researchRunId === runId)
      .map((m) => ({ metricKey: m.metricKey, metricValue: { ...m.metricValue } }));
  }
}

/** Postgres-backed research-run repository (drizzle). */
export class PostgresResearchRunRepository implements ResearchRunRepository {
  constructor(private readonly db: Db) {}

  async createDefinition(input: {
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
  }): Promise<{ id: string }> {
    await this.db.insert(researchRunDefinitions).values({
      id: input.id,
      name: input.name,
      objective: input.objective,
      mode: input.mode,
      configSnapshot: input.configSnapshot,
      targetQuerySnapshot: input.targetQuerySnapshot,
      sourceKeys: input.sourceKeys,
      maxOrganizations: input.maxOrganizations,
      maxPagesPerOrganization: input.maxPagesPerOrganization,
      maxTotalRequests: input.maxTotalRequests,
      archiveFirst: input.archiveFirst,
      liveFallback: input.liveFallback,
      dryRun: input.dryRun,
      freshnessThresholdHours: input.freshnessThresholdHours,
    });
    return { id: input.id };
  }

  async createRun(
    input: Omit<ResearchRunRecord, 'pauseReason' | 'cancelReason'> & {
      pauseReason?: string | null;
      cancelReason?: string | null;
      approvalEvidence?: Record<string, unknown>;
    },
  ): Promise<ResearchRunRecord> {
    const [row] = await this.db
      .insert(researchRuns)
      .values({
        id: input.id,
        definitionId: input.definitionId,
        status: input.status,
        mode: input.mode,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        configSnapshot: input.configSnapshot,
        killSwitchActive: input.killSwitchActive,
        targetsTotal: input.targetsTotal,
        targetsCompleted: input.targetsCompleted,
        targetsFailed: input.targetsFailed,
        targetsBlocked: input.targetsBlocked,
        requestsConsumed: input.requestsConsumed,
        archiveHits: input.archiveHits,
        liveFallbacks: input.liveFallbacks,
        pagesRetrieved: input.pagesRetrieved,
        snapshotsCreated: input.snapshotsCreated,
        claimsProposed: input.claimsProposed,
        pauseReason: input.pauseReason ?? null,
        cancelReason: input.cancelReason ?? null,
        approvalEvidence: input.approvalEvidence ?? {},
      })
      .returning();
    if (!row) throw new Error('research_run_insert_failed');
    return mapRun(row);
  }

  async getRun(id: string): Promise<ResearchRunRecord | null> {
    const rows = await this.db.select().from(researchRuns).where(eq(researchRuns.id, id)).limit(1);
    return rows[0] ? mapRun(rows[0]) : null;
  }

  async listRuns(): Promise<ResearchRunRecord[]> {
    const rows = await this.db.select().from(researchRuns).orderBy(desc(researchRuns.createdAt));
    return rows.map(mapRun);
  }

  async updateRun(
    id: string,
    patch: Partial<ResearchRunRecord> & { errorSummary?: Record<string, unknown> },
  ): Promise<ResearchRunRecord> {
    const set: Partial<typeof researchRuns.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.mode !== undefined) set.mode = patch.mode;
    if (patch.configSnapshot !== undefined) set.configSnapshot = patch.configSnapshot;
    if (patch.killSwitchActive !== undefined) set.killSwitchActive = patch.killSwitchActive;
    if (patch.targetsTotal !== undefined) set.targetsTotal = patch.targetsTotal;
    if (patch.targetsCompleted !== undefined) set.targetsCompleted = patch.targetsCompleted;
    if (patch.targetsFailed !== undefined) set.targetsFailed = patch.targetsFailed;
    if (patch.targetsBlocked !== undefined) set.targetsBlocked = patch.targetsBlocked;
    if (patch.requestsConsumed !== undefined) set.requestsConsumed = patch.requestsConsumed;
    if (patch.archiveHits !== undefined) set.archiveHits = patch.archiveHits;
    if (patch.liveFallbacks !== undefined) set.liveFallbacks = patch.liveFallbacks;
    if (patch.pagesRetrieved !== undefined) set.pagesRetrieved = patch.pagesRetrieved;
    if (patch.snapshotsCreated !== undefined) set.snapshotsCreated = patch.snapshotsCreated;
    if (patch.claimsProposed !== undefined) set.claimsProposed = patch.claimsProposed;
    if (patch.pauseReason !== undefined) set.pauseReason = patch.pauseReason;
    if (patch.cancelReason !== undefined) set.cancelReason = patch.cancelReason;
    if (patch.errorSummary !== undefined) set.errorSummary = patch.errorSummary;
    if (patch.status === 'running') set.startedAt = new Date();
    if (patch.status === 'completed' || patch.status === 'failed' || patch.status === 'blocked') {
      set.completedAt = new Date();
    }
    if (patch.status === 'paused') set.pausedAt = new Date();
    if (patch.status === 'cancelled') set.cancelledAt = new Date();

    const [row] = await this.db
      .update(researchRuns)
      .set(set)
      .where(eq(researchRuns.id, id))
      .returning();
    if (!row) throw new Error('research_run_not_found');
    return mapRun(row);
  }

  async addTargets(
    targets: Array<{
      id: string;
      researchRunId: string;
      organizationId: string;
      canonicalDomain: string | null;
      status: string;
    }>,
  ): Promise<void> {
    if (!targets.length) return;
    await this.db.insert(researchRunTargets).values(
      targets.map((t) => ({
        id: t.id,
        researchRunId: t.researchRunId,
        organizationId: t.organizationId,
        canonicalDomain: t.canonicalDomain,
        status: t.status as typeof researchRunTargets.$inferInsert.status,
        checkpoint: {},
      })),
    );
  }

  async listTargets(runId: string): Promise<ResearchRunTargetRecord[]> {
    const rows = await this.db
      .select()
      .from(researchRunTargets)
      .where(eq(researchRunTargets.researchRunId, runId))
      .orderBy(asc(researchRunTargets.createdAt));
    return rows.map(mapTarget);
  }

  async updateTarget(
    id: string,
    patch: Partial<ResearchRunTargetRecord> & { lastError?: string | null },
  ): Promise<void> {
    const set: Partial<typeof researchRunTargets.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (patch.status !== undefined) {
      set.status = patch.status as typeof researchRunTargets.$inferInsert.status;
    }
    if (patch.checkpoint !== undefined) set.checkpoint = patch.checkpoint;
    if (patch.canonicalDomain !== undefined) set.canonicalDomain = patch.canonicalDomain;
    if (patch.lastError !== undefined) set.lastError = patch.lastError;
    if (patch.status === 'succeeded' || patch.status === 'failed' || patch.status === 'blocked') {
      set.completedAt = new Date();
    }
    await this.db.update(researchRunTargets).set(set).where(eq(researchRunTargets.id, id));
  }

  async addEvent(
    runId: string,
    eventType: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await this.db.insert(researchRunEvents).values({
      researchRunId: runId,
      eventType,
      payload,
    });
  }

  async listEvents(
    runId: string,
  ): Promise<Array<{ eventType: string; payload: Record<string, unknown> }>> {
    const rows = await this.db
      .select()
      .from(researchRunEvents)
      .where(eq(researchRunEvents.researchRunId, runId))
      .orderBy(asc(researchRunEvents.createdAt));
    return rows.map((r) => ({
      eventType: r.eventType,
      payload: (r.payload ?? {}) as Record<string, unknown>,
    }));
  }

  async upsertCheckpoint(
    runId: string,
    checkpointKey: string,
    payload: Record<string, unknown>,
    targetId?: string,
  ): Promise<void> {
    await this.db
      .insert(researchRunCheckpoints)
      .values({
        researchRunId: runId,
        checkpointKey,
        checkpointPayload: payload,
        targetId: targetId ?? null,
      })
      .onConflictDoUpdate({
        target: [researchRunCheckpoints.researchRunId, researchRunCheckpoints.checkpointKey],
        set: { checkpointPayload: payload, targetId: targetId ?? null },
      });
  }

  async getCheckpoint(
    runId: string,
    checkpointKey: string,
  ): Promise<Record<string, unknown> | null> {
    const rows = await this.db
      .select()
      .from(researchRunCheckpoints)
      .where(
        and(
          eq(researchRunCheckpoints.researchRunId, runId),
          eq(researchRunCheckpoints.checkpointKey, checkpointKey),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? ((row.checkpointPayload ?? {}) as Record<string, unknown>) : null;
  }

  async addSourceAttempt(input: {
    researchRunId: string;
    targetId: string;
    sourceKey: string;
    adapterType: string;
    status: string;
    requestedUrl?: string;
    provenance?: Record<string, unknown>;
    contentHash?: string;
    errorCode?: string;
  }): Promise<void> {
    await this.db.insert(researchRunSourceAttempts).values({
      researchRunId: input.researchRunId,
      targetId: input.targetId,
      sourceKey: input.sourceKey,
      adapterType: input.adapterType,
      status: input.status,
      requestedUrl: input.requestedUrl ?? null,
      provenance: input.provenance ?? {},
      contentHash: input.contentHash ?? null,
      errorCode: input.errorCode ?? null,
      startedAt: new Date(),
      completedAt: new Date(),
    });
  }

  async addApproval(input: {
    researchRunId: string;
    approvalType: string;
    status: string;
    evidence?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(researchRunApprovals).values({
      researchRunId: input.researchRunId,
      approvalType: input.approvalType,
      status: input.status,
      evidence: input.evidence ?? {},
      decidedAt: input.status === 'pending' ? null : new Date(),
    });
  }

  async listApprovals(
    runId: string,
  ): Promise<Array<{ approvalType: string; status: string; evidence: Record<string, unknown> }>> {
    const rows = await this.db
      .select()
      .from(researchRunApprovals)
      .where(eq(researchRunApprovals.researchRunId, runId))
      .orderBy(asc(researchRunApprovals.createdAt));
    return rows.map((r) => ({
      approvalType: r.approvalType,
      status: r.status,
      evidence: (r.evidence ?? {}) as Record<string, unknown>,
    }));
  }

  async recordMetric(
    runId: string,
    metricKey: string,
    metricValue: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(researchRunMetrics).values({
      researchRunId: runId,
      metricKey,
      metricValue,
    });
  }

  async listMetrics(
    runId: string,
  ): Promise<Array<{ metricKey: string; metricValue: Record<string, unknown> }>> {
    const rows = await this.db
      .select()
      .from(researchRunMetrics)
      .where(eq(researchRunMetrics.researchRunId, runId))
      .orderBy(asc(researchRunMetrics.recordedAt));
    return rows.map((r) => ({
      metricKey: r.metricKey,
      metricValue: (r.metricValue ?? {}) as Record<string, unknown>,
    }));
  }
}
