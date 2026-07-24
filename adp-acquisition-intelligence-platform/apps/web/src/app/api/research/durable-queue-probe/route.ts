import { NextResponse } from 'next/server';

import { getWebResearchRuntime } from '@/lib/research-runtime';
import { durableJobs } from '@adp/database';
import { count, eq } from 'drizzle-orm';

/**
 * Test/ops probe for durable queue depth and research-run tables.
 * Never enables live egress.
 */
export async function GET() {
  const runtime = await getWebResearchRuntime();
  if (runtime.provider !== 'postgres' || !runtime.database) {
    return NextResponse.json({ error: 'postgres_required' }, { status: 400 });
  }
  const db = runtime.database.db;
  const [queued] = await db
    .select({ value: count() })
    .from(durableJobs)
    .where(eq(durableJobs.status, 'queued'));
  const [running] = await db
    .select({ value: count() })
    .from(durableJobs)
    .where(eq(durableJobs.status, 'running'));
  const [completed] = await db
    .select({ value: count() })
    .from(durableJobs)
    .where(eq(durableJobs.status, 'completed'));
  const [dead] = await db
    .select({ value: count() })
    .from(durableJobs)
    .where(eq(durableJobs.status, 'dead'));
  const heartbeat = runtime.durableStore
    ? await runtime.durableStore.latestHeartbeat()
    : null;

  return NextResponse.json({
    jobMode: runtime.jobMode,
    provider: runtime.provider,
    liveResearchEnabled: process.env.ADP_LIVE_RESEARCH_ENABLED ?? 'false',
    durableJobs: {
      queued: Number(queued?.value ?? 0),
      running: Number(running?.value ?? 0),
      completed: Number(completed?.value ?? 0),
      dead: Number(dead?.value ?? 0),
    },
    workerHeartbeat: heartbeat
      ? { workerId: heartbeat.workerId, lastSeenAt: heartbeat.lastSeenAt.toISOString() }
      : null,
  });
}
