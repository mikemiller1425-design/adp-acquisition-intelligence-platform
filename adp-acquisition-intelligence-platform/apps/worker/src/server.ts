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
 * - Default: InMemoryJobDispatcher (local/dev without durable queue)
 * - When ADP_JOB_QUEUE=durable and postgres runtime: PostgresDurableJobStore + poll loop
 * ADP_LIVE_RESEARCH_ENABLED defaults false — adapters remain gated.
 */
async function main() {
  const config = loadConfig();
  const logger = createLogger({
    service: 'worker',
    level: config.logLevel,
    nodeEnv: config.nodeEnv,
  });
  const research = createResearchRuntime(process.env);
  const useDurable =
    (process.env.ADP_JOB_QUEUE ?? '').trim().toLowerCase() === 'durable' &&
    research.provider === 'postgres' &&
    research.database;

  let stopPolling: (() => void) | undefined;

  if (useDurable && research.database) {
    const store = new PostgresDurableJobStore(research.database.db);
    const jobs = new DurableJobDispatcher(store, {
      workerId: process.env.ADP_WORKER_ID ?? `worker-${process.pid}`,
      processInline: false,
    });
    registerWorkerConsumers(jobs, research);
    const app = await buildWorkerServer({ config, logger, jobs });
    await app.listen({ host: '0.0.0.0', port: config.workerHealthPort });
    logger.info(
      {
        port: config.workerHealthPort,
        researchProvider: research.provider,
        jobQueue: 'durable',
        liveResearchEnabled: process.env.ADP_LIVE_RESEARCH_ENABLED ?? 'false',
      },
      'Worker health listening (durable queue)',
    );

    let active = true;
    stopPolling = () => {
      active = false;
    };
    const poll = async () => {
      while (active) {
        try {
          const worked = await jobs.processOne();
          if (!worked) await new Promise((r) => setTimeout(r, 500));
        } catch (error) {
          logger.error({ err: error }, 'durable job poll failed');
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    };
    void poll();
    process.on('SIGTERM', () => stopPolling?.());
    process.on('SIGINT', () => stopPolling?.());
    return;
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
