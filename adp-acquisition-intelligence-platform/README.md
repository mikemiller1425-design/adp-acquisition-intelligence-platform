# ADP Acquisition Intelligence Platform

Phase 1 acquisition intelligence workspace — documentation plus engineering foundation.

## Quick start

```bash
cd adp-acquisition-intelligence-platform
pnpm install --frozen-lockfile
pnpm validate
docker compose up -d postgres
cp .env.example .env
```

Health smokes:

```bash
pnpm --filter @adp/api smoke:health
pnpm --filter @adp/worker smoke:health
pnpm --filter @adp/web smoke:health
```

## Documentation

Start with [docs/README.md](docs/README.md). ADRs: [docs/adr/README.md](docs/adr/README.md).

## Phase boundary

Phase 1 is a human-in-the-loop acquisition intelligence workspace. Referral-partner workflows begin in Phase 2. Prompt 1 establishes infrastructure only; business schemas begin in Prompt 2.
