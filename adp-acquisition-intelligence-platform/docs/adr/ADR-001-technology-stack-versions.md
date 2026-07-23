# ADR-001: Technology stack versions

- Status: Accepted
- Date: 2026-07-22
- Decides: DEC-001

## Context
Prompt 1 requires pinned runtime and framework versions for reproducible foundation scaffolds.

## Decision
Use Node.js 24 LTS, TypeScript 5.9, Next.js 16 App Router, React 19, and Fastify 5.

## Consequences
All apps and packages target Node 24. CI uses Node 24. Business semantics are unchanged.
