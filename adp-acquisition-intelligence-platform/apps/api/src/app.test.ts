import { describe, expect, it } from 'vitest';
import type { DatabaseClient } from '@adp/database';
import { InMemoryAuditPort, loadConfig } from '@adp/platform';
import { buildApiServer } from './app.js';

const env = {
  DATABASE_URL: 'postgres://adp:adp@localhost:5432/adp_acquisition',
  OIDC_ISSUER_URL: 'https://login.microsoftonline.com/common/v2.0',
  OIDC_CLIENT_ID: 'client',
  OIDC_CLIENT_SECRET: 'secret-value',
  SESSION_SECRET: 'dev-only-change-me-now',
  OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
  OBJECT_STORAGE_BUCKET: 'adp-dev',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'dev',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'dev',
};

describe('api health', () => {
  it('returns ok without database attached', async () => {
    const config = loadConfig(env);
    const app = await buildApiServer({
      config,
      logger: console as never,
      audit: new InMemoryAuditPort(),
    });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().service).toBe('api');
    await app.close();
  });

  it('checks database ping for readiness', async () => {
    const config = loadConfig(env);
    let pinged = false;
    const database = {
      async ping(): Promise<boolean> {
        pinged = true;
        return true;
      },
    } as DatabaseClient;
    const app = await buildApiServer({
      config,
      logger: console as never,
      audit: new InMemoryAuditPort(),
      database,
    });

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: 'api',
      status: 'ok',
      dependencies: [{ name: 'postgres', status: 'ok' }],
    });
    expect(pinged).toBe(true);
    await app.close();
  });

  it('returns 503 when readiness database ping fails', async () => {
    const config = loadConfig(env);
    const database = {
      async ping(): Promise<boolean> {
        throw new Error('database unavailable');
      },
    } as DatabaseClient;
    const app = await buildApiServer({
      config,
      logger: console as never,
      audit: new InMemoryAuditPort(),
      database,
    });

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      service: 'api',
      status: 'error',
      dependencies: [{ name: 'postgres', status: 'error' }],
    });
    await app.close();
  });
});
