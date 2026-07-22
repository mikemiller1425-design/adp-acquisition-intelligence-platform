import { z } from 'zod';

const retentionSchema = z.object({
  exportHours: z.number().int().positive(),
  importArtifactDays: z.number().int().positive(),
  logDays: z.number().int().positive(),
  jobPayloadDays: z.number().int().positive(),
  businessRecordYearsAfterArchive: z.number().int().positive(),
  auditEventYears: z.number().int().positive(),
  requiresLegalValidation: z.literal(true),
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3002),
  DATABASE_URL: z.string().min(1),
  OIDC_ISSUER_URL: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_REGION: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().min(1),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  OTEL_SERVICE_NAME: z.string().default('adp-acquisition'),
  RETENTION_EXPORT_HOURS: z.coerce.number().int().positive().default(24),
  RETENTION_IMPORT_DAYS: z.coerce.number().int().positive().default(30),
  RETENTION_LOG_DAYS: z.coerce.number().int().positive().default(30),
  RETENTION_JOB_PAYLOAD_DAYS: z.coerce.number().int().positive().default(30),
  RETENTION_BUSINESS_YEARS: z.coerce.number().int().positive().default(7),
  RETENTION_AUDIT_YEARS: z.coerce.number().int().positive().default(7),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  apiHost: string;
  apiPort: number;
  webPort: number;
  workerHealthPort: number;
  databaseUrl: string;
  oidc: {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
  };
  sessionSecret: string;
  objectStorage: {
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  otelServiceName: string;
  retention: z.infer<typeof retentionSchema>;
  tenancy: {
    mode: 'single_tenant';
    note: string;
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const retention = retentionSchema.parse({
    exportHours: parsed.RETENTION_EXPORT_HOURS,
    importArtifactDays: parsed.RETENTION_IMPORT_DAYS,
    logDays: parsed.RETENTION_LOG_DAYS,
    jobPayloadDays: parsed.RETENTION_JOB_PAYLOAD_DAYS,
    businessRecordYearsAfterArchive: parsed.RETENTION_BUSINESS_YEARS,
    auditEventYears: parsed.RETENTION_AUDIT_YEARS,
    requiresLegalValidation: true,
  });

  return {
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL,
    apiHost: parsed.API_HOST,
    apiPort: parsed.API_PORT,
    webPort: parsed.WEB_PORT,
    workerHealthPort: parsed.WORKER_HEALTH_PORT,
    databaseUrl: parsed.DATABASE_URL,
    oidc: {
      issuerUrl: parsed.OIDC_ISSUER_URL,
      clientId: parsed.OIDC_CLIENT_ID,
      clientSecret: parsed.OIDC_CLIENT_SECRET,
    },
    sessionSecret: parsed.SESSION_SECRET,
    objectStorage: {
      endpoint: parsed.OBJECT_STORAGE_ENDPOINT,
      bucket: parsed.OBJECT_STORAGE_BUCKET,
      region: parsed.OBJECT_STORAGE_REGION,
      accessKeyId: parsed.OBJECT_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: parsed.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    },
    otelServiceName: parsed.OTEL_SERVICE_NAME,
    retention,
    tenancy: {
      mode: 'single_tenant',
      note: 'ADR-003: territories and ownership are authorization scopes, not tenants.',
    },
  };
}
