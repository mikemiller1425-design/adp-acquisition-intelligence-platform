# ADR-006: Job queue

- Status: Accepted
- Date: 2026-07-22
- Decides: DEC-006

## Context
Imports, recalculation, and exports require durable asynchronous work with outbox compatibility.

## Decision
Use PostgreSQL-backed pg-boss with transactional-outbox compatibility. Prompt 1 defines JobDispatcherPort / handler registry with an in-memory scaffold for tests.

## Consequences
Workers consume the same application services as the API. Production pg-boss wiring arrives with operational jobs.
