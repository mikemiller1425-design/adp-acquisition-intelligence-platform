# ADR-008: Observability

- Status: Accepted
- Date: 2026-07-22
- Decides: DEC-008

## Context
Central logging and telemetry are Prompt 1 exit requirements.

## Decision
Use Pino structured redacted logging and OpenTelemetry-compatible telemetry conventions (`OTEL_SERVICE_NAME`).

## Consequences
Secrets and PII paths are redacted. Correlation IDs are first-class in error envelopes.
