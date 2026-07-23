# Prompt 2 Handoff

**Prompt:** Canonical data model  
**Branch:** `cursor/prompt-2-canonical-data-model-dd2b`  
**Recommendation:** READY for Prompt 3, with PostgreSQL 17 validation deferred as non-blocking operational follow-up.

## What changed

### Database

- Added `packages/database/migrations/0001_integrity_guards.sql`.
- Updated Drizzle migration journal for the integrity guard migration.
- Added test DB advisory locking to `packages/database/src/testing/setup.ts`.
- Expanded database integration coverage for:
  - Empty-schema migration.
  - Migration idempotency.
  - Constraints and database-error translation.
  - Seed idempotency.
  - Transaction commit/rollback behavior.
  - Hard-delete rejection.
  - Audit append-only behavior.
  - DB health ping response.

### Organizations

- Updated Postgres repositories to accept transaction-scoped executors.
- Added Postgres integration tests for organization/contact create, read, update, and archive behavior.
- Added a service-boundary test documenting that adapters are persistence ports and services enforce business rules.

### Consent

- Updated Postgres permission supersession to satisfy self-referential FK constraints and partial unique indexes in one transaction.
- Added Postgres integration tests for:
  - Supersession and immutable permission material fields.
  - Global suppression precedence.
  - Organization restriction precedence.
  - Expired permission inactivity.
  - Restrictive resolution of conflicting effective records.

### Qualification

- Updated operational-state repositories to accept transaction-scoped executors.
- Added Postgres integration tests for:
  - State update, transition history, audit, and outbox commit in one transaction.
  - Rollback when transition history insert fails.
  - Rollback when outbox insert fails after writing.

### API

- Added `/ready` tests proving readiness calls database `ping()` and returns `503` on ping failure.

### Documentation

- Added Prompt 2 implementation summary.
- Added architecture review.
- Added database setup and migration guides.
- Updated repository/database/README notes for Prompt 2.

## Validation evidence

Commands run with:

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
```

Passed:

```bash
pnpm install --frozen-lockfile
pnpm --filter @adp/database build
pnpm --filter @adp/organizations typecheck
pnpm --filter @adp/consent typecheck
pnpm --filter @adp/qualification typecheck
pnpm --filter @adp/api test
DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/database test:integration
DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/organizations test -- --run src/__tests__/organizations.integration.test.ts
DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/consent test -- --run src/__tests__/consent.integration.test.ts
DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/qualification test -- --run src/__tests__/operational-state.integration.test.ts
pnpm validate
DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm db:migrate
DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm db:seed
```

Seed result:

```json
{"users":4,"roles":4,"permissions":7,"territories":2,"organizations":3,"contacts":4,"tasks":3,"tags":3}
```

Environment notes:

- Local DB used for evidence: PostgreSQL 16.14 at `postgres://adp:adp@localhost:5432/adp_acquisition_test`.
- `docker` was not available in this cloud image, so compose PostgreSQL 17 was not started here.

## Tables created by Prompt 2 migration

`account_assignments`, `audit_events`, `outbox_events`, `contact_channel_permissions`, `organization_communication_restrictions`, `suppression_entries`, `permissions`, `role_permissions`, `roles`, `user_roles`, `users`, `operational_state_transitions`, `contact_roles`, `contacts`, `organization_aliases`, `organization_locations`, `organization_roles`, `organizations`, `territories`, `notes`, `taggings`, `tags`, `tasks`.

## Architecture review result

See [Prompt 2 Architecture Review](PROMPT_2_ARCHITECTURE_REVIEW.md).

Verdict: `PASS_WITH_NON_BLOCKING_FINDINGS`

Open finding:

- `AR-P2-001` low: local validation used PostgreSQL 16.14 while compose targets PostgreSQL 17. Run the same migration and integration suite against PostgreSQL 17 before release hardening.

## Deferred work

- Prompt 3+ evidence/provenance, variables, scoring, collection import, outreach, opportunities, dashboards, and UI behavior remain unimplemented by design.
- API/job composition in future prompts must call application services and use explicit transaction boundaries for multi-write operations.
- Exit contract YAML statuses remain pending because Phase 1 release gates require later prompt evidence and sign-off.

## Next prompt readiness

Prompt 3 can build on:

- Canonical organization/contact persistence and archive lifecycle.
- Consent/permission precedence service and storage.
- Operational-state transition service, history, and transaction composition.
- Database health/readiness primitives.
- Audit/outbox tables and transactional usage pattern.
