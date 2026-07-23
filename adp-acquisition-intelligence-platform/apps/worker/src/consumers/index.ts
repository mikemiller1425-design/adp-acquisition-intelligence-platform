import { InMemoryJobDispatcher, type JobHandlerRegistryPort } from '@adp/platform';
import { RESEARCH_JOB_TYPES } from '@adp/research';

export function registerWorkerConsumers(
  jobs: JobHandlerRegistryPort = new InMemoryJobDispatcher(),
) {
  jobs.register('heartbeat', async () => {
    // Prompt 1 scaffold only: proves handler registration is idempotent-ready.
  });

  for (const jobType of RESEARCH_JOB_TYPES) {
    jobs.register(jobType, async () => {
      // Phase 1.1: handlers are registered and bounded. Execution is driven by
      // application services in @adp/research (fixture-safe). Live adapters remain gated.
    });
  }

  return jobs;
}
