import { createLogger, InMemoryJobDispatcher, loadConfig } from '@adp/platform';
import { buildWorkerServer } from './app.js';
import { registerWorkerConsumers } from './consumers/index.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger({
    service: 'worker',
    level: config.logLevel,
    nodeEnv: config.nodeEnv,
  });
  const jobs = registerWorkerConsumers(new InMemoryJobDispatcher());
  const app = await buildWorkerServer({ config, logger, jobs });
  await app.listen({ host: '0.0.0.0', port: config.workerHealthPort });
  logger.info({ port: config.workerHealthPort }, 'Worker health listening');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
