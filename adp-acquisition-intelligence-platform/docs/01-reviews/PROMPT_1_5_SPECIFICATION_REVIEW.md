# Prompt 1.5 — Specification Review

**Version:** 1.0.0  
**Scope:** Pre-database resolution of CONF-005 and CONF-009  
**Reviewed at:** 2026-07-22T19:30:00Z  
**Baseline:** `9b09ff2574b1e78628ded88fe7cc6eb0a3c3af96` (Prompt 0 readiness)  
**Reviewer:** cursor-first-pass

---

## 1. Resolution summary

Prompt 1.5 published a canonical **Operational State and Consent Model** and updated all required specifications so that:

1. **CONF-005** — Five parallel operational dimensions are independently persisted and transitioned (`prospect_stage`, `research_status`, `outreach_status`, `data_freshness_status`, `opportunity_stage`) with current-state columns, shared append-only history, and a transition service. They are not collapsed into one organization status.
2. **CONF-009** — Consent/channel permission/suppression is a first-class model with entities, tables, precedence, services, UI (UI-27), import/outreach/export behavior, and tests. `unknown` is never `allowed`. No legal-compliance claim is made.

Unrelated conflicts (including CONF-002, CONF-007) remained open by design at Prompt 1.5 review time. Prompt 6 unblock later resolved CONF-002, CONF-007, CONF-015, and CONF-016 for Phase 1 entry.

**Integration note:** On the Prompt 1 + 1.5 integration branch, Prompt 1 ADRs/handoff/architecture review are present and **DEC-001–012 are decided**, including **DEC-003 single-tenant**. The original Prompt 1.5-only PR lacked Prompt 1; that gap is closed here.

---

## 2. Files created

| Path |
|---|
| `docs/05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md` |
| `docs/01-reviews/PROMPT_1_5_SPECIFICATION_REVIEW.md` |

## 3. Files modified

| Path |
|---|
| `docs/02-functional/PHASE_1_FUNCTIONAL_SPECIFICATION.md` |
| `docs/03-business/BUSINESS_ENTITY_CATALOG.md` |
| `docs/04-architecture/PHASE_1_TECHNICAL_ARCHITECTURE.md` |
| `docs/05-data/DATABASE_ARCHITECTURE.md` |
| `docs/05-data/VARIABLE_DICTIONARY.md` |
| `docs/06-repository/REPOSITORY_BLUEPRINT.md` |
| `docs/07-workflows/WORKFLOW_STATE_MACHINE.md` |
| `docs/09-ui/UI_SCREEN_CATALOG.md` |
| `docs/10-dashboards/DASHBOARD_SPECIFICATION.md` |
| `docs/11-implementation/IMPLEMENTATION_ROADMAP.md` |
| `docs/12-testing/TESTING_MASTER_PLAN.md` |
| `docs/README.md` |
| `docs/00-readiness/SPECIFICATION_CONFLICT_REGISTER.md` |
| `docs/00-readiness/REQUIREMENTS_TRACEABILITY_MATRIX.md` |

**Not modified:** `phase_1_exit_contract.yaml` (checks already cover WFL-002/WFL-005; evidence remains pending implementation).

---

## 4. Parallel-state model selected

**Current-state columns on the subject entity + one shared append-only `operational_state_transitions` table + `OperationalStateService`.**

| Dimension | Storage |
|---|---|
| `prospect_stage` | `organizations.prospect_stage` |
| `research_status` | `organizations.research_status` |
| `outreach_status` | `organizations.outreach_status` |
| `data_freshness_status` | `organizations.data_freshness_status` |
| `opportunity_stage` | `opportunities.opportunity_stage` |

`organizations.record_status` (`active`|`archived`) is explicitly **not** an operational dimension. Prior `stage_history` name is superseded by `operational_state_transitions`.

---

## 5. Consent model selected

**Effective-dated immutable permission rows with supersession**, three aggregates:

- `ContactChannelPermission`
- `OrganizationCommunicationRestriction`
- `SuppressionEntry` (+ `PermissionEvidenceLink`)

States: `allowed` | `unknown` | `restricted` | `opted_out` | `not_applicable`  
Precedence: global suppression → org restriction → channel opt-out → contact permission; conflicts → most restrictive; expired/revoked inactive; UI ≠ enforcement.  
Service: `ConsentPermissionService`; OutreachService must evaluate before outbound activity.

---

## 6. Remaining unresolved questions

| Item | Notes |
|---|---|
| Prompt 1 ADRs (DEC-001–012), esp. **DEC-003 tenant** | **Resolved on integration branch** via ADR-001–012 |
| CONF-002 `conditionally_qualified` | Resolved by Prompt 6 unblock as review outcome routing to `qualified` with blocking conditions |
| CONF-007 score component → variable map | Resolved by Prompt 6 unblock via approved Phase 1 scoring baseline |
| CONF-015 routed-state re-entry matrix detail | Resolved by Prompt 6 unblock in `docs/workflows/REENTRY_POLICY.md` |
| CONF-017 cardinality nuance | Phase 1 rule set (one open opp per org per motion); leave CONF-017 open for product confirm |
| CONF-013 campaign UI | Still open |
| Exact freshness thresholds (aging vs stale ages) | Config-driven; numeric windows not frozen (acceptable for Prompt 2 schema) |
| Identifier hashing algorithm for suppressions | Implementation detail for Prompt 2/security ADR |
| Legal/privacy approval of retention/consent policy | Explicitly out of band (DEC-012) |

---

## 7. Conflict-register status

| ID | Status |
|---|---|
| CONF-005 | **resolved** (Prompt 1.5) |
| CONF-009 | **resolved** (Prompt 1.5) |
| All other CONF-* | unchanged / open |

---

## 8. Architecture review result

```yaml
review:
  scope: prompt-1.5-specification-resolution
  baseline: 9b09ff2574b1e78628ded88fe7cc6eb0a3c3af96
  reviewed_commit: working-tree-prompt-1.5
  result: PASS_WITH_NON_BLOCKING_FINDINGS
  changed_modules:
    - docs/05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md
    - docs/02-functional/
    - docs/03-business/
    - docs/04-architecture/
    - docs/05-data/
    - docs/06-repository/
    - docs/07-workflows/
    - docs/09-ui/
    - docs/10-dashboards/
    - docs/11-implementation/
    - docs/12-testing/
    - docs/00-readiness/
    - docs/01-reviews/
    - docs/README.md
  commands_and_artifacts:
    - relative-link-validation: 68 resolved, 0 missing
    - yaml-parse: phase_1_exit_contract.yaml OK (46 checks)
    - terminology-spot-check: parallel-state and consent terms present across updated docs
  findings:
    - id: AR-1.5-001
      severity: medium
      status: resolved
      finding: Prompt 1 ADRs/handoff were missing on the Prompt 1.5-only PR; DEC-003 unresolved there.
      impact: Closed by integrating Prompt 1 (ADR-003 single-tenant) before Prompt 1.5 on this branch.
      required_action: None on integration branch.
      owner: engineering_owner
      target_prompt: 1
      resolved_by: prompt-1-and-1.5-integration
    - id: AR-1.5-002
      severity: low
      status: open
      finding: Numeric data-freshness aging/stale windows are config placeholders, not frozen durations.
      impact: Evaluator needs config in Prompt 2/3; schema enums are sufficient now.
      required_action: Publish freshness window config with variable expiry policy.
      owner: product_owner + engineering_owner
      target_prompt: 3
    - id: AR-1.5-003
      severity: low
      status: resolved_later_prompt_6_unblock
      finding: CONF-015 re-entry matrix remained open at Prompt 1.5; Prompt 6 unblock later resolved it.
      impact: Edge re-entry from routed states is now covered by docs/workflows/REENTRY_POLICY.md.
      required_action: None for Prompt 6 entry; implement policy enforcement in Prompt 6 workflow services.
      owner: product_owner
      target_prompt: 6
  deferred_findings:
    - CONF-002 (resolved later by Prompt 6 unblock)
    - CONF-007 (resolved later by Prompt 6 unblock)
    - CONF-013
    - CONF-015 (resolved later by Prompt 6 unblock)
    - CONF-017
  specification_deviations: []
  exit_contract_evidence_updated: []
  next_prompt_ready: true
  reviewer: cursor-first-pass
  reviewed_at: 2026-07-22T19:30:00Z
```

### Checklist application (documentation scope)

| Section | Result |
|---|---|
| A Specification and scope | Pass — CONF-005/009 traced; Phase 2 not activated; no silent conflict resolution for unrelated items |
| B Architecture / dependency | Pass as designed — Consent package + OperationalStateService ports documented; outreach depends on consent query |
| C Interfaces | Pass — service contracts documented for Prompt 2 implementation |
| D Data architecture | Pass for spec — columns/tables/history/consent defined; migrations not created (in scope) |
| E Scoring | N/A (unchanged); outreach blocks do not mutate scores — stated |
| F Security/privacy | Pass for technical model; legal compliance explicitly non-claimed; medium finding on missing Prompt 1 IdP/tenant ADRs |
| G–J | Mostly N/A (no runtime) |
| K Documentation | Pass — index, versions, conflict register history preserved |
| L Next-prompt readiness | Pass for CONF-005/009; DEC-003 resolved by ADR-003 on integration branch |

**Critical/high findings:** none open for this prompt’s scope.  
**Result:** `PASS_WITH_NON_BLOCKING_FINDINGS`

---

## 9. Confirmation

- Production application code: **not created**
- Database migrations / schemas / repositories: **not created**
- Production business logic: **not written**
- Prompt 2: **not begun**
- Exit contract YAML: **not altered**

---

## 10. Recommendation

### READY FOR PROMPT 2

**Conditions:**

1. Prompt 2 MUST implement the Operational State and Consent Model as specified (no alternate collapsed status design).
2. Prompt 2 MUST follow **ADR-003 single-tenant** (no speculative `tenant_id`).
3. Prompt 2 schema should continue to follow the Prompt 6 unblock resolutions for CONF-002 / CONF-007 rather than inventing alternate semantics.
4. Preserve Prompt 1 ADRs and foundation packages.

---

## Validation evidence

| Check | Result |
|---|---|
| Documentation links | 68 resolved, 0 missing |
| YAML parse (`phase_1_exit_contract.yaml`) | OK |
| Entity ↔ table traceability (parallel state + consent) | Documented in Entity Catalog + Database Architecture + Model |
| State ↔ history traceability | `operational_state_transitions` |
| Permission ↔ outreach enforcement | ConsentPermissionService + OutreachService gate + tests 9/14 |
| Requirement ↔ test | RTM + Testing Master Plan scenarios 9, 11, 13, 14 |
| Functional ↔ Entity ↔ DB ↔ State Machine ↔ UI ↔ Testing | Coordinated update; no remaining CONF-005/009 contradiction found |
