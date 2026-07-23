# Prompt 3 Architecture Review

**Review scope:** Prompt 3 variables, evidence, and provenance  
**Checklist:** [Architecture Review Checklist](../11-implementation/16_ARCHITECTURE_REVIEW_CHECKLIST.md)  
**Baseline:** `7da041ae77439f0d0b36d2282fded6d0737ebd63`  
**Reviewed state:** working tree on `cursor/prompt-3-variables-evidence-dd2b` after Prompt 3 documentation and semantic gap-fill tests  
**Reviewer:** cursor-first-pass  
**Reviewed at:** 2026-07-22 UTC

## Verdict

`PASS_WITH_NON_BLOCKING`

No critical or high findings are open. Prompt 3 is architecturally acceptable for Prompt 4 handoff. One low operability finding remains open because local database-backed validation used host PostgreSQL 16.14 while `docker-compose.yml` targets PostgreSQL 17. Critical/high findings block `READY`; none are open.

The unresolved confidence aggregation policy is not a Prompt 3 defect. Prompt 3 records confidence components and intentionally leaves `aggregate_score` null rather than inventing weights.

## Actual diff reviewed

Baseline comparison: `git diff 7da041ae77439f0d0b36d2282fded6d0737ebd63...HEAD`

Changed modules:

- `packages/database`
  - migration `0002_lyrical_daimon_hellstrom.sql`
  - evidence/variable schema exports
  - variable seeds and seed integration
  - Prompt 3 database integration tests
- `packages/evidence`
  - new domain, application services, Postgres repositories, tests, public exports
- `packages/variables`
  - new domain, application services, Postgres repositories, tests, public exports
- `packages/consent`
  - evidence link port/seam and integration test
- `docs`
  - Prompt 3 implementation, review, handoff, and developer guide updates

## Checklist assessment

### A. Specification and scope

- Prompt 3 behavior traces to:
  - [Functional Specification 3.3 and 3.4](../02-functional/PHASE_1_FUNCTIONAL_SPECIFICATION.md)
  - [Variable Dictionary](../05-data/VARIABLE_DICTIONARY.md)
  - [Database Architecture](../05-data/DATABASE_ARCHITECTURE.md)
  - [Repository Blueprint](../06-repository/REPOSITORY_BLUEPRINT.md)
- Unknown, zero, false, `not_applicable`, withheld, contradicted, stale, and AI inference semantics are represented distinctly.
- No Prompt 4+ import, scoring, discovery, outreach, dashboard, or UI queue behavior was added.
- No Phase 2 referral workflow, autonomous outbound sending, or predictive weight learning was added.

### B. Architecture and dependency rules

- `@adp/evidence` and `@adp/variables` follow local domain/application/infrastructure package patterns.
- Application services depend on domain ports; Postgres adapters implement those ports and depend on `@adp/database`.
- Public exports are intentional through each package `src/index.ts`.
- Consent depends on an evidence-link port seam, not on evidence package internals.
- No circular package dependency was identified by `pnpm deps:check`.

### C. Interface and compatibility review

- Public service commands are typed and runtime domain validation is applied before writes for source metadata, evidence effective windows, confidence components, variable keys, typed values, and lifecycle transitions.
- New package APIs are internal workspace package contracts; no external HTTP/API contract changed.
- Idempotency is explicit for evidence content hashes, research observation correlation IDs, and evidence link `onConflictDoNothing`.
- Manual override writes require actor metadata at the database level.

### D. Data architecture and integrity

- Prompt 3 schema adds the nine expected provenance/variable tables.
- FK behavior defaults to restrict or set-null where history must survive actor deletion.
- Partial unique indexes enforce one current non-contradicted variable value per subject/definition.
- Evidence material fields are immutable after insert.
- Active variable definition version material fields are immutable; replacement publish may only retire the old active version.
- Supersession and contradiction history are preserved.
- The active-version retirement trigger issue found during review was resolved and covered by integration test.

### E. Scoring and decision integrity

- No scoring or recommendation engine was implemented.
- Confidence components are stored and validated in the unit interval.
- `ConfidenceAssessmentService` leaves `aggregateScore` null with an explanation when no approved aggregation policy exists.
- AI inference does not masquerade as verified fact.

### F. Security, privacy, and authorization

- Service-level allow-list capability checks cover evidence, observation, confidence, source, variable definition, and variable value capabilities.
- Source metadata rejects credential-like keys.
- No secrets were added to source, docs, or fixtures.
- Audit/outbox ports are available for consequential actions, consistent with existing package seams.
- Full production authz, object-level access, and UI restrictions remain future composition work.

### G. Reliability and operability

- Database-backed tests use advisory locking and reset only `_test` databases.
- Multi-write value confirmation/supersession is transactionally covered, including rollback on later port failure.
- Evidence and variable services emit audit/outbox events through optional ports.
- Local validation used PostgreSQL 16.14; compose PostgreSQL 17 validation remains a low, non-blocking release-hardening item.

### H. Performance and scale

- Prompt 3 adds indexes for subject/time evidence lookup, source lookup, reviewer status, variable definition lookup, variable history lookup, current value uniqueness, confidence subject lookup, research observation lifecycle, and evidence joins.
- No high-volume list/dashboard query surface was introduced.
- Prompt 4+ import and scoring batch performance remain future scope.

### I. Testing quality

Tests prove Prompt 3 semantic behavior rather than implementation details:

- `packages/database/src/__tests__/database.integration.test.ts`
- `packages/evidence/src/__tests__/evidence-services.test.ts`
- `packages/variables/src/__tests__/value-validation.test.ts`
- `packages/variables/src/__tests__/variable-values.integration.test.ts`
- `packages/consent/src/__tests__/consent-evidence-link.integration.test.ts`

Gap-fill tests added during this review:

- active definition version replacement while preserving active-version material immutability
- manual override original-value lineage
- contradicted value preservation and effective-current exclusion

### J. UI, dashboard, and accessibility review

Not applicable. Prompt 3 adds no UI/dashboard behavior.

### K. Documentation and repository hygiene

- Prompt 3 implementation, handoff, architecture review, evidence guide, and variable definition guide were added.
- Repository Blueprint, Database Architecture, setup, migration, and documentation index files were updated.
- Naming and layout follow existing package conventions.
- No generated sensitive files were introduced.

### L. Regression and next-prompt readiness

- Prompt 3 direct consumers are database, consent, evidence, and variables package tests.
- Prompt 4 can build on variables/evidence without hidden scoring or import assumptions.
- Deferred work is documented in the handoff and does not block Prompt 4.

## Findings

```yaml
id: AR-P3-001
review_scope: prompt-3
severity: high
category: data-architecture
status: resolved
requirement_source: docs/11-implementation/16_ARCHITECTURE_REVIEW_CHECKLIST.md#D.-Data-architecture-and-integrity
affected_files:
  - packages/database/migrations/0002_lyrical_daimon_hellstrom.sql
  - packages/variables/src/__tests__/variable-values.integration.test.ts
evidence:
  - "Initial trigger rejected any UPDATE to active variable_definition_versions rows."
  - "VariableDefinitionService.publishVersion retires the prior active version before activating the replacement."
finding: Active variable definition version immutability blocked normal replacement-version publication.
impact: Future definition versioning would fail after the first active version, blocking safe configuration evolution.
required_action: Allow only active-to-retired lifecycle transition while keeping all material fields immutable.
verification: "TEST_DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/variables test: passed with replacement-version integration fixture."
owner: engineering
target_prompt: 3
resolved_by: "Prompt 3 documentation/gap-fill commit"
```

```yaml
id: AR-P3-002
review_scope: prompt-3
severity: low
category: operability
status: open
requirement_source: docs/11-implementation/16_ARCHITECTURE_REVIEW_CHECKLIST.md#G.-Reliability-and-operability
affected_files:
  - docker-compose.yml
  - packages/database/migrations/0002_lyrical_daimon_hellstrom.sql
evidence:
  - "Local validation database: PostgreSQL 16.14 host service"
  - "Compose target image: postgres:17"
  - "docker: command not found"
finding: Local database-backed validation ran on PostgreSQL 16.14 while compose targets PostgreSQL 17.
impact: Low compatibility risk remains until the same migration and integration suites run on the compose PostgreSQL 17 image or CI equivalent.
required_action: Run Prompt 3 migration and integration suites against PostgreSQL 17 before release hardening.
verification: Record PostgreSQL 17 command output in a future handoff or CI artifact.
owner: engineering
target_prompt: 4
resolved_by: null
```

## Required review output

```yaml
review:
  scope: prompt-3
  baseline: 7da041ae77439f0d0b36d2282fded6d0737ebd63
  reviewed_commit: working-tree-after-prompt-3-docs-and-gap-fill-tests
  result: PASS_WITH_NON_BLOCKING_FINDINGS
  changed_modules:
    - packages/database
    - packages/evidence
    - packages/variables
    - packages/consent
    - docs
  commands_and_artifacts:
    - "pnpm install --frozen-lockfile: passed"
    - "pnpm validate: passed"
    - "pnpm validate:docs: passed"
    - "TEST_DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/database test:integration: passed"
    - "TEST_DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/evidence test: passed"
    - "TEST_DATABASE_URL=postgres://adp:adp@localhost:5432/adp_acquisition_test pnpm --filter @adp/variables test: passed"
  findings:
    - AR-P3-001
    - AR-P3-002
  deferred_findings:
    - AR-P3-002
  specification_deviations: []
  exit_contract_evidence_updated: []
  next_prompt_ready: true
  reviewer: cursor-first-pass
  reviewed_at: 2026-07-22T22:10:00Z
```
