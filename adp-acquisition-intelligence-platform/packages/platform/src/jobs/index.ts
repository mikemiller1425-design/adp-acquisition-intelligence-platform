export type JobPayload = Record<string, unknown>;

export type JobEnvelope = {
  name: string;
  payload: JobPayload;
  idempotencyKey?: string;
  correlationId?: string;
};

export type JobHandler = (job: JobEnvelope) => Promise<void>;

export type JobDispatcherPort = {
  /**
   * Durable job dispatch seam. ADR-006: PostgreSQL-backed queue with transactional-outbox compatibility.
   */
  enqueue(job: JobEnvelope): Promise<{ jobId: string }>;
};

export type JobHandlerRegistryPort = {
  register(name: string, handler: JobHandler): void;
  get(name: string): JobHandler | undefined;
};

export class InMemoryJobDispatcher implements JobDispatcherPort, JobHandlerRegistryPort {
  private readonly handlers = new Map<string, JobHandler>();
  private sequence = 0;
  readonly jobs: Array<JobEnvelope & { jobId: string }> = [];

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  get(name: string): JobHandler | undefined {
    return this.handlers.get(name);
  }

  async enqueue(job: JobEnvelope): Promise<{ jobId: string }> {
    this.sequence += 1;
    const jobId = `job_${this.sequence}`;
    this.jobs.push({ ...job, jobId });
    const handler = this.handlers.get(job.name);
    if (handler) {
      await handler(job);
    }
    return { jobId };
  }
}

export type DurableJobRecord = {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  idempotencyKey: string | null;
  correlationId: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'dead' | 'cancelled';
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
};

export type DurableJobStore = {
  enqueue(job: {
    id: string;
    name: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
    correlationId?: string;
  }): Promise<{ jobId: string; replayed: boolean }>;
  claim(workerId: string): Promise<DurableJobRecord | null>;
  complete(jobId: string): Promise<void>;
  fail(jobId: string, error: string, retryDelayMs?: number): Promise<void>;
  depth(): Promise<number>;
  heartbeat(workerId: string, metadata?: Record<string, unknown>): Promise<void>;
  latestHeartbeat(): Promise<{ workerId: string; lastSeenAt: Date } | null>;
  /**
   * Requeue running jobs whose lease expired (abandoned worker).
   * Returns number of jobs reclaimed.
   */
  reclaimExpiredLeases?(input: { leaseMs: number }): Promise<number>;
};

/**
 * ADR-006 durable queue: enqueue persists first; workers claim with SKIP LOCKED.
 * processInline drains after enqueue (fixture tests only) — state still survives restart.
 */
export class DurableJobDispatcher implements JobDispatcherPort, JobHandlerRegistryPort {
  private readonly handlers = new Map<string, JobHandler>();
  readonly processed: string[] = [];

  constructor(
    private readonly store: DurableJobStore,
    private readonly options: {
      processInline?: boolean;
      workerId?: string;
      /** Visibility/lease timeout for reclaiming abandoned running jobs. */
      leaseMs?: number;
    } = {},
  ) {}

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  get(name: string): JobHandler | undefined {
    return this.handlers.get(name);
  }

  async enqueue(job: JobEnvelope): Promise<{ jobId: string }> {
    const id = crypto.randomUUID();
    const result = await this.store.enqueue({
      id,
      name: job.name,
      payload: job.payload,
      ...(job.idempotencyKey !== undefined ? { idempotencyKey: job.idempotencyKey } : {}),
      ...(job.correlationId !== undefined ? { correlationId: job.correlationId } : {}),
    });
    if (this.options.processInline && !result.replayed) {
      await this.processOne();
    }
    return { jobId: result.jobId };
  }

  async processOne(): Promise<boolean> {
    const workerId = this.options.workerId ?? 'inline-worker';
    await this.store.heartbeat(workerId, { inline: Boolean(this.options.processInline) });
    if (typeof this.store.reclaimExpiredLeases === 'function') {
      await this.store.reclaimExpiredLeases({
        leaseMs: this.options.leaseMs ?? 60_000,
      });
    }
    const claimed = await this.store.claim(workerId);
    if (!claimed) return false;
    const handler = this.handlers.get(claimed.name);
    if (!handler) {
      await this.store.fail(claimed.id, `no_handler:${claimed.name}`);
      return true;
    }
    try {
      await handler({
        name: claimed.name,
        payload: claimed.payload,
        ...(claimed.idempotencyKey != null ? { idempotencyKey: claimed.idempotencyKey } : {}),
        ...(claimed.correlationId != null ? { correlationId: claimed.correlationId } : {}),
      });
      await this.store.complete(claimed.id);
      this.processed.push(claimed.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const permanent =
        message.includes('kill_switch') ||
        message.includes('live_research_disabled') ||
        message.includes('lifecycle_not_enabled') ||
        message.includes('robots_disallow') ||
        message.includes('ssrf') ||
        message.includes('private_network') ||
        message.includes('target_segment') ||
        message.includes('durable_queue');
      await this.store.fail(
        claimed.id,
        message,
        permanent ? undefined : 1_000 * (claimed.attempts + 1),
      );
    }
    return true;
  }

  async drain(max = 100): Promise<number> {
    let n = 0;
    while (n < max && (await this.processOne())) n += 1;
    return n;
  }
}
