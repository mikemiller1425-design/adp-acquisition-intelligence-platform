# ADR-002: Monorepo tooling

- Status: Accepted
- Date: 2026-07-22
- Decides: DEC-002

## Context
The repository blueprint requires a TypeScript monorepo with enforced dependency direction.

## Decision
Use pnpm 11 workspaces and Turborepo 2, with dependency-cruiser rules forbidding circular dependencies, package→app imports, and contracts importing other packages.

## Consequences
Frozen lockfiles are required in CI. Boundary violations fail validation.
