import { describe, expect, it } from 'vitest';
import { InMemoryJobDispatcher, loadConfig } from '@adp/platform';
import { buildWorkerServer } from './app.js';
import { registerWorkerConsumers } from './consumers/index.js';

describe('worker health', () => {
  it('reports ok when heartbeat handler is registered', async () => {
    const config = loadConfig({
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
    });
    const jobs = registerWorkerConsumers(new InMemoryJobDispatcher());
    const app = await buildWorkerServer({
      config,
      logger: console as never,
      jobs,
    });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
    await app.close();
  });
});
