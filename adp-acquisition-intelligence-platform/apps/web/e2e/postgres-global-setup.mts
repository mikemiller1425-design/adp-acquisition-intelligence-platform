import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrateTestDatabase } from '@adp/database/testing';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgres://adp:adp@127.0.0.1:5433/adp_acquisition_test';

export default async function globalSetup() {
  process.env.DATABASE_URL = databaseUrl;
  process.env.TEST_DATABASE_URL = databaseUrl;
  process.env.ADP_RESEARCH_PROVIDER = 'postgres';

  await migrateTestDatabase({ databaseUrl, reset: true });
  execFileSync('pnpm', ['--filter', '@adp/database', 'db:seed'], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}
