import { createApiComposition } from './composition/container.js';
import { buildApiServer } from './app.js';

async function main() {
  const deps = createApiComposition();
  const app = await buildApiServer({
    config: deps.config,
    logger: deps.logger,
    audit: deps.audit,
    database: deps.database,
  });

  await app.listen({ host: deps.config.apiHost, port: deps.config.apiPort });
  deps.logger.info({ port: deps.config.apiPort }, 'API listening');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
