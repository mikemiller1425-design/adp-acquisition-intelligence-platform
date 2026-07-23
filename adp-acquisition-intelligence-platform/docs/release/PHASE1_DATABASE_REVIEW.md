# Phase 1 Database Review

**Baseline:** `61c6348`  
**Engine:** PostgreSQL 17.10 (validated on `:5433` test DB)

## Schema

| Metric | Value |
|---|---|
| Migrations | `0000`–`0009` (10) |
| `CREATE TABLE` count | 97 |
| Drizzle `pgTable` count | 97 (match) |
| Indexes (CREATE INDEX statements) | ~270 |
| Seeds | variables, scoring, discovery, outreach, opportunities (+ foundation seed) |

## Integrity

- Hard-delete / immutability guards: migration `0001_integrity_guards.sql` + package tests.
- Consent records supersede rather than rewrite; triggers reject illegal mutation.
- Append-only audit_events / operational_state_transitions / score snapshots / qualification decisions.
- Subject checks enforce org XOR contact where required.
- Optimistic concurrency via `record_version` on key aggregates.

## Migration order and rollback

- Forward-only journal in `meta/_journal.json`; applied idempotently by `runMigrations`.
- **No down migrations** shipped (Phase 1 policy: restore from backup rather than automate destructive downs).
- Rollback safety = backup/restore rehearsal docs + empty-schema migrate tests — **encrypted production backup drill still open** (DAT-005 partial).

## Snapshot gaps

Missing drizzle snapshots: `0001`, `0004`, `0005`. Latest snapshot `0009` matches schema (`drizzle-kit generate` reported no drift historically after Prompt 10). **Risk:** regenerating from incomplete history can recreate earlier objects — operators must hand-review SQL.

## Indexes / uniqueness

- Partial unique indexes used for active opportunities, current variable values, etc.
- No `IF NOT EXISTS` on indexes (clean empty-DB migrate path).
- Known Postgres NOTICE: identifiers >63 chars truncated; no observed collisions.

## Nullability / consistency

- Explicit unknown/missing semantics in variables/scoring (unknown ≠ zero).
- Opportunity value nullable; currency required when amount present.
- Outreach permission snapshots stored on drafts/activities.

## Seed behavior

- Production-looking DB names refused unless `ALLOW_PRODUCTION_SEED=true`.
- Seeds upsert configuration libraries and synthetic demo orgs/contacts/consent cases.

## Conclusion

Database foundation is **stable for Phase 2 feature development**, with operational caveats on encrypted restore rehearsal and drizzle snapshot hygiene.
