# ADR-009: Hosting environment

- Status: Accepted
- Date: 2026-07-22
- Decides: DEC-009

## Context
Production topology must support web, API, worker, PostgreSQL, object storage, and secrets.

## Decision
Target AWS using ECS Fargate, RDS Multi-AZ PostgreSQL, S3, and Secrets Manager.

## Consequences
Local development uses Docker Compose PostgreSQL and S3-compatible endpoints. Production hardening completes in Prompt 12.
