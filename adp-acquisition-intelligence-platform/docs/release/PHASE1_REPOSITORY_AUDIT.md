# Phase 1 Repository Audit

**Baseline commit:** `61c6348ccdef2fe0c12073745f8a3b59c4943bff`  
**Branch under review:** `cursor/phase1-acceptance-gate-dd2b` (from Prompt 12 tip)  
**Date:** 2026-07-23 UTC  
**Method:** Full-tree inspection excluding `node_modules`, `dist`, `.next`

## Executive finding

The repository is a coherent modular monorepo with no TODO/FIXME litter, no skipped tests, no dependency-cruiser violations, and a complete Prompt 0–12 review trail. Residual hygiene items are empty directories, incomplete drizzle intermediate snapshots, and documentation index lag—not structural instability.

## Folder structure

| Area | Path | Notes |
|---|---|---|
| Apps | `apps/{api,web,worker}` | Fastify API, Next.js web, worker heartbeat |
| Domain packages | `packages/*` (14) | platform, database, contracts, organizations, consent, evidence, variables, collection, scoring, qualification, discovery, outreach, opportunities, reporting |
| Config | `config/{completeness,scoring,discovery,outreach,opportunities,import,reporting}` | 26 versioned YAML files |
| Docs | `docs/00`–`14`, `adr`, `prompts`, `01-reviews`, `14-runbooks` | Canonical + reviews |
| Tests (root) | `tests/fixtures/golden-scores` | 9 golden score fixtures; `tests/unit/` empty |
| Tooling | `tooling/` | dependency-cruiser, validate-docs |
| CI | `.github/workflows/ci.yml` | `pnpm validate` on push/PR |

## Architecture

- Layering: UI → contracts/application → domain ports → infrastructure (Drizzle/Postgres).
- Dependency-cruiser: **838 modules, 1811 dependencies, 0 violations** (`pnpm deps:check`).
- Operational state centralized via `@adp/qualification` `OperationalStateService`.
- Consent precedence enforced in `@adp/consent` and consumed by outreach/reporting redaction.
- No circular package dependencies detected by cruiser.

## Dependencies

- Workspace protocol `@adp/*`; Node 24 / pnpm 11.15 / Turbo 2.x.
- Production secrets via env (`SESSION_SECRET`); demo web auth documented as non-production.
- `ADP_REPORTING_PROVIDER=fixture|postgres` mode switch for web dashboards.

## Naming consistency

- Packages: `@adp/<domain>` kebab directories.
- Migrations: sequential `0000`–`0009` with mixed drizzle names and explicit prompt tags (`0004`–`0005`, `0009`).
- Events: `domain.past_tense_action` pattern.
- Enums: snake_case storage keys aligned with operational-state model.

## Unused / dead / empty

| Item | Assessment |
|---|---|
| `packages/discovery/docs/`, `packages/discovery/src/contracts/` | Empty placeholders — non-blocking |
| `packages/database/src/seed/` | Empty; seeds live in `packages/database/seeds/` |
| `tests/unit/` | Empty root folder — non-blocking |
| Duplicate package names | None |

## TODO / FIXME / disabled tests

| Check | Result |
|---|---|
| TODO/FIXME/XXX/HACK in source | **0** |
| `describe.skip` / `it.skip` / `.only` | **0** |
| Temporary feature-flag framework | **None** (env switches only) |

## Debug / development-only configuration

- `.env.example` uses `NODE_ENV=development` and placeholder `SESSION_SECRET`.
- Smoke scripts fall back to `dev-only-change-me-now` when env unset (test/smoke only).
- Logger redacts password/token/SESSION_SECRET keys.
- No production secrets committed.

## Migrations / snapshots

- SQL migrations `0000`–`0009` present and journaled.
- Intermediate drizzle snapshots **missing** for `0001`, `0004`, `0005` (known; latest `0009_snapshot` matches schema — hand-authored SQL risk if regenerating from incomplete history).
- FK identifier truncation NOTICES on long auto names (Postgres 63-char limit) — same pattern across Prompt 5–10; no collisions observed.

## Documentation orphans / index lag

- `docs/prompts/` missing executable packets for Prompts **7–9** (implementation + reviews exist; packets were chat/roadmap-driven).
- `docs/README.md` updated in this gate to link Prompts 10–12 and the `docs/release/` acceptance package.
- Root README links resolve; release package filled by this gate.

## Conclusion

Repository hygiene is **release-grade for engineering**. Remaining issues are documentation catalog completeness and known drizzle snapshot gaps—not dead product code or failing architecture rules.
