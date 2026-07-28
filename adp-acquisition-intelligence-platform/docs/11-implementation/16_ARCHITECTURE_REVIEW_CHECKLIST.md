# Architecture Review Checklist

**Version:** 1.0.0  
**Status:** Canonical prompt-completion review standard  
**Applies to:** Every implementation prompt, significant remediation, and final Phase 1 audit

## Purpose

This checklist turns the implementation agent into the first-pass architect and reviewer. It does not replace automated tests, human approval, security review, or the [Phase 1 Exit Contract](../13-exit-contract/PHASE_1_EXIT_CONTRACT.md). It determines whether the current prompt's changes are architecturally acceptable before the prompt is declared complete.

The review MUST examine the actual diff, affected modules, changed interfaces, migrations, configuration, tests, and dependency graph. It MUST cite evidence. A generic statement such as “architecture looks good” is not a review.

## Review levels

### Prompt-level review

Run after implementation and tests for every prompt. Review the diff and its direct and transitive consumers. Do not expand into unrelated repository cleanup. Pre-existing findings outside the changed scope are logged separately and do not become silently owned by the prompt.

### Milestone review

Run after Prompts 5, 8, and 11. Review all modules delivered since the previous milestone, integration seams, cumulative dependency drift, data migrations, performance, and specification traceability.

### Final repository review

Run during Prompt 12 across the complete repository and every Phase 1 requirement. Include production configuration, operational readiness, security/privacy review, recovery rehearsal, and exit-contract evidence.

## Required inputs

The reviewer MUST inspect:

- The current prompt, acceptance criteria, and authoritative canonical documents.
- Repository status and the full change diff from the prompt's baseline.
- Updated repository tree and public package exports.
- Dependency/cycle report and affected-call graph where available.
- Database schema and migrations, API/job contracts, configuration, and feature flags.
- New and changed tests plus the commands/results from required suites.
- Documentation, ADRs, runbooks, exit-contract evidence, and unresolved findings.
- Generated artifacts only when they affect runtime, deployment, or reviewability.

## Severity and disposition

| Severity | Definition | Prompt effect |
|---|---|---|
| Critical | Credible data loss, security/privacy breach, authorization bypass, audit corruption, unreproducible scoring, broken release path, or fundamental specification violation | Blocks completion and release; no waiver in prompt review |
| High | Architectural boundary breach, incorrect business behavior, unsafe migration, missing required test/control, material performance failure, or incompatible public contract | Blocks prompt completion until resolved |
| Medium | Maintainability, operability, accessibility, or test weakness with bounded impact and no immediate correctness/security failure | May defer only with owner, rationale, compensating control, and target prompt/date |
| Low | Local clarity, consistency, or optimization improvement | May defer and track; does not block alone |

Allowed statuses: `open`, `resolved`, `accepted_risk`, and `not_applicable`. Critical and high findings cannot be `accepted_risk` for prompt completion. Release exceptions additionally follow the Exit Contract.

## Finding format

```yaml
id: AR-001
review_scope: prompt-5
severity: critical | high | medium | low
category: architecture
status: open | resolved | accepted_risk | not_applicable
requirement_source: docs/path.md#section
affected_files: []
evidence: []
finding: Clear statement of the observed problem.
impact: User, data, security, operational, or future-prompt consequence.
required_action: Smallest sufficient correction.
verification: Test, inspection, metric, or document proving resolution.
owner: team-or-role
target_prompt: 5
resolved_by: null
```

Every finding needs a stable ID. Resolution evidence is appended; the original finding is never erased.

## A. Specification and scope

- [ ] Changed behavior traces to the functional specification, entity catalog, variable dictionary, scoring specification, state machine, UI catalog, or dashboard specification.
- [ ] The implementation satisfies every current-prompt acceptance criterion and reports any deviation.
- [ ] Business terminology and enum semantics match canonical definitions.
- [ ] Unknown, zero, false, not applicable, withheld, contradicted, and stale remain distinct.
- [ ] Phase 2 referral workflows, partner economics, and network behavior have not leaked into Phase 1.
- [ ] Autonomous outbound sending, predictive weight learning, and other explicit Phase 1 non-goals remain absent.
- [ ] No speculative “while here” features or dormant user-facing controls were added.
- [ ] Any canonical-document conflict has an ADR and coordinated specification update rather than an implicit code decision.

## B. Architecture and dependency rules

- [ ] Dependency direction follows `UI → contracts/application → domain ports`, with infrastructure implementing ports.
- [ ] UI, routes, jobs, and repositories do not contain duplicated business rules.
- [ ] Cross-context operations use public application interfaces rather than another context's repository or tables.
- [ ] Public package exports are intentional; internals are not accidentally exposed.
- [ ] No circular package or module dependencies were introduced.
- [ ] New abstractions have at least two semantically aligned consumers or a documented boundary reason.
- [ ] Shared modules contain genuine cross-cutting primitives, not domain-specific convenience logic.
- [ ] Transactions and domain event boundaries are explicit and do not span unnecessary contexts.
- [ ] Synchronous and asynchronous paths invoke the same domain/application behavior.
- [ ] Future extraction seams do not create distributed-system complexity in the Phase 1 modular monolith.

## C. Interface and compatibility review

- [ ] Public commands, queries, APIs, events, and jobs document inputs, outputs, validation, authorization, side effects, errors, versioning, and idempotency.
- [ ] Request and response schemas are runtime-validated and type-safe.
- [ ] Breaking contract changes include consumer inventory, migration plan, compatibility window, and contract tests.
- [ ] Pagination, filtering, sorting, and error envelopes remain stable and allowlisted.
- [ ] Retryable operations use idempotency keys or equivalent deduplication.
- [ ] Concurrency-sensitive writes use record versions, locks, or another documented control.
- [ ] Time, currency, ranges, percentages, and identifiers preserve units and timezone semantics.

## D. Data architecture and integrity

- [ ] Schema changes match the Database Architecture and entity ownership rules.
- [ ] Primary/foreign keys, uniqueness, check constraints, indexes, nullability, and delete behavior enforce meaningful invariants.
- [ ] Migrations succeed from an empty schema and every supported prior schema.
- [ ] Migration locking, backfill, deploy ordering, rollback compatibility, and recovery implications were reviewed.
- [ ] Archive, supersession, immutable snapshot, and append-only audit semantics are preserved.
- [ ] Evidence provenance and original discovery answers cannot be silently overwritten.
- [ ] Published variable/score/template definitions and historical score results remain immutable.
- [ ] Import commit/revert, merge, stage transition, and related multi-write actions are transactional.
- [ ] Data retention, hard deletion, export expiry, and privacy deletion behavior are explicit.
- [ ] Query plans/indexes are reviewed for new high-volume access patterns.

## E. Scoring and decision integrity

- [ ] Score calculations are deterministic for identical inputs and version.
- [ ] Input snapshots, definition version, factor contributions, confidence, completeness, status, and calculation time are retained.
- [ ] Missing required inputs yield provisional/insufficient states rather than invented precision.
- [ ] Fit, confidence, completeness, urgency, revenue, and accessibility remain separate outputs.
- [ ] Low-confidence evidence affects confidence according to policy and does not masquerade as verified fact.
- [ ] Recommendation, tie-break, disqualifier, and override behavior matches the scoring specification.
- [ ] Manual overrides retain the computed result, actor, reason, and audit history.
- [ ] Published weight/rubric changes create a new version and pass golden replay.
- [ ] Outcome analytics do not automatically retrain or alter Phase 1 weights.

## F. Security, privacy, and authorization

- [ ] Authentication and server-side role/permission/territory checks cover every changed read, write, merge, override, export, and administrative action.
- [ ] Object- and field-level access prevents identifier substitution and cross-territory leakage.
- [ ] Inputs, uploads, rendered content, database access, and outbound links are protected against injection and unsafe file behavior.
- [ ] Secrets, credentials, PII, evidence excerpts, and sensitive values are not exposed in source, logs, errors, telemetry, or fixtures.
- [ ] Audit events capture consequential actions without becoming a secondary sensitive-data store.
- [ ] Export generation and download revalidate authorization and enforce expiry.
- [ ] Rate limiting, session/CSRF protections, and abuse controls are applied where relevant.
- [ ] Outreach restrictions and opt-outs are enforced by services, not UI convention.
- [ ] Dependencies and runtime images pass required vulnerability/license policy checks.

## G. Reliability and operability

- [ ] Error handling uses the central taxonomy and preserves actionable context without sensitive leakage.
- [ ] Partial failure leaves data consistent and exposes retry/recovery behavior.
- [ ] Jobs are idempotent, observable, bounded, retry-aware, and safe against poison messages.
- [ ] Transactional outbox or equivalent prevents committed state from losing required asynchronous work.
- [ ] Logs, metrics, traces, correlation IDs, and audit events make the changed workflow diagnosable.
- [ ] Health/readiness checks reflect new critical dependencies.
- [ ] Timeouts, retry limits, batch sizes, and feature flags are centralized and validated.
- [ ] Operational runbooks cover new failure and recovery modes.
- [ ] Backup/restore and retention assumptions remain valid after data changes.

## H. Performance and scale

- [ ] The change is assessed against representative Phase 1 volume, not toy fixtures alone.
- [ ] List/dashboard queries avoid N+1 access, unbounded scans, unstable pagination, and unnecessary payloads.
- [ ] CPU-, memory-, network-, and storage-intensive work is bounded or asynchronous.
- [ ] Cache and aggregate freshness is explicit; invalidation cannot show misleading results.
- [ ] Imports, score recalculation, discovery updates, and exports expose progress and backpressure.
- [ ] Performance tests or query-plan evidence cover materially changed hot paths.
- [ ] Any accepted performance regression has quantified impact, owner, and target remediation.

## I. Testing quality

- [ ] Tests prove behavior and invariants rather than mirror implementation details.
- [ ] Happy, boundary, failure, permission, retry, concurrency, and idempotency paths are covered where relevant.
- [ ] Fixtures include unknown, zero, false, not-applicable, stale, contradicted, low-confidence, duplicate, restricted, and opt-out cases.
- [ ] Database constraints and migrations have integration coverage.
- [ ] API/job contracts have compatibility tests.
- [ ] Score changes have golden, boundary, property, and historical-version replay tests.
- [ ] Workflow changes have allowed/blocked transition and audit-history tests.
- [ ] UI changes cover loading, empty, partial, stale, permission-denied, validation, error, and success states.
- [ ] Existing tests were not weakened, skipped, or rewritten solely to accept incorrect behavior.
- [ ] Flaky tests are repaired or explicitly block completion under the Testing Master Plan.

## J. UI, dashboard, and accessibility review

- [ ] UI matches the screen/dashboard catalogs and keeps business logic in services.
- [ ] Forms show validation, provenance/confidence requirements, and safe conflict handling.
- [ ] Tables support stable pagination/sort/filter, clear units, timezone, and restricted-cell explanations.
- [ ] Dashboard metrics state numerator, denominator, date window, exclusions, timezone, and freshness.
- [ ] Drilldowns and exports reconcile to the displayed metric/filter context.
- [ ] Consequential actions provide impact preview, confirmation, result, and recovery guidance.
- [ ] Keyboard navigation, focus, labels, semantic structure, contrast, and assistive-technology behavior pass required checks.
- [ ] Responsive behavior and large-data presentation remain usable.

## K. Documentation and repository hygiene

- [ ] Repository Blueprint responsibilities and status reflect actual files and owners.
- [ ] Public interfaces, configuration, migrations, setup, and operational behavior are documented.
- [ ] ADRs explain material architectural choices and rejected alternatives.
- [ ] No duplicate, dead, orphaned, debug, temporary, or generated-sensitive files were introduced.
- [ ] Naming, imports, formatting, and module layout follow repository conventions.
- [ ] Comments explain decisions and invariants, not obvious syntax.
- [ ] The prompt handoff lists files, migrations, commands/results, deviations, findings, limitations, and next-prompt readiness.
- [ ] Exit-contract evidence is updated only for checks genuinely proven by this prompt.

## L. Regression and next-prompt readiness

- [ ] Direct and transitive consumers of changed contracts were identified and tested.
- [ ] Existing supported data and workflows remain compatible.
- [ ] Feature flags safely isolate incomplete work and default appropriately.
- [ ] Deferred work has no hidden runtime dependency in the next prompt.
- [ ] Open medium/low findings have owner, rationale, target, and tracking location.
- [ ] The repository is runnable and the next prompt's prerequisites are explicitly confirmed.

## Required review output

```yaml
review:
  scope: prompt-N
  baseline: commit-or-tag
  reviewed_commit: commit-or-working-tree
  result: PASS | PASS_WITH_NON_BLOCKING_FINDINGS | FAIL_REMEDIATION_REQUIRED | BLOCKED_BY_SPECIFICATION_CONFLICT
  changed_modules: []
  commands_and_artifacts: []
  findings: []
  deferred_findings: []
  specification_deviations: []
  exit_contract_evidence_updated: []
  next_prompt_ready: false
  reviewer: cursor-first-pass
  reviewed_at: UTC-timestamp
```

## Decision rules

- `PASS`: no open findings and every applicable check has evidence.
- `PASS_WITH_NON_BLOCKING_FINDINGS`: no critical/high findings; every open medium/low finding is owned and time-bounded.
- `FAIL_REMEDIATION_REQUIRED`: any critical/high finding, missing required evidence, failed required test, or unowned material risk.
- `BLOCKED_BY_SPECIFICATION_CONFLICT`: implementation cannot proceed without resolving contradictory or absent authoritative behavior.

After remediation, rerun affected automated checks and the relevant checklist sections. Do not merely change the finding status. The completion report MUST link verification evidence and preserve the review history.

## Relationship to other controls

- The [Implementation Constitution](IMPLEMENTATION_CONSTITUTION.md) governs how work is performed.
- This checklist reviews each prompt's architecture and implementation evidence.
- The [Testing Master Plan](../12-testing/TESTING_MASTER_PLAN.md) defines test strategy and release quality gates.
- The [Phase 1 Exit Contract](../13-exit-contract/PHASE_1_EXIT_CONTRACT.md) determines whether the complete product may be released.

## Phase 1.2 pointer

Phase 1.2 research-run orchestration reviews are recorded in [PHASE_1_2_ARCHITECTURE_REVIEW.md](../01-reviews/PHASE_1_2_ARCHITECTURE_REVIEW.md). Fixture-pilot orchestration is in scope; enabling live/archive egress or closing RB-014–017 is not.


