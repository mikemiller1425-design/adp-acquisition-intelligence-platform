import Fastify from 'fastify';
import {
  buildHealthResponse,
  type AppConfig,
  type JobHandlerRegistryPort,
  type Logger,
} from '@adp/platform';

export async function buildWorkerServer(input: {
  config: AppConfig;
  logger: Logger;
  jobs: JobHandlerRegistryPort;
}) {
  const app = Fastify({ logger: false });

  app.get('/health', async () => {
    const registered = ['heartbeat'].every((name) => Boolean(input.jobs.get(name)));
    return buildHealthResponse({
      service: 'worker',
      status: registered ? 'ok' : 'degraded',
      dependencies: [
        {
          name: 'job-handlers',
          status: registered ? 'ok' : 'degraded',
          detail: registered ? 'heartbeat registered' : 'missing handlers',
        },
      ],
    });
  });

  return app;
}
