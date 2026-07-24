# Population Operations Runbook

**Version:** 1.0.0  
**Status:** Phase 1.1 controlled pilot  
**Related:** [Target Universe Ingestion](TARGET_UNIVERSE_INGESTION.md), [Approved Source Registry](APPROVED_SOURCE_REGISTRY.md), [Public Source Security Model](PUBLIC_SOURCE_SECURITY_MODEL.md)

## Scope

Day-2 operations for population imports, entity-resolution review, fixture-backed collection runs, kill switch, and claim review queues. Live public egress remains **off** until **RB-015** closes.

## Preconditions

- Migration `0010_phase_1_1_population_research` applied
- Config loaded from `config/population/*` and `config/research/*`
- Operator role: `admin` or `ops` for imports/collection; `reviewer` for claim/entity review
- CI / local tests use `FixtureRetrievalPort` only

## Population import

### Dry-run (default)

1. Confirm population source `approval_status` allows the intended use (`approved`/`enabled` for production-like; fixture drafts only for engineering)
2. Submit import with unique `idempotency_key`, `dryRun: true`
3. Inspect report: `accepted_count`, `rejected_count`, `matched_count`, `created_count`, `ambiguous_count`
4. Triage ambiguous rows in entity-resolution review before any commit

### Commit

1. Re-run or continue with `dryRun: false` only after dry-run quality gate
2. Verify outbox events for matched/created organizations
3. Spot-check linked organizations against Prompt 4 duplicate/merge expectations

### Recovery

| Situation | Action |
|---|---|
| Bad mapping | New import with new idempotency key; leave failed import for audit |
| Partial commit concern | Prefer reverse/archive procedures; do not hard-delete provenance |
| License unclear | Stop; escalate **RB-014** — do not enable source |

## Entity resolution review

1. Filter `possible_duplicate` / `ambiguous_review`
2. Decide link / create / reject with rationale
3. Never auto-merge on name-only similarity
4. Use existing merge services for true duplicates already in the org graph

## Collection run (fixture pilot)

1. Confirm source key is `organization_website_fixture` (or another **enabled** source with all reviews approved)
2. Confirm kill switch off for that source
3. Cap targets ≤ 100 orgs/run
4. Start run; monitor blocked codes (`robots_disallow`, `rate_limited`, `domain_not_allowlisted`, SSRF codes)
5. After completion, process claim review queue ([Extraction Review Guide](EXTRACTION_REVIEW_GUIDE.md))

## Kill switch

**When:** Suspected ToS violation, SSRF incident, abusive traffic, bad extractor flood, legal hold.

1. Actor with `kill_switch:operate` activates switch (in-process API and/or set `approved_sources.kill_switch_active`)
2. Confirm runs cancel / new runs gate with `kill_switch`
3. Suspend source lifecycle if needed
4. Preserve snapshots/claims for forensics
5. Incident notes → security/privacy owners (align with RB-001 / RB-015)

## Claim backlog

- Warn at 500 awaiting review (`review_backlog_warn`)
- Prioritize high-impact variables from research priority config
- Reject systematic garbage; consider source suspend

## Health checks

| Check | Expectation |
|---|---|
| Package tests | `pnpm --filter @adp/research test` green |
| Repo validate | `pnpm validate` green on PG 17 test DB |
| Live adapter | Remains draft + kill switch until approvals |
| Object storage | Not required for fixture pilot; production tracked as **RB-016** |

## Escalation

| Issue | Owner |
|---|---|
| Licensing | Data steward / legal (**RB-014**) |
| Live/archive approval | Legal + privacy + security (**RB-015**) |
| Snapshot retention | Ops (**RB-016**) |
| AI extraction | Product + security (**RB-017**) |
| Auth/RBAC platform | Security (**RB-001**) |
