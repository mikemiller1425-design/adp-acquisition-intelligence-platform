import { InMemoryAuditPort, buildHealthResponse, loadConfig } from '@adp/platform';
import { buildApiServer } from './app.js';

async function main() {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://adp:adp@localhost:5432/adp_acquisition',
    OIDC_ISSUER_URL: process.env.OIDC_ISSUER_URL ?? 'https://login.microsoftonline.com/common/v2.0',
    OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID ?? 'client',
    OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET ?? 'secret-value',
    SESSION_SECRET: process.env.SESSION_SECRET ?? 'dev-only-change-me-now',
    OBJECT_STORAGE_ENDPOINT: process.env.OBJECT_STORAGE_ENDPOINT ?? 'http://localhost:9000',
    OBJECT_STORAGE_BUCKET: process.env.OBJECT_STORAGE_BUCKET ?? 'adp-dev',
    OBJECT_STORAGE_REGION: process.env.OBJECT_STORAGE_REGION ?? 'us-east-1',
    OBJECT_STORAGE_ACCESS_KEY_ID: process.env.OBJECT_STORAGE_ACCESS_KEY_ID ?? 'dev',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY ?? 'dev',
  });

  const audit = new InMemoryAuditPort();
  const app = await buildApiServer({
    config,
    logger: console as never,
    audit,
  });

  const response = await app.inject({ method: 'GET', url: '/health' });
  if (response.statusCode !== 200) {
    throw new Error(`API health failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json();
  if (body.service !== 'api' || body.status !== 'ok') {
    throw new Error(`Unexpected health payload: ${response.body}`);
  }
  // Ensure contract shape stays stable for smoke.
  buildHealthResponse({ service: 'api' });
  console.log('API health smoke OK');
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
