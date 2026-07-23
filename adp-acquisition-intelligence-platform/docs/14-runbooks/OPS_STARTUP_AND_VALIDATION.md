# Operations Runbook — Startup, Health, Migrate, Seed, Validate

**Status:** Prompt 12 operational runbook  
**Applies to:** local development, CI, and pre-production rehearsal environments  
**Does not constitute:** production deployment or production sign-off

## Prerequisites

- Node.js 24.x and pnpm 11.x (`packageManager` in root `package.json`)
- PostgreSQL 17 (reference: `docker compose up -d postgres` or host service on port 5432/5433)
- Environment file copied from `.env.example`

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
cd adp-acquisition-intelligence-platform
cp .env.example .env
```

## Install

```bash
pnpm install --frozen-lockfile
```

## Start infrastructure

```bash
docker compose up -d postgres
```

Verify connectivity:

```bash
psql "$DATABASE_URL" -c 'select version();'
```

Integration tests require a database whose name ends in `_test`:

```bash
export DATABASE_URL=postgres://adp:adp@127.0.0.1:5433/adp_acquisition_test
```

## Migrate

Development database:

```bash
export DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition
pnpm db:migrate
```

Test database (used by integration suites):

```bash
export DATABASE_URL=postgres://adp:adp@127.0.0.1:5433/adp_acquisition_test
pnpm --filter @adp/database test:integration
```

The shared test helper `migrateTestDatabase({ reset: true })` drops and reapplies all migrations — see [Backup and Restore Rehearsal](BACKUP_RESTORE_REHEARSAL.md) for recovery evidence.

## Seed

```bash
export DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition
pnpm db:seed
```

Seed is idempotent. Prompt 3+ seeds include 56 active variable definitions, scoring baseline, outreach library, and disqualification catalog.

## Start application processes

Development (parallel web, API, worker):

```bash
pnpm dev
```

Individual health smokes (no long-running server required):

```bash
pnpm --filter @adp/api smoke:health
pnpm --filter @adp/worker smoke:health
pnpm --filter @adp/web smoke:health
```

### Health endpoints

| Process | Endpoint | Contract |
|---|---|---|
| API | `GET /health` | Process + dependency summary (`@adp/contracts` `healthResponseSchema`) |
| API | `GET /ready` | Returns `503` when database ping fails |
| Web | `GET /health` | Next.js route health |
| Worker | health port (`WORKER_HEALTH_PORT`, default 3002) | Process health |

Database health primitive: `checkDatabaseHealth` in `@adp/database` (integration-tested).

## Validate (full regression)

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
export DATABASE_URL=postgres://adp:adp@127.0.0.1:5433/adp_acquisition_test
pnpm validate
```

`pnpm validate` runs, in order:

1. `format:check`
2. `lint`
3. `typecheck`
4. `deps:check` (dependency-cruiser)
5. `test` (all package unit/integration suites via Turbo)
6. `build`
7. `validate:docs` (link + YAML parse)

Record command output and commit SHA in `docs/01-reviews/PROMPT_12_HANDOFF.md` for release evidence.

## Web demo session (Phase 1)

The web app uses env-configured demo session (`apps/web/src/lib/auth.ts`), not production Entra ID OIDC. Configure roles for acceptance rehearsal:

```bash
ADP_WEB_USER_ID=demo-user-001
ADP_WEB_USER_NAME="Demo Operator"
ADP_WEB_USER_ROLES=admin,researcher,sales,reviewer
ADP_WEB_TERRITORY_IDS=territory-east
ADP_REPORTING_PROVIDER=fixture   # default; set postgres when DB-backed reporting is wired
```

Production identity integration remains a release sign-off item (ADR-004).

## Failure triage

| Symptom | Check |
|---|---|
| `ECONNREFUSED` on migrate/test | Postgres running; `DATABASE_URL` host/port |
| `Refusing to reset non-test database` | Use `*_test` database name for reset-backed suites |
| Turbo build stale types | `pnpm --filter @adp/database build` then re-run tests |
| Health `503` on `/ready` | Database URL, migrations applied, network to Postgres |

## Related runbooks

- [Backup and Restore Rehearsal](BACKUP_RESTORE_REHEARSAL.md)
- [Consent Opt-Out Incident](CONSENT_OPT_OUT_INCIDENT.md)
- [Export Expiry](EXPORT_EXPIRY.md)
- [Import Recovery](../operations/IMPORT_RECOVERY_RUNBOOK.md)
- [Score Recalculation](../operations/SCORE_RECALCULATION_RUNBOOK.md)
