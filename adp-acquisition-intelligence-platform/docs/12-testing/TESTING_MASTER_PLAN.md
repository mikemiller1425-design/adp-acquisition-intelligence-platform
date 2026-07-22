# Testing Master Plan

**Version:** 1.1.0

## Strategy

Tests demonstrate business invariants, not implementation trivia. Prefer fast domain unit tests, database/service integration tests, API contract tests, and a smaller number of high-value browser end-to-end tests. All suites use deterministic clocks/IDs and isolated data.

## Test layers

- **Static:** formatting, lint, strict typecheck, unused exports, forbidden dependency/cycle checks, configuration schema validation.
- **Unit:** normalization, value validation, confidence, completeness, score transforms, recommendation ties, transition guards (all parallel dimensions), permission precedence, question selection, response classification.
- **Integration:** repositories/migrations/constraints, transactions/outbox, authorization scopes, import commit/revert, evidence-to-value, score persistence, discovery mapping/recalc, activity/task effects, consent evaluate+block, operational_state_transitions.
- **Contract:** API request/response/error schemas and backward compatibility; job payload versions.
- **Component/accessibility:** tables, forms, dialogs, error/empty/loading/stale states, keyboard and automated accessibility checks.
- **E2E:** critical operator journeys with seeded roles and territory constraints.
- **Non-functional:** performance, security, resilience/idempotency, backup/restore, audit completeness.

## Mandatory scenario matrix

1. CSV with valid, malformed, duplicate, Unicode, oversized, and unauthorized columns; dry run changes nothing; commit reports rows; revert is compensating and audited.
2. Two similarly named firms are not auto-merged; reviewer merge preserves aliases, children, evidence, and history.
3. Unknown, zero, false, not-applicable, contradicted, and stale yield distinct variable/completeness/score behavior.
4. Conflicting evidence reduces confidence and creates a gap; reviewer resolution preserves both evidence records.
5. Identical inputs/version yield identical score/explanation; historical version replay is stable.
6. Low completeness produces provisional/insufficient status; a high raw fit never hides low confidence.
7. Unauthorized territory/user cannot read, mutate, export, merge, override, or transition restricted records.
8. Discovery retains verbatim answer, requires mapping confirmation, supersedes values explicitly, and shows score delta.
9. Outreach cannot proceed after opt-out/restriction/`unknown` permission or without human approval; Phase 1 cannot send externally; denial is audited; scores unchanged.
10. Valid activity/response creates the configured next task; duplicate command does not duplicate activity.
11. Opportunity transition guards, `operational_state_transitions` history, loss reasons, and aging calculations are correct; org `prospect_stage` set to `opportunity` on first open opportunity without clearing research gaps.
12. Dashboard counts equal source fixtures across filters/timezone boundaries; drilldowns and exports reconcile; parallel-dimension filters compose.
13. Parallel states coexist: e.g. `prospect_stage=outreach_active`, `research_status=gaps_open`, `data_freshness_status=stale`, open opportunity with independent `opportunity_stage`; illegal transitions leave prior state.
14. Consent precedence: global suppression > org restriction > channel opt-out > contact permission; expired/revoked inactive; conflicts → most restrictive; import cannot lift opt-out; export masks restricted channels.

Authority for scenarios 9, 11, 13, and 14: [Operational State and Consent Model](../05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md).

## Full Phase 1 E2E

Run the 25-organization scenario in the [Functional Specification](../02-functional/PHASE_1_FUNCTIONAL_SPECIFICATION.md#5-end-to-end-acceptance-scenario) with Administrator, Researcher, Sales, and Reviewer roles. Capture test report, screenshots or trace artifacts for failures, exported files, audit-query evidence, and runtime versions.

## Performance baselines

Establish an agreed representative volume before Prompt 10 (recommended initial fixture: 100k organizations, 300k contacts, 10m variable/evidence/history rows). Test indexed prospect filters (including parallel-dimension indexes), organization 360, score table, dashboard aggregates, 10k-row import, recalculation queue, and large export. Standard read target p95 is under 2 seconds; jobs expose progress and do not exhaust web workers.

## Security and privacy

Test authentication/session controls, authorization object/field/territory scope, injection, XSS output encoding, CSRF where applicable, upload validation, rate limits, secret/PII log redaction, export access/expiry, consent evaluation bypass attempts, audit tamper resistance, dependency scanning, and least-privilege runtime credentials. Perform threat-model review and independent release review.

## Migration and recovery

Apply migrations from empty database and every supported prior release; seed; rollback application version without assuming schema rollback; test concurrent deploy compatibility. Restore an encrypted backup into an isolated environment and verify checksums/counts plus a core workflow.

## Quality gates

No required suite failures, no unresolved critical/high security or architecture finding, no flaky E2E on three consecutive runs, no unexplained fixture drift, no material coverage regression, successful migration/restore rehearsal, and full traceability from exit-contract item to test/manual evidence. Every prompt must complete the [Architecture Review Checklist](../11-implementation/16_ARCHITECTURE_REVIEW_CHECKLIST.md); tests are evidence for that review, not a substitute for it. Numerical coverage thresholds are set in Prompt 1 and may not substitute for meaningful assertions.

## Prompt 4 verified test evidence

Prompt 4 adds collection package coverage across:

- Unit/domain service tests for normalization, mapping, field validation, blank semantics, lifecycle transitions, duplicate explanations, commit/reversal eligibility, merge planning, and consent behavior.
- PostgreSQL 17 integration tests for migration/persistence, dry-run without business mutation, mixed valid/invalid validation, duplicate-review blocking, commit retry/idempotency, provenance proposal ports, consent preservation, audit/outbox ports, import reversal, and merge service behavior.
- Security tests for unsafe CSV inputs, report formula escaping, and unauthorized report/commit/merge access.
- E2E service test for a 25+ organization import with malformed rows, exact and ambiguous duplicates, dry-run, review, commit, provenance, report, and reversal.
- Performance test for 10k-row CSV validation/parsing with duration and heap logging.

## Test ownership

Domain owners maintain unit/golden tests; platform/database owners maintain migration/resilience/security harnesses; web owners maintain component/accessibility tests; QA/release owner maintains E2E and exit evidence. A change that alters behavior updates the tests in the same change.
