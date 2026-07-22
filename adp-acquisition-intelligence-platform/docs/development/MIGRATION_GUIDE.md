# Migration Guide

Prompt 2 uses forward-only Drizzle migrations under `packages/database/migrations`.

## Current migrations

- `0000_parched_electro.sql` — canonical Prompt 2 schema, enums, constraints, foreign keys, and indexes.
- `0001_integrity_guards.sql` — manual integrity guards:
  - Hard-delete rejection for canonical organization/contact/consent rows.
  - Append-only enforcement for `audit_events` and `operational_state_transitions`.
  - Consent material-field immutability while allowing `superseded_by_id` and `revoked_at` updates.

## Generate schema migrations

For schema changes represented in Drizzle table definitions:

```bash
export DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition
pnpm --filter @adp/database db:generate
```

Review generated SQL before committing. Confirm that the migration journal under `packages/database/migrations/meta/_journal.json` includes the new migration.

## Manual migrations

Use manual SQL when Drizzle schema definitions cannot represent the required database object, such as trigger functions. Manual migrations must:

1. Use a new monotonically increasing filename.
2. Be added to `packages/database/migrations/meta/_journal.json`.
3. Be tested from an empty `_test` database.
4. Include documentation when they enforce business-critical invariants.

## Apply migrations

```bash
pnpm db:migrate
```

For a specific database:

```bash
DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition pnpm db:migrate
```

## Verify migrations

Minimum local verification:

```bash
DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/database test:integration
DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/organizations test -- --run src/__tests__/organizations.integration.test.ts
DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/consent test -- --run src/__tests__/consent.integration.test.ts
DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/qualification test -- --run src/__tests__/operational-state.integration.test.ts
```

Before release hardening, rerun the same suite on the supported PostgreSQL version from `docker-compose.yml`.

## Rollback posture

Production migrations are forward-only. A bad migration is remediated with a new forward migration plus restored data from backup when required. Prompt 2 reset helpers are only for `_test` databases and must never be used against development, staging, or production data.

## Data lifecycle rules enforced in Prompt 2

- Use repository/application archive methods for organization/contact lifecycle changes.
- Correct consent records by inserting a superseding record; do not rewrite material fields.
- Treat `audit_events` and `operational_state_transitions` as append-only.
- Use `DatabaseClient.withTransaction` for business operations that must commit state, audit, transition history, and outbox work together.
