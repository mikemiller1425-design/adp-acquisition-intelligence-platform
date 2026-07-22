# ADR-012: Data retention policy baselines

- Status: Accepted
- Date: 2026-07-22
- Decides: DEC-012

## Context
Exports, imports, logs, jobs, business records, and audit events need retention defaults for technical enforcement.

## Decision
Central retention configuration defaults:
- Exports: 24 hours
- Raw import artifacts: 30 days
- Application logs: 30 days
- Terminal job payloads: 30 days
- Prospect business records and evidence excerpts: 7 years after archive
- Audit events: 7 years

These values require security, privacy, product, and legal validation before production. This ADR does **not** claim legal compliance.

## Consequences
`loadConfig()` exposes retention settings with `requiresLegalValidation: true`. Production policy sign-off remains a human gate.
