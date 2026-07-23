# ADR-005: Database ORM / query layer

- Status: Accepted
- Date: 2026-07-22
- Decides: DEC-005

## Context
Prompt 1 needs a persistence seam; Prompt 2 will own schemas and migrations.

## Decision
Use PostgreSQL 17 and Drizzle ORM / Drizzle Kit beginning in Prompt 2. Prompt 1 creates only the connection/ping seam in `@adp/database` with no business schema or migrations.

## Consequences
No business migrations exist after Prompt 1. Forward-only production migrations start in Prompt 2.
