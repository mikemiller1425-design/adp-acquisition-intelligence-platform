# ADR-011: Backup and recovery objectives

- Status: Accepted
- Date: 2026-07-22
- Decides: DEC-011

## Context
Exit contract DAT-005 requires encrypted backup/restore rehearsal.

## Decision
RPO ≤ 15 minutes. RTO ≤ 4 hours. Quarterly isolated restore rehearsal is required before/with production release evidence.

## Consequences
RDS backup and restore runbooks are Prompt 12 operational evidence. Prompt 1 records objectives only.
