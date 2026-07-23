# ADR-004: Identity provider

- Status: Accepted
- Date: 2026-07-22
- Decides: DEC-004

## Context
Authentication must be server-side and enterprise-ready without embedding vendor SDKs in domain logic.

## Decision
Use Microsoft Entra ID through standards-based OIDC behind AuthenticationPort and AuthorizationPort. Prompt 1 ships ports and configuration seams only.

## Consequences
Apps depend on ports, not Entra SDKs directly. Session/OIDC secrets come from environment/secret management.
