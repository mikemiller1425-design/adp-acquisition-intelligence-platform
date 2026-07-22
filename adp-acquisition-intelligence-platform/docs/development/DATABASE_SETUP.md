# Database Setup

This project uses PostgreSQL as the reference datastore and Drizzle for schema migrations.

## Required URLs

Development database:

```bash
export DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition
```

Integration test database:

```bash
export DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test
```

The test helpers refuse to reset a database whose name does not end in `_test`.

## Start Postgres

Preferred local setup:

```bash
docker compose up -d postgres
```

The compose file targets PostgreSQL 17. If you use a host-installed PostgreSQL, verify compatibility before release hardening:

```bash
psql "$DATABASE_URL" -c 'select version();'
```

## Create the test database

If your Postgres instance only created `adp_acquisition`, create the integration database once:

```bash
createdb postgres://adp:adp@localhost:5432/adp_acquisition_test
```

If `createdb` does not accept a URL in your environment:

```bash
createdb -h localhost -U adp adp_acquisition_test
```

## Install dependencies

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
pnpm install --frozen-lockfile
```

## Run migrations

Development database:

```bash
export DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition
pnpm db:migrate
```

Test database:

```bash
export DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test
pnpm --filter @adp/database test:integration
```

The integration helper resets the `_test` schema before migration tests.

## Seed data

```bash
export DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition
pnpm db:seed
```

The seed is idempotent and can be run repeatedly.

## Health checks

Database health primitive:

```bash
pnpm --filter @adp/database test:integration
```

API readiness contract:

```bash
pnpm --filter @adp/api test
```

API runtime readiness uses `/ready`, which returns `503` when the database ping fails.

## Troubleshooting

- `Refusing to reset or migrate non-test database`: use a database name ending in `_test` for reset-backed integration tests.
- `ECONNREFUSED` or `pg_isready` failure: start Postgres or verify the URL/port.
- Package tests cannot resolve fresh `@adp/database/testing` declarations: run `pnpm --filter @adp/database build` first, or use root `pnpm test` so Turbo builds dependencies.
