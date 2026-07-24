import {
  createLogger,
  DurableJobDispatcher,
  InMemoryJobDispatcher,
  loadConfig,
} from '@adp/platform';
import { PostgresDurableJobStore } from '@adp/research';
import { buildWorkerServer } from './app.js';
import { createResearchRuntime } from './composition/research-runtime.js';
import { registerWorkerConsumers } from './consumers/index.js';

/**
 * Phase 1.2 worker:
 * - ADP_JOB_QUEUE=durable + postgres: PostgresDurableJobStore + poll (fail closed if misconfigured)
 * - Otherwise: InMemoryJobDispatcher (local/dev)
 * ADP_LIVE_RESEARCH_ENABLED defaults false — adapters remain gated.
 */
async function main() {
  const config = loadConfig();
  const logger = createLogger({
    service: 'worker',
    level: config.logLevel,
    nodeEnv: config.nodeEnv,
  });
  const queueRaw = (process.env.ADP_JOB_QUEUE ?? 'memory').trim().toLowerCase();
  const research = createResearchRuntime(process.env);

  if (queueRaw === 'durable') {
    if (research.provider !== 'postgres' || !research.database) {
      throw new Error(
        'durable_queue_invalid_config: ADP_JOB_QUEUE=durable requires ADP_RESEARCH_PROVIDER=postgres and DATABASE_URL',
      );
    }
    const store = new PostgresDurableJobStore(research.database.db);
    const leaseMs = Number(process.env.ADP_JOB_LEASE_MS ?? 60_000);
    const jobs = new DurableJobDispatcher(store, {
      workerId: process.env.ADP_WORKER_ID ?? `worker-${process.pid}`,
      processInline: false,
      leaseMs,
    });
    registerWorkerConsumers(jobs, research);
    const app = await buildWorkerServer({ config, logger, jobs });
    await app.listen({ host: '0.0.0.0', port: config.workerHealthPort });
    logger.info(
      {
        port: config.workerHealthPort,
        researchProvider: research.provider,
        jobQueue: 'durable',
        leaseMs,
        liveResearchEnabled: process.env.ADP_LIVE_RESEARCH_ENABLED ?? 'false',
      },
      'Worker health listening (durable queue)',
    );

    let active = true;
    const stopPolling = () => {
      active = false;
    };
    const poll = async () => {
      while (active) {
        try {
          await store.reclaimExpiredLeases({ leaseMs });
          const worked = await jobs.processOne();
          if (!worked) await new Promise((r) => setTimeout(r, 500));
        } catch (error) {
          logger.error({ err: error }, 'durable job poll failed');
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    };
    void poll();
    process.on('SIGTERM', () => stopPolling());
    process.on('SIGINT', () => stopPolling());
    return;
  }

  if (queueRaw !== '' && queueRaw !== 'memory') {
    throw new Error(`durable_queue_invalid_config: unknown ADP_JOB_QUEUE=${queueRaw}`);
  }

  const jobs = registerWorkerConsumers(new InMemoryJobDispatcher(), research);
  const app = await buildWorkerServer({ config, logger, jobs });
  await app.listen({ host: '0.0.0.0', port: config.workerHealthPort });
  logger.info(
    {
      port: config.workerHealthPort,
      researchProvider: research.provider,
      jobQueue: 'memory',
      liveResearchEnabled: process.env.ADP_LIVE_RESEARCH_ENABLED ?? 'false',
    },
    'Worker health listening',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
