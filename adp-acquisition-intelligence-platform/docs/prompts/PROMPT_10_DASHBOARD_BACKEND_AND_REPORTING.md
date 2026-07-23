# ADP Acquisition Intelligence Platform
## Phase 1 — Prompt 10: Dashboard Backend and Reporting

**Canonical packet path:** `docs/prompts/PROMPT_10_DASHBOARD_BACKEND_AND_REPORTING.md`  
**Roadmap objective:** Dashboard backend/reporting  
**Depends on:** Prompts 2–9 (accepted through Prompt 9 READY FOR PROMPT 10)  
**Next:** Prompt 11 (Web UX and all dashboards)

You are implementing Prompt 10 of the Phase 1 roadmap.

Prompt 10 begins only after Prompt 9 is complete and its architecture review recommends READY FOR PROMPT 10.

This prompt implements the **permission-scoped reporting backend** that freezes metric definitions and serves dashboard queries, saved views, and CSV/asynchronous exports. It does **not** implement dashboard UI screens (Prompt 11) or Phase 1 hardening/acceptance (Prompt 12).

--------------------------------------------------
AUTHORITATIVE DOCUMENTS
--------------------------------------------------

Read and validate against:

- PHASE_1_FUNCTIONAL_SPECIFICATION.md
- PHASE_1_TECHNICAL_ARCHITECTURE.md
- DASHBOARD_SPECIFICATION.md (D1–D8 + shared behavior + acceptance tests)
- UI_SCREEN_CATALOG.md (backend contracts consumed later by UI-01…UI-21, UI-26)
- OPERATIONAL_STATE_AND_CONSENT_MODEL.md
- WORKFLOW_STATE_MACHINE.md
- BUSINESS_ENTITY_CATALOG.md
- DATABASE_ARCHITECTURE.md
- IMPLEMENTATION_CONSTITUTION.md
- IMPLEMENTATION_ROADMAP.md
- TESTING_MASTER_PLAN.md
- PHASE_1_EXIT_CONTRACT.md / phase_1_exit_contract.yaml (DSH-001…DSH-005)
- 16_ARCHITECTURE_REVIEW_CHECKLIST.md
- REPOSITORY_BLUEPRINT.md (`packages/reporting/...`)
- All ADRs and accepted Prompt 0–9 architecture reviews / handoffs

If this prompt conflicts with canonical documentation, stop and report the conflict instead of guessing.

--------------------------------------------------
BASELINE AND PRE-IMPLEMENTATION GATE
--------------------------------------------------

Before coding:

1. Confirm Prompt 9 recommends READY FOR PROMPT 10.
2. Record the exact baseline commit SHA.
3. Validate migrations `0000`–`0008` on PostgreSQL 17.
4. Run `pnpm validate` (or the repository’s required baseline suite).
5. Confirm opportunity pipeline query ports exist for D7 consumption.
6. Confirm consent masking rules exist for export redaction.
7. Inventory reporting placeholders, blueprint entries, and exit-contract DSH items.

Do not create the next migration until the baseline passes.

--------------------------------------------------
SCOPE
--------------------------------------------------

Implement:

- Machine-readable metric definitions for dashboards D1–D8 (subject, numerator, denominator, time basis, excluded states, timezone, refresh, drill-down query key)
- Permission-scoped dashboard query services (filters across parallel operational dimensions)
- Paginated/sortable table query contracts for prospect/research/scoring/discovery/outreach/opportunity/performance views
- Saved views (user-scoped filter/column/sort persistence; restore parity)
- CSV export job model: synchronous small exports and asynchronous large exports with expiry
- Channel-field masking/omission for restricted/opted-out/unknown permission with explicit reason
- Export metadata: active filters, columns, generated time, requesting user, data classification notice
- Fixture-backed metric reconciliation tests (no fabricated zeros)
- Audit/outbox events for saved-view and export lifecycle
- Documentation, architecture review, exit-contract DSH evidence updates

Do not implement:

- Dashboard UI pages or chart widgets (Prompt 11)
- Full UI catalog screens beyond backend contracts (Prompt 11)
- Autonomous email/LinkedIn send
- Predictive model training or auto weight updates (D8 informs calibration only)
- CRM sync, referrals, proposals, billing
- Prompt 12 security/performance acceptance package (may document targets and add bounded query-plan tests)

--------------------------------------------------
DOMAIN MODEL
--------------------------------------------------

Implement or reconcile:

1. MetricDefinition / MetricDefinitionVersion (config + optional DB catalog)
2. DashboardQueryRequest / DashboardQueryResult
3. SavedView
4. ExportJob
5. ExportRedactionPolicy
6. ReportingAuthorizationScope (role/territory/owner)

Use repository blueprint naming: `@adp/reporting`, `dashboard-query-service`, `export-service`.

--------------------------------------------------
DATABASE REQUIREMENTS
--------------------------------------------------

Create the next sequential migration (`0009`) through approved tooling.

Support tables equivalent to:

- `saved_views`
- `export_jobs`
- Optional: `metric_definitions` / `metric_definition_versions` if not config-only

Required characteristics:

- User/owner attribution for saved views and exports
- Dashboard key / view key constraints (D1–D8 and named table views)
- Filter/column/sort JSON with schema validation
- Export status lifecycle (pending/running/completed/failed/expired)
- Expiry timestamps for async artifacts
- Idempotency keys for export requests
- Indexes for owner, dashboard key, status, expires_at
- Audit/outbox integration

Do not duplicate organization, score, outreach, opportunity, or consent tables.

--------------------------------------------------
METRIC AND QUERY REQUIREMENTS
--------------------------------------------------

Freeze Phase 1 metric definitions for D1–D8 per DASHBOARD_SPECIFICATION.md.

Rules:

- Parallel dimensions (`prospect_stage`, `research_status`, `outreach_status`, `data_freshness_status`, `opportunity_stage`) are independently filterable; never infer one from another.
- Rates expose numerator and denominator; suppress misleading percentages for tiny cohorts (document threshold).
- Cached/as-of timestamps are returned when applicable.
- Empty results explain emptiness; errors never fabricate zeros.
- Permission scope is server-enforced.
- Outreach “contacted” success metrics exclude blocked attempts.
- D8 does not auto-update score weights.

Provide drill-down query keys that Prompt 11 can bind to filtered tables.

--------------------------------------------------
SAVED VIEWS AND EXPORTS
--------------------------------------------------

Saved views:

- Persist filters, columns, sort, dashboard/view key, name, owner
- Restore must reproduce query inputs exactly
- Permission scope re-evaluated on restore

Exports:

- Reproduce active filters and selected columns
- Include generated time, requesting user, classification notice
- Mask or omit restricted channel fields with reason
- Large exports are asynchronous, progress-visible, and expire
- No secrets or full source excerpts in CSV

--------------------------------------------------
API AND SERVICE CONTRACTS
--------------------------------------------------

Implement `@adp/reporting` services for:

- Metric catalog listing
- Dashboard aggregate queries (D1–D8)
- Table queries with pagination/sort/filter
- Saved view CRUD/restore
- Export create/status/download-metadata
- Authorization/territory scoping ports

Keep business logic out of controllers and UI. Thin API routes may remain deferred if apps are shells, but Zod/contracts and service tests are required.

--------------------------------------------------
AUDIT AND OUTBOX EVENTS
--------------------------------------------------

Emit transactional events including:

- `reporting.metric_catalog_loaded` (optional operational)
- `reporting.dashboard_queried` (may be sampled/high-volume; prefer audit metadata without PII dumps)
- `reporting.saved_view_created`
- `reporting.saved_view_updated`
- `reporting.saved_view_deleted`
- `reporting.export_requested`
- `reporting.export_completed`
- `reporting.export_failed`
- `reporting.export_expired`
- `reporting.export_redaction_applied`

Use existing envelopes and outbox semantics. `aggregateType` must be valid `subjectTypeEnum` values.

--------------------------------------------------
TESTING REQUIREMENTS
--------------------------------------------------

Unit:

- Metric formula fixtures for each D1–D8 primary count/rate
- Tiny-cohort percentage suppression
- Parallel-dimension filter independence
- Redaction policy for restricted/opted-out/unknown channels
- Saved-view restore parity

Integration:

- Permission-scoped queries deny cross-territory leakage
- Saved view CRUD
- Sync export + async export lifecycle/expiry
- Fixture reconciliation for known organization/score/opportunity sets
- Audit/outbox for export and saved views

Regression:

- Prompt 1–9 suites remain green
- Consent precedence unchanged
- Opportunity pipeline queries remain intact

Performance:

- Document retrieval targets for filtered tables
- Add bounded fixtures and pagination tests; do not claim 100k-org production volume unless fixtures exist

--------------------------------------------------
DOCUMENTATION AND REVIEW
--------------------------------------------------

Create/update:

- `docs/01-reviews/PROMPT_10_BASELINE_GATE.md` (PASS)
- `docs/01-reviews/PROMPT_10_ARCHITECTURE_REVIEW.md`
- `docs/01-reviews/PROMPT_10_HANDOFF.md` recommending READY FOR PROMPT 11
- `docs/10-dashboards/REPORTING_MODEL.md` (metric/query/export contracts)
- `config/reporting/*.yaml` metric definitions
- Exit contract DSH-001…DSH-005 evidence for backend-satisfied portions; UI-only portions remain pending for Prompt 11 where applicable
- Blueprint status for reporting package

Run 16_ARCHITECTURE_REVIEW_CHECKLIST.md. Repair blocking findings.

--------------------------------------------------
REQUIRED COMPLETION REPORT
--------------------------------------------------

Return:

1. Branch name
2. Commit SHA
3. Draft PR URL
4. Baseline commit
5. Migration and tables
6. Metric catalog summary (D1–D8)
7. Query/saved-view/export model
8. Redaction/permission behavior
9. Audit/outbox events
10. Commands and results
11. Test counts
12. Architecture-review result
13. Open findings
14. Deferred work (explicit Prompt 11/12 items)
15. Scope confirmation
16. Recommendation: READY or NOT READY FOR PROMPT 11

--------------------------------------------------
EXIT CRITERIA
--------------------------------------------------

Prompt 10 is complete only when:

- Metric definitions for D1–D8 are versioned and fixture-tested.
- Dashboard/table query contracts are permission-scoped and parallel-dimension aware.
- Saved views restore filter/column/sort parity.
- Exports reproduce view metadata and apply channel redaction.
- Async exports expire.
- No dashboard UI was implemented.
- All required tests pass.
- Architecture review has no blocking findings.
- Handoff recommends READY FOR PROMPT 11.
