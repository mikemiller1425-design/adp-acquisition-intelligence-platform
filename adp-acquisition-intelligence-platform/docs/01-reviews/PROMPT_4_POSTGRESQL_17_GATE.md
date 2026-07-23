# Prompt 4 — PostgreSQL 17 Gate

**Status:** PASSED  
**Recorded at:** 2026-07-22 UTC  
**Branch:** `cursor/prompt-4-collection-identity-dd2b`  
**Prerequisite:** Prompt 3 recommended READY FOR PROMPT 4 with no open critical/high findings.

## Exact PostgreSQL version

```text
PostgreSQL 17.10 (Ubuntu 17.10-1.pgdg24.04+1) on x86_64-pc-linux-gnu,
compiled by gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0, 64-bit
```

Cluster: host-installed PGDG package on port `5433` (Docker was unavailable in this environment).

## Procedure

1. Started an empty PostgreSQL 17 cluster.
2. Created `adp_acquisition` and `adp_acquisition_test` owned by role `adp`.
3. Applied the existing migration chain (`0000`, `0001`, `0002`) to both databases **before** creating migration `0003`.
4. Ran Prompt 2 and Prompt 3 database-backed package suites against PostgreSQL 17.
5. Ran seeds successfully against the PostgreSQL 17 test database.

## Results

| Check | Result |
|---|---|
| Empty-DB migrations (`0000`–`0002`) | Passed |
| Seed (`@adp/database db:seed`) | Passed — 56 variable definitions + foundation fixtures |
| `@adp/database` integration | 10 passed |
| `@adp/organizations` | 14 passed |
| `@adp/consent` | 22 passed |
| `@adp/qualification` | 18 passed |
| `@adp/evidence` | 8 passed |
| `@adp/variables` | 18 passed |

Connection used for evidence:

```bash
DATABASE_URL=postgres://adp:adp@127.0.0.1:5433/adp_acquisition_test
TEST_DATABASE_URL=postgres://adp:adp@127.0.0.1:5433/adp_acquisition_test
```

## Repair actions

None required. Identifier-truncation notices for long FK names were observed as PostgreSQL notices only; migrations completed successfully and existing suites remained green.

## Gate decision

Proceed with Prompt 4 migration `0003` and collection implementation.
