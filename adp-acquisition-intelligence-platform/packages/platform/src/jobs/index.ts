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
   * Durable job dispatch seam. Prompt 1 selects pg-boss (ADR-006) without wiring production queues yet.
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
