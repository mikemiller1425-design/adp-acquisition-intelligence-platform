import { durableJobs, workerHeartbeats, type RepositoryExecutor } from '@adp/database';
import { and, asc, count, eq, lte, or, sql } from 'drizzle-orm';
import type { DurableJobRecord, DurableJobStore } from '@adp/platform';

type Db = RepositoryExecutor;

export class PostgresDurableJobStore implements DurableJobStore {
  constructor(private readonly db: Db) {}

  async enqueue(job: {
    id: string;
    name: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
    correlationId?: string;
  }): Promise<{ jobId: string; replayed: boolean }> {
    if (job.idempotencyKey) {
      const existing = await this.db
        .select({ id: durableJobs.id })
        .from(durableJobs)
        .where(eq(durableJobs.idempotencyKey, job.idempotencyKey))
        .limit(1);
      if (existing[0]) return { jobId: existing[0].id, replayed: true };
    }
    await this.db.insert(durableJobs).values({
      id: job.id,
      name: job.name,
      payload: job.payload,
      idempotencyKey: job.idempotencyKey ?? null,
      correlationId: job.correlationId ?? null,
      status: 'queued',
    });
    return { jobId: job.id, replayed: false };
  }

  async claim(workerId: string): Promise<DurableJobRecord | null> {
    const nowIso = new Date().toISOString();
    const rows = await this.db.execute(sql`
      UPDATE durable_jobs
      SET status = 'running',
          attempts = attempts + 1,
          locked_at = ${nowIso}::timestamptz,
          locked_by = ${workerId},
          updated_at = ${nowIso}::timestamptz
      WHERE id = (
        SELECT id FROM durable_jobs
        WHERE status = 'queued' AND available_at <= ${nowIso}::timestamptz
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, name, payload, idempotency_key, correlation_id, status, attempts, max_attempts, last_error
    `);
    const row =
      (rows as unknown as { rows?: Record<string, unknown>[] }).rows?.[0] ??
      (Array.isArray(rows) ? (rows as Record<string, unknown>[])[0] : null);
    if (!row) return null;
    return {
      id: String(row.id),
      name: String(row.name),
      payload: (row.payload ?? {}) as Record<string, unknown>,
      idempotencyKey: (row.idempotency_key as string | null) ?? null,
      correlationId: (row.correlation_id as string | null) ?? null,
      status: 'running',
      attempts: Number(row.attempts ?? 1),
      maxAttempts: Number(row.max_attempts ?? 5),
      lastError: (row.last_error as string | null) ?? null,
    };
  }

  async complete(jobId: string): Promise<void> {
    await this.db
      .update(durableJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      })
      .where(eq(durableJobs.id, jobId));
  }

  async fail(jobId: string, error: string, retryDelayMs?: number): Promise<void> {
    const current = await this.db
      .select()
      .from(durableJobs)
      .where(eq(durableJobs.id, jobId))
      .limit(1);
    const job = current[0];
    if (!job) return;
    const attempts = job.attempts;
    const dead = attempts >= job.maxAttempts || retryDelayMs === undefined;
    await this.db
      .update(durableJobs)
      .set({
        status: dead ? 'dead' : 'queued',
        lastError: error,
        availableAt: dead ? new Date() : new Date(Date.now() + (retryDelayMs ?? 0)),
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
        completedAt: dead ? new Date() : null,
      })
      .where(eq(durableJobs.id, jobId));
  }

  async depth(): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(durableJobs)
      .where(or(eq(durableJobs.status, 'queued'), eq(durableJobs.status, 'running')));
    return Number(row?.value ?? 0);
  }

  async statusCounts(): Promise<{
    queued: number;
    running: number;
    completed: number;
    dead: number;
  }> {
    const statuses = ['queued', 'running', 'completed', 'dead'] as const;
    const out = { queued: 0, running: 0, completed: 0, dead: 0 };
    for (const status of statuses) {
      const [row] = await this.db
        .select({ value: count() })
        .from(durableJobs)
        .where(eq(durableJobs.status, status));
      out[status] = Number(row?.value ?? 0);
    }
    return out;
  }

  async heartbeat(workerId: string, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.db
      .insert(workerHeartbeats)
      .values({
        workerId,
        lastSeenAt: new Date(),
        metadata,
      })
      .onConflictDoUpdate({
        target: workerHeartbeats.workerId,
        set: { lastSeenAt: new Date(), metadata },
      });
  }

  async latestHeartbeat(): Promise<{ workerId: string; lastSeenAt: Date } | null> {
    const rows = await this.db
      .select()
      .from(workerHeartbeats)
      .orderBy(sql`${workerHeartbeats.lastSeenAt} desc`)
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { workerId: row.workerId, lastSeenAt: row.lastSeenAt };
  }

  async reclaimExpiredLeases(input: { leaseMs: number }): Promise<number> {
    const cutoffIso = new Date(Date.now() - Math.max(1_000, input.leaseMs)).toISOString();
    const nowIso = new Date().toISOString();
    const rows = await this.db.execute(sql`
      UPDATE durable_jobs
      SET status = 'queued',
          locked_at = NULL,
          locked_by = NULL,
          available_at = ${nowIso}::timestamptz,
          updated_at = ${nowIso}::timestamptz,
          last_error = coalesce(last_error, 'lease_expired')
      WHERE status = 'running'
        AND locked_at IS NOT NULL
        AND locked_at < ${cutoffIso}::timestamptz
      RETURNING id
    `);
    const returned =
      (rows as unknown as { rows?: unknown[] }).rows ??
      (Array.isArray(rows) ? (rows as unknown[]) : []);
    return returned.length;
  }

  async listJobs(limit = 50): Promise<
    Array<{
      id: string;
      name: string;
      status: string;
      attempts: number;
      lockedBy: string | null;
      lockedAt: string | null;
      lastError: string | null;
      payload: Record<string, unknown>;
    }>
  > {
    const rows = await this.db
      .select()
      .from(durableJobs)
      .orderBy(sql`${durableJobs.createdAt} desc`)
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      attempts: r.attempts,
      lockedBy: r.lockedBy,
      lockedAt: r.lockedAt ? r.lockedAt.toISOString() : null,
      lastError: r.lastError,
      payload: r.payload ?? {},
    }));
  }
}

/** In-memory durable store for unit tests (survives dispatcher rebuild within process). */
export class InMemoryDurableJobStore implements DurableJobStore {
  readonly jobs = new Map<
    string,
    DurableJobRecord & { availableAt: number; maxAttempts: number }
  >();
  private heartbeats = new Map<string, Date>();

  async enqueue(job: {
    id: string;
    name: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
    correlationId?: string;
  }): Promise<{ jobId: string; replayed: boolean }> {
    if (job.idempotencyKey) {
      for (const existing of this.jobs.values()) {
        if (existing.idempotencyKey === job.idempotencyKey) {
          return { jobId: existing.id, replayed: true };
        }
      }
    }
    this.jobs.set(job.id, {
      id: job.id,
      name: job.name,
      payload: job.payload,
      idempotencyKey: job.idempotencyKey ?? null,
      correlationId: job.correlationId ?? null,
      status: 'queued',
      attempts: 0,
      maxAttempts: 5,
      lastError: null,
      availableAt: Date.now(),
    });
    return { jobId: job.id, replayed: false };
  }

  async claim(workerId: string): Promise<DurableJobRecord | null> {
    void workerId;
    const now = Date.now();
    for (const job of this.jobs.values()) {
      if (job.status === 'queued' && job.availableAt <= now) {
        job.status = 'running';
        job.attempts += 1;
        (job as { lockedAtMs?: number }).lockedAtMs = now;
        return { ...job };
      }
    }
    return null;
  }

  async complete(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) job.status = 'completed';
  }

  async fail(jobId: string, error: string, retryDelayMs?: number): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.lastError = error;
    if (retryDelayMs === undefined || job.attempts >= job.maxAttempts) {
      job.status = 'dead';
    } else {
      job.status = 'queued';
      job.availableAt = Date.now() + retryDelayMs;
    }
  }

  async depth(): Promise<number> {
    return [...this.jobs.values()].filter((j) => j.status === 'queued' || j.status === 'running')
      .length;
  }

  async heartbeat(workerId: string): Promise<void> {
    this.heartbeats.set(workerId, new Date());
  }

  async latestHeartbeat(): Promise<{ workerId: string; lastSeenAt: Date } | null> {
    const entries = [...this.heartbeats.entries()];
    if (!entries.length) return null;
    entries.sort((a, b) => b[1].getTime() - a[1].getTime());
    const [workerId, lastSeenAt] = entries[0]!;
    return { workerId, lastSeenAt };
  }

  async reclaimExpiredLeases(input: { leaseMs: number }): Promise<number> {
    const cutoff = Date.now() - Math.max(1_000, input.leaseMs);
    let n = 0;
    for (const job of this.jobs.values()) {
      const lockedAt = (job as { lockedAtMs?: number }).lockedAtMs;
      if (job.status === 'running' && typeof lockedAt === 'number' && lockedAt < cutoff) {
        job.status = 'queued';
        job.availableAt = Date.now();
        job.lastError = job.lastError ?? 'lease_expired';
        n += 1;
      }
    }
    return n;
  }
}

// silence unused import warnings for drizzle helpers kept for future filters
void and;
void asc;
void lte;
