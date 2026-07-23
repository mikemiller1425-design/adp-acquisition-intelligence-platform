import { createDatabaseClient, type DatabaseClient } from '@adp/database';
import {
  createLogger,
  InMemoryAuditPort,
  InMemoryJobDispatcher,
  loadConfig,
  UnconfiguredAuthentication,
  DenyAllAuthorization,
  type AppConfig,
  type AuditPort,
  type AuthenticationPort,
  type AuthorizationPort,
  type JobDispatcherPort,
  type Logger,
} from '@adp/platform';

export type ApiComposition = {
  config: AppConfig;
  logger: Logger;
  audit: AuditPort;
  jobs: JobDispatcherPort;
  authn: AuthenticationPort;
  authz: AuthorizationPort;
  database: DatabaseClient;
};

export function createApiComposition(env: NodeJS.ProcessEnv = process.env): ApiComposition {
  const config = loadConfig(env);
  const logger = createLogger({
    service: 'api',
    level: config.logLevel,
    nodeEnv: config.nodeEnv,
  });
  const audit = new InMemoryAuditPort();
  const jobs = new InMemoryJobDispatcher();
  const authn = new UnconfiguredAuthentication();
  const authz = new DenyAllAuthorization();
  const database = createDatabaseClient(config.databaseUrl);

  return {
    config,
    logger,
    audit,
    jobs,
    authn,
    authz,
    database,
  };
}
