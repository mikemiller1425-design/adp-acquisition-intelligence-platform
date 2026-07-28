import { NextResponse } from 'next/server';

import { getWebResearchRuntime } from '@/lib/research-runtime';

/**
 * Test/ops probe for durable queue depth and optional research-run rows.
 * Never enables live egress.
 */
export async function GET(request: Request) {
  const runtime = await getWebResearchRuntime();
  if (runtime.provider !== 'postgres' || !runtime.database || !runtime.durableStore) {
    return NextResponse.json({ error: 'postgres_durable_required' }, { status: 400 });
  }
  const durableJobs = await runtime.durableStore.statusCounts();
  const heartbeat = await runtime.durableStore.latestHeartbeat();
  const jobs = await runtime.durableStore.listJobs(20);
  const url = new URL(request.url);
  const runId = url.searchParams.get('runId');

  let researchRun: Record<string, unknown> | null = null;
  if (runId) {
    const run = await runtime.researchRuns.getRun(runId);
    const targets = run ? await runtime.researchRuns.listTargets(runId) : [];
    researchRun = run
      ? {
          id: run.id,
          status: run.status,
          snapshotsCreated: run.snapshotsCreated,
          targetsCompleted: run.targetsCompleted,
          targetsBlocked: run.targetsBlocked,
          targetsFailed: run.targetsFailed,
          requestsConsumed: run.requestsConsumed,
          pagesRetrieved: run.pagesRetrieved,
          targets: targets.map((t) => ({
            id: t.id,
            organizationId: t.organizationId,
            status: t.status,
            lastError: t.lastError ?? null,
            checkpoint: t.checkpoint ?? null,
          })),
        }
      : null;
  }

  return NextResponse.json({
    jobMode: runtime.jobMode,
    provider: runtime.provider,
    liveResearchEnabled: process.env.ADP_LIVE_RESEARCH_ENABLED ?? 'false',
    durableJobs,
    jobs,
    workerHeartbeat: heartbeat
      ? { workerId: heartbeat.workerId, lastSeenAt: heartbeat.lastSeenAt.toISOString() }
      : null,
    researchRun,
  });
}
