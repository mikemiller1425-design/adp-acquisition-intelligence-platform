import { createLogger, InMemoryJobDispatcher, loadConfig } from '@adp/platform';
import { buildWorkerServer } from './app.js';
import { createResearchRuntime } from './composition/research-runtime.js';
import { registerWorkerConsumers } from './consumers/index.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger({
    service: 'worker',
    level: config.logLevel,
    nodeEnv: config.nodeEnv,
  });
  const research = createResearchRuntime(process.env);
  const jobs = registerWorkerConsumers(new InMemoryJobDispatcher(), research);
  const app = await buildWorkerServer({ config, logger, jobs });
  await app.listen({ host: '0.0.0.0', port: config.workerHealthPort });
  logger.info(
    { port: config.workerHealthPort, researchProvider: research.provider },
    'Worker health listening',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
