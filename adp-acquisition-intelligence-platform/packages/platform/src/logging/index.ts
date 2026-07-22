import pino from 'pino';

const REDACT_PATHS = [
  'password',
  'secret',
  'token',
  'authorization',
  'cookie',
  'OIDC_CLIENT_SECRET',
  'SESSION_SECRET',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  'DATABASE_URL',
];

export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
  child: (bindings: Record<string, unknown>) => Logger;
};

export function createLogger(options: {
  service: string;
  level?: string;
  nodeEnv?: string;
}): Logger {
  return pino({
    name: options.service,
    level: options.level ?? 'info',
    redact: {
      paths: REDACT_PATHS,
      censor: '[Redacted]',
    },
  }) as unknown as Logger;
}
