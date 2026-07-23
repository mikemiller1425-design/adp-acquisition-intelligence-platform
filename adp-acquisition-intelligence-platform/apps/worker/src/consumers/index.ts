import { InMemoryJobDispatcher, type JobHandlerRegistryPort } from '@adp/platform';

export function registerWorkerConsumers(
  jobs: JobHandlerRegistryPort = new InMemoryJobDispatcher(),
) {
  jobs.register('heartbeat', async () => {
    // Prompt 1 scaffold only: proves handler registration is idempotent-ready.
  });
  return jobs;
}
