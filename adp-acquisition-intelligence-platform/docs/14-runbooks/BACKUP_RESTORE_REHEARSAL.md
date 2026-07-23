# Backup and Restore Rehearsal

**Status:** Prompt 12 — documented procedure with engineering dry-run evidence  
**Exit contract:** DAT-005 (`encrypted_backup_restore_rehearsal_passes`) — **not fully satisfied** (see Honest status below)

## Purpose

Verify that the platform can recover from database loss using documented backup/restore procedures before production release. Phase 1 engineering evidence uses **schema reset + forward migration replay** as a dry-run proxy; full encrypted backup restore to an isolated environment remains a **production operations sign-off**.

## Production procedure (target)

> **Placeholder for production ops** — execute in isolated environment before release sign-off.

1. **Backup**
   - Take encrypted PostgreSQL base backup + WAL archive per hosting provider runbook.
   - Record backup ID, checksum, encryption key reference, and `pg_dump`/`pg_basebackup` timestamp.
   - Store artifact in access-controlled object storage separate from application secrets.

2. **Restore to isolated environment**
   - Provision empty PostgreSQL 17 instance.
   - Restore backup; verify checksum.
   - Apply any pending forward migrations if backup predates latest migration.

3. **Verification queries**

```sql
SELECT count(*) FROM organizations;
SELECT count(*) FROM variable_definitions WHERE lifecycle = 'active';
SELECT count(*) FROM score_definitions WHERE status = 'active';
SELECT count(*) FROM audit_events;
```

4. **Core workflow smoke**
   - Health: `pnpm --filter @adp/api smoke:health`
   - Qualification read: one organization 360 query
   - Consent evaluate: `evaluateOutreachPermission` for a seeded contact
   - Export: request small sync export; confirm redaction metadata

5. **Sign-off record**
   - Attach evidence to DAT-005 in `phase_1_exit_contract.yaml` with environment, backup ID, counts, and approver.

## Engineering dry-run evidence (Prompt 12)

What was **actually executed** in CI/local validation:

### Empty-database forward migration

`packages/database/src/__tests__/database.integration.test.ts`:

- `applies migrations on an empty database` — `migrateTestDatabase({ reset: true })` drops `public` + `drizzle` schemas and reapplies migrations `0000`–`0009`.
- `reapplies migrations on an already-migrated database` — idempotent upgrade path without reset.
- Constraint, trigger, and seed-count assertions after migrate (organizations, variable definitions, scoring tables, etc.).

### Test database safety guard

`migrateTestDatabase` refuses non-`_test` database names for reset operations — prevents accidental production wipe.

### Seed after migrate

```bash
export DATABASE_URL=postgres://adp:adp@127.0.0.1:5433/adp_acquisition_test
pnpm db:migrate && pnpm db:seed
```

Idempotent seed re-run verified in database integration tests.

### What was NOT executed

| Item | Status |
|---|---|
| Encrypted `pg_basebackup` restore | Not run — no production backup artifact |
| Cross-region failover | Out of Phase 1 scope |
| Point-in-time recovery drill | Pending production ops |
| Application version rollback without schema rollback | Documented policy only |

## Honest exit-contract status

- **DAT-005:** `partial` — forward migration + reset rehearsal proven; encrypted backup restore **pending** production ops rehearsal and security owner sign-off.

## Recovery without schema rollback

Per TESTING_MASTER_PLAN: roll back **application** version, not schema. If a bad migration ships:

1. Stop writers.
2. Restore from last known-good backup (production procedure above).
3. Deploy previous application binary.
4. File incident report; do not assume `DOWN` migrations exist.

## Related

- [Database Setup](../development/DATABASE_SETUP.md)
- [Migration Guide](../development/MIGRATION_GUIDE.md)
- [Ops Startup and Validation](OPS_STARTUP_AND_VALIDATION.md)
