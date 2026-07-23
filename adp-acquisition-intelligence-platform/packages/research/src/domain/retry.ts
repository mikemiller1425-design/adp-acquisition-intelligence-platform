export function retryDelayMs(
  attempt: number,
  options: { baseMs?: number; maxMs?: number; jitterRatio?: number } = {},
): number {
  const baseMs = options.baseMs ?? 500;
  const maxMs = options.maxMs ?? 30_000;
  const jitterRatio = options.jitterRatio ?? 0.2;
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
  const jitter = exp * jitterRatio * Math.random();
  return Math.floor(exp - jitter / 2 + Math.random() * jitter);
}

export function shouldRetry(attempt: number, maxAttempts: number, errorCode: string): boolean {
  if (attempt >= maxAttempts) return false;
  const terminal = new Set([
    'lifecycle_not_enabled',
    'kill_switch',
    'private_network',
    'ssrf',
    'robots_disallow',
    'unsupported_mime',
    'credential_bearing_url',
  ]);
  return !terminal.has(errorCode);
}
