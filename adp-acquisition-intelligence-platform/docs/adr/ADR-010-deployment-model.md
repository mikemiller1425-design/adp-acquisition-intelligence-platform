# ADR-010: Deployment model

- Status: Accepted
- Date: 2026-07-22
- Decides: DEC-010

## Context
Release path must support CI validation, immutable artifacts, and safe schema evolution.

## Decision
Use GitHub Actions for validation, immutable container images, controlled forward migrations, and health-gated rolling deployment.

## Consequences
Application rollback does not assume schema rollback. Migration compatibility is tested from Prompt 2 onward.
