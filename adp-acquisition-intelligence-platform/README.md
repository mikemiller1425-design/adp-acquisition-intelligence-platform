# ADP Acquisition Intelligence Platform

Phase 1 acquisition intelligence workspace — documentation plus engineering foundation.

## Quick start

```bash
cd adp-acquisition-intelligence-platform
pnpm install --frozen-lockfile
docker compose up -d postgres
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm validate
```

Health smokes:

```bash
pnpm --filter @adp/api smoke:health
pnpm --filter @adp/worker smoke:health
pnpm --filter @adp/web smoke:health
```

Database development:

- [Database setup](docs/development/DATABASE_SETUP.md)
- [Migration guide](docs/development/MIGRATION_GUIDE.md)
- [Evidence and provenance guide](docs/development/EVIDENCE_AND_PROVENANCE_GUIDE.md)
- [Variable definition guide](docs/development/VARIABLE_DEFINITION_GUIDE.md)
- [Import pipeline guide](docs/development/IMPORT_PIPELINE_GUIDE.md)
- [Normalization policy](docs/development/NORMALIZATION_POLICY.md)
- [Duplicate and merge guide](docs/development/DUPLICATE_AND_MERGE_GUIDE.md)
- [Scoring configuration guide](docs/development/SCORING_CONFIGURATION_GUIDE.md)
- [Import recovery runbook](docs/operations/IMPORT_RECOVERY_RUNBOOK.md)
- [Score recalculation runbook](docs/operations/SCORE_RECALCULATION_RUNBOOK.md)
- [Prompt 12 ops runbooks](docs/14-runbooks/OPS_STARTUP_AND_VALIDATION.md)

## Documentation

Start with [docs/README.md](docs/README.md). ADRs: [docs/adr/README.md](docs/adr/README.md).

## Phase boundary

Phase 1 is a human-in-the-loop acquisition intelligence workspace. Referral-partner workflows begin in Phase 2. Prompt 1 establishes infrastructure only; business schemas begin in Prompt 2.
