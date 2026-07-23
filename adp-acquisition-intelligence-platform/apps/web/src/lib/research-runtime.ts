import { InMemoryJobDispatcher, type JobEnvelope, type JobHandler } from '@adp/platform';
import {
  createResearchRuntime,
  FixtureRetrievalPort,
  FIXTURE_POPULATION_SOURCE_ID,
  getMemoryResearchWorkflowSnapshot,
  getPersistenceProbe,
  getPostgresResearchWorkflowSnapshot,
  registerResearchJobHandlers,
  seedFixtureApprovedSource,
  TargetedCollectionService,
  type ResearchRuntime,
  type ResearchWorkflowSnapshot,
} from '@adp/research';

const FIXTURE_HTML = `<!doctype html><html><body>
<script type="application/ld+json">{"@type":"Organization","name":"Acme Advisory"}</script>
<p>We offer payroll and bookkeeping services for accounting firms.</p>
<p>Client accounting services and fractional CFO available.</p>
</body></html>`;

const FIXTURE_PAGES: Record<string, { body: string }> = {
  'https://acme-advisory.test/': { body: FIXTURE_HTML },
  'https://acme-advisory.test/about': { body: FIXTURE_HTML },
  'https://acme-advisory.test/services': { body: FIXTURE_HTML },
  'https://beta-advisory.test/': { body: FIXTURE_HTML },
  'https://beta-advisory.test/about': { body: FIXTURE_HTML },
  'https://beta-advisory.test/services': { body: FIXTURE_HTML },
};

/**
 * Defers research.run.execute so pause/resume can interleave between targets.
 * Other research jobs still run inline (Phase 1.1 fixture workflow).
 */
export class DeferredResearchExecuteDispatcher extends InMemoryJobDispatcher {
  private readonly deferred: Array<JobEnvelope & { jobId: string }> = [];
  private seq = 0;

  override async enqueue(job: JobEnvelope): Promise<{ jobId: string }> {
    if (job.name === 'research.run.execute') {
      this.seq += 1;
      const jobId = `deferred_research_${this.seq}`;
      this.deferred.push({ ...job, jobId });
      this.jobs.push({ ...job, jobId });
      return { jobId };
    }
    return super.enqueue(job);
  }

  pendingResearchExecuteCount(): number {
    return this.deferred.length;
  }

  async processNextResearchExecute(): Promise<boolean> {
    const next = this.deferred.shift();
    if (!next) return false;
    const handler = this.get(next.name) as JobHandler | undefined;
    if (!handler) return false;
    await handler(next);
    return true;
  }

  async drainResearchExecute(max = 50): Promise<number> {
    let n = 0;
    while (n < max && (await this.processNextResearchExecute())) n += 1;
    return n;
  }
}

export type WebResearchRuntime = ResearchRuntime & {
  jobs: DeferredResearchExecuteDispatcher;
};

declare global {
  var __adpResearchRuntime: WebResearchRuntime | undefined;
}

function attachFixtureRetrieval(runtime: ResearchRuntime): void {
  const retrieval = new FixtureRetrievalPort(FIXTURE_PAGES);
  (runtime as unknown as { retrieval: FixtureRetrievalPort }).retrieval = retrieval;
  (runtime as unknown as { collection: TargetedCollectionService }).collection =
    new TargetedCollectionService(
      retrieval,
      runtime.uow.claims,
      runtime.uow.snapshots,
      runtime.uow.extractionRuns,
      runtime.uow.collectionAttempts,
      runtime.uow.collectionRuns,
      runtime.uow.approvedSources,
      runtime.uow.rateLimits,
      runtime.uow.concurrency,
      runtime.uow.outbox,
    );
}

/**
 * Process-scoped research runtime for the web app.
 * Honors ADP_RESEARCH_PROVIDER=memory|postgres.
 * Live network remains gated by ADP_LIVE_RESEARCH_ENABLED (default false).
 * Job handlers are the same registerResearchJobHandlers used by apps/worker.
 */
export async function getWebResearchRuntime(): Promise<WebResearchRuntime> {
  if (globalThis.__adpResearchRuntime) return globalThis.__adpResearchRuntime;

  const base = createResearchRuntime(process.env);
  attachFixtureRetrieval(base);
  await seedFixtureApprovedSource(base.uow, base.database?.db ?? null);

  const jobs = new DeferredResearchExecuteDispatcher();
  registerResearchJobHandlers(jobs, base);

  const runtime: WebResearchRuntime = { ...base, jobs };
  globalThis.__adpResearchRuntime = runtime;
  return runtime;
}

export function resetWebResearchRuntimeForTests() {
  const existing = globalThis.__adpResearchRuntime;
  if (existing?.database) {
    void existing.database.close().catch(() => undefined);
  }
  globalThis.__adpResearchRuntime = undefined;
}

export function getFixturePopulationSourceId(provider: 'memory' | 'postgres'): string {
  return provider === 'postgres' ? FIXTURE_POPULATION_SOURCE_ID : 'ps-fixture-1';
}

export async function getResearchWorkflowSnapshot(
  runtime?: WebResearchRuntime,
): Promise<ResearchWorkflowSnapshot> {
  const rt = runtime ?? (await getWebResearchRuntime());
  if (rt.provider === 'postgres' && rt.database) {
    return getPostgresResearchWorkflowSnapshot(rt.database.db);
  }
  return getMemoryResearchWorkflowSnapshot(rt.uow);
}

export async function getResearchPersistenceProbe() {
  const rt = await getWebResearchRuntime();
  if (rt.provider !== 'postgres' || !rt.database) {
    throw new Error('persistence_probe_requires_postgres');
  }
  return getPersistenceProbe(rt.database.db);
}

/**
 * Drain outbox-driven recalculation into the shared worker job boundary.
 * Claim accept only writes the outbox event; this mirrors worker outbox dispatch.
 */
export async function drainRecalculationOutbox(runtime?: WebResearchRuntime): Promise<number> {
  const rt = runtime ?? (await getWebResearchRuntime());
  const snapshot = await getResearchWorkflowSnapshot(rt);
  let drained = 0;
  for (const eventType of snapshot.outboxEventTypes) {
    if (eventType !== 'intelligence.recalculation_requested') continue;
  }
  for (const claim of snapshot.claims) {
    if (claim.reviewStatus !== 'accepted' && claim.reviewStatus !== 'accepted_corrected') continue;
    await rt.jobs.enqueue({
      name: 'intelligence.recalculation.requested',
      idempotencyKey: `drain:intelligence.recalculation_requested:${claim.id}`,
      payload: {
        organizationId: claim.organizationId,
        reason: `claim_${claim.reviewStatus}:${claim.id}`,
      },
    });
    drained += 1;
  }
  return drained;
}

export type { ResearchWorkflowSnapshot };
