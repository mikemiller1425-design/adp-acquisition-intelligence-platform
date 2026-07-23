import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/index.js';
import { AppError, toErrorEnvelope } from '../errors/index.js';
import { buildHealthResponse } from '../health/index.js';
import { InMemoryJobDispatcher } from '../jobs/index.js';
import { InMemoryAuditPort } from '../audit/index.js';

const baseEnv = {
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

describe('platform foundation', () => {
  it('loads validated config with single-tenant mode', () => {
    const config = loadConfig(baseEnv);
    expect(config.tenancy.mode).toBe('single_tenant');
    expect(config.retention.exportHours).toBe(24);
    expect(config.retention.requiresLegalValidation).toBe(true);
  });

  it('redacts internal errors in envelopes', () => {
    const error = new AppError({
      code: 'INTERNAL_ERROR',
      message: 'secret boom',
      details: { token: 'abc' },
    });
    expect(toErrorEnvelope(error, 'corr-1')).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        correlationId: 'corr-1',
      },
    });
  });

  it('builds health responses', () => {
    const health = buildHealthResponse({
      service: 'api',
      now: new Date('2026-07-22T00:00:00.000Z'),
    });
    expect(health.status).toBe('ok');
    expect(health.checkedAt).toBe('2026-07-22T00:00:00.000Z');
  });

  it('dispatches jobs through the in-memory seam', async () => {
    const dispatcher = new InMemoryJobDispatcher();
    let seen = false;
    dispatcher.register('ping', async () => {
      seen = true;
    });
    const result = await dispatcher.enqueue({ name: 'ping', payload: {} });
    expect(result.jobId).toBe('job_1');
    expect(seen).toBe(true);
  });

  it('appends audit events immutably in memory', async () => {
    const audit = new InMemoryAuditPort();
    await audit.append({ action: 'health.checked', subjectType: 'system' });
    expect(audit.events).toHaveLength(1);
  });
});
