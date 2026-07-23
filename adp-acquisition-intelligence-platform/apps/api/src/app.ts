import Fastify from 'fastify';
import type { AppConfig, AuditPort, Logger } from '@adp/platform';
import { buildHealthResponse } from '@adp/platform';
import type { DatabaseClient } from '@adp/database';

export type ApiDeps = {
  config: AppConfig;
  logger: Logger;
  audit: AuditPort;
  database?: DatabaseClient;
};

export async function buildApiServer(deps: ApiDeps) {
  const app = Fastify({
    logger: false,
  });

  app.get('/health', async () => {
    let dbStatus: 'ok' | 'degraded' | 'error' = 'degraded';
    let detail = 'database client not attached in this process';
    if (deps.database) {
      try {
        await deps.database.ping();
        dbStatus = 'ok';
        detail = 'reachable';
      } catch (error) {
        dbStatus = 'error';
        detail = error instanceof Error ? error.message : 'unreachable';
      }
    }

    const status = dbStatus === 'error' ? 'degraded' : 'ok';
    await deps.audit.append({
      action: 'health.checked',
      subjectType: 'service',
      subjectId: 'api',
      metadata: { status, dbStatus },
    });

    return buildHealthResponse({
      service: 'api',
      status,
      dependencies: [{ name: 'postgres', status: dbStatus, detail }],
    });
  });

  app.get('/ready', async (_request, reply) => {
    if (!deps.database) {
      return reply.code(503).send(
        buildHealthResponse({
          service: 'api',
          status: 'error',
          dependencies: [{ name: 'postgres', status: 'error', detail: 'not configured' }],
        }),
      );
    }
    try {
      await deps.database.ping();
      return buildHealthResponse({
        service: 'api',
        status: 'ok',
        dependencies: [{ name: 'postgres', status: 'ok' }],
      });
    } catch {
      return reply.code(503).send(
        buildHealthResponse({
          service: 'api',
          status: 'error',
          dependencies: [{ name: 'postgres', status: 'error' }],
        }),
      );
    }
  });

  return app;
}
