import { NextResponse } from 'next/server';

import { getWebResearchRuntime } from '@/lib/research-runtime';

/**
 * Test/ops probe for durable queue depth and research-run tables.
 * Never enables live egress.
 */
export async function GET() {
  const runtime = await getWebResearchRuntime();
  if (runtime.provider !== 'postgres' || !runtime.database || !runtime.durableStore) {
    return NextResponse.json({ error: 'postgres_durable_required' }, { status: 400 });
  }
  const durableJobs = await runtime.durableStore.statusCounts();
  const heartbeat = await runtime.durableStore.latestHeartbeat();

  return NextResponse.json({
    jobMode: runtime.jobMode,
    provider: runtime.provider,
    liveResearchEnabled: process.env.ADP_LIVE_RESEARCH_ENABLED ?? 'false',
    durableJobs,
    workerHeartbeat: heartbeat
      ? { workerId: heartbeat.workerId, lastSeenAt: heartbeat.lastSeenAt.toISOString() }
      : null,
  });
}
