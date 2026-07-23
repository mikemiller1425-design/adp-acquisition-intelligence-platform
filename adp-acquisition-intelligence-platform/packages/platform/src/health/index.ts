import type { HealthResponse } from '@adp/contracts';

export function buildHealthResponse(input: {
  service: string;
  status?: HealthResponse['status'];
  dependencies?: HealthResponse['dependencies'];
  now?: Date;
}): HealthResponse {
  return {
    service: input.service,
    status: input.status ?? 'ok',
    checkedAt: (input.now ?? new Date()).toISOString(),
    dependencies: input.dependencies ?? [],
  };
}
