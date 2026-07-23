import { buildHealthResponse } from '@adp/platform';
import { describe, expect, it } from 'vitest';

describe('web health helper', () => {
  it('returns web service identity', () => {
    const health = buildHealthResponse({ service: 'web' });
    expect(health.service).toBe('web');
    expect(health.status).toBe('ok');
  });
});
