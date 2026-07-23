# ADR-007: Object storage

- Status: Accepted
- Date: 2026-07-22
- Decides: DEC-007

## Context
Authorized import/export artifacts need durable object storage.

## Decision
Use private Amazon S3 in production with an S3-compatible development adapter. Configuration is validated at startup; buckets are private by default.

## Consequences
Upload/download authorization and malware-scanning seams remain required before production use.
