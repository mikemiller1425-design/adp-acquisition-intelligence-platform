# Specification Conflict Register

**Version:** 1.0.0  
**Status:** Open tracking register from Prompt 0  
**Policy:** Do not silently resolve. Coordinated canonical updates + ADR required before consuming prompts implement conflicting behavior.  
**Created:** 2026-07-22T18:33:53Z

Status values: `open` | `resolved` | `accepted_risk` | `superseded`

Severity: `critical` | `high` | `medium` | `low`

---

## CONF-001 — Commercial motion “CAS-led” vs score “CAS Maturity”

| Field | Value |
|---|---|
| Severity | medium |
| Documents | `PRODUCT_VISION.md`, `SCORING_ENGINE_SPECIFICATION.md`, `VARIABLE_DICTIONARY.md`, `DASHBOARD_SPECIFICATION.md` |
| Conflicting language | Vision lists commercial motion **CAS-led**; scoring/dashboards use **CAS Maturity** as a score family; variables say “Used by: CAS maturity” |
| Impact | Ambiguous whether CAS is a selectable primary motion, a maturity score only, or both; UI motion filters and recommendation policy may diverge |
| Recommended resolution | Canonicalize: motion key `cas_led` (commercial pursuit) and score key `cas_maturity` (supporting/domain score). State explicitly that primary/secondary recommendation may select `cas_led` using `cas_maturity` plus related scores |
| Required approver | product_owner + business_scoring_owner |
| Status | open |
| Target prompt | before Prompt 5 (ideally ADR in Prompt 1 docs freeze follow-up) |

---

## CONF-002 — `conditionally_qualified` missing from state machine

| Field | Value |
|---|---|
| Severity | high |
| Documents | `PHASE_1_FUNCTIONAL_SPECIFICATION.md` §3.6, `WORKFLOW_STATE_MACHINE.md` |
| Conflicting language | Functional Spec review outcomes include `conditionally_qualified`; State Machine transitions list Qualified / Nurture / Research Required / terminals only—no conditionally qualified state or transition |
| Impact | Qualification workspace cannot implement an authoritative outcome; guards, next tasks, and dashboards undefined for this path |
| Recommended resolution | Either (A) add `CONDITIONALLY_QUALIFIED` with entry/exit criteria, required fields, and allowed next transitions, or (B) remove/rename the outcome in the Functional Spec and map intent to `qualified` + constraint flags / `nurture` |
| Required approver | product_owner |
| Status | open |
| Target prompt | before Prompt 6 |

---

## CONF-003 — Enum case and naming style inconsistency

| Field | Value |
|---|---|
| Severity | low |
| Documents | `WORKFLOW_STATE_MACHINE.md`, `PHASE_1_FUNCTIONAL_SPECIFICATION.md`, Entity Catalog lifecycles |
| Conflicting language | Prospect stages shown as `RAW`, `OUTREACH_ACTIVE`; qualification outcomes as `research_required`, `out_of_territory`; entity lifecycles mix `in_progress` and prose |
| Impact | Contract/schema drift risk; test fixture inconsistency |
| Recommended resolution | Storage and API enums: `snake_case`. Document display mapping. State Machine diagram may show Title Case labels but must cite snake_case keys |
| Required approver | engineering_owner |
| Status | open |
| Target prompt | Prompt 2 (schema) / Prompt 6 (workflow config) |

---

## CONF-004 — Evidence type conflated with value labeling

| Field | Value |
|---|---|
| Severity | medium |
| Documents | `PHASE_1_FUNCTIONAL_SPECIFICATION.md` §3.3, `VARIABLE_DICTIONARY.md` |
| Conflicting language | Functional Spec: “Values are labeled `verified_fact`, `source_derived_fact`, …” while Variable Dictionary separates **statuses** (`known`, `unknown`, …) from **evidence types** (same fact labels) |
| Impact | Implementers may store evidence type as value status or omit `known`/`stale` semantics |
| Recommended resolution | Amend Functional Spec wording to: values have `status`; associated evidence has `evidence_type`; AI inference must never display as verified fact |
| Required approver | product_owner + engineering_owner |
| Status | open |
| Target prompt | before Prompt 3 |

---

## CONF-005 — Parallel workflow dimensions not persisted in data architecture

| Field | Value |
|---|---|
| Severity | high |
| Documents | `WORKFLOW_STATE_MACHINE.md` (Parallel states), `DATABASE_ARCHITECTURE.md`, `BUSINESS_ENTITY_CATALOG.md`, Dashboard/UI catalogs |
| Conflicting language | State Machine requires separate `prospect_stage`, `research_status`, outreach status, and data freshness; example uses `research_status=GAPS_OPEN`. Database lists `organizations` with a single `status` plus `stage_history`, but does not define parallel status columns/enums or owned entities for research/outreach status |
| Impact | Risk of overloaded `organizations.status`; dashboards and guards cannot be implemented faithfully; exit WFL-002 threatened |
| Recommended resolution | Add explicit fields or satellite state tables for `prospect_stage`, `research_status`, `outreach_status`, and freshness indicators; enumerate allowed values; keep `stage_history` append-only for prospect and opportunity transitions |
| Required approver | product_owner + engineering_owner |
| Status | open |
| Target prompt | before Prompt 2 schema freeze (critical path) |

---

## CONF-006 — Production repository naming mismatch

| Field | Value |
|---|---|
| Severity | low |
| Documents | `REPOSITORY_BLUEPRINT.md`, repo root folder / README title |
| Conflicting language | Blueprint proposes `adp-acquisition-platform/`; documentation repo is `adp-acquisition-intelligence-platform` |
| Impact | Packaging/path confusion only |
| Recommended resolution | ADR in Prompt 1 chooses one production root name; update Blueprint when canonical docs may change |
| Required approver | engineering_owner |
| Status | open |
| Target prompt | Prompt 1 |

---

## CONF-007 — Score representative components lack variable-key mapping

| Field | Value |
|---|---|
| Severity | high |
| Documents | `SCORING_ENGINE_SPECIFICATION.md`, `VARIABLE_DICTIONARY.md` |
| Conflicting language | Scoring lists narrative components (“payroll book potential”, “process quality”, “economics”, “employer size/fit”, “service breadth”, “cadence”, “relationship access”) that are not keys in the Variable Dictionary; example YAML uses real keys for wholesale only |
| Impact | Prompt 5 cannot build complete deterministic configs without inventing variables or dropping components; SCR-001/SCR-004 at risk |
| Recommended resolution | For each score family, publish a table: component_id → variable_key(s) → transform → required/optional. Add any missing variable definitions to the dictionary before activation. Keep weights unapproved until SCR-002 |
| Required approver | business_scoring_owner |
| Status | open |
| Target prompt | before Prompt 5 |

---

## CONF-008 — Operational fields described as “variables”

| Field | Value |
|---|---|
| Severity | low |
| Documents | `VARIABLE_DICTIONARY.md` (Contact, assignment, and outcome variables) |
| Conflicting language | Section mixes contact roles, territory, owner, stage, and outcome events with scoring variables, then says they are “operational fields rather than scoring variables unless explicitly versioned” |
| Impact | Ambiguous whether these are `variable_values`, organization columns, or activity-derived metrics |
| Recommended resolution | Move operational/outcome fields to Entity Catalog / Database Architecture; retain only versioned intelligence variables in the dictionary |
| Required approver | engineering_owner + product_owner |
| Status | open |
| Target prompt | before Prompt 3 |

---

## CONF-009 — Opt-out / consent required but undeclared as entity

| Field | Value |
|---|---|
| Severity | high |
| Documents | Functional Spec §3.8, Technical Architecture (OutreachService), State Machine blocked transitions, Testing Master Plan scenario 9, Exit WFL-005, Database Architecture (opt-out mention under activities) |
| Conflicting language | Multiple docs require opt-out/channel restriction enforcement; Entity Catalog has no Consent/OptOut/ChannelPermission entity; Variable Dictionary mentions “channel permissions” as contact-scoped without definition contract |
| Impact | Outreach restrictions cannot be modeled, audited, or tested without inventing schema; security finding |
| Recommended resolution | Add `ContactChannelPermission` (or equivalent) entity + tables: contact, channel, permission state (`permitted`/`restricted`/`opted_out`), source, effective/expiry, actor, audit. Wire OutreachService guards to this aggregate |
| Required approver | product_owner + security_privacy_owner |
| Status | open |
| Target prompt | before Prompt 8 (schema preferably Prompt 2) |

---

## CONF-010 — Admin capabilities without UI/entities

| Field | Value |
|---|---|
| Severity | medium |
| Documents | `PRODUCT_VISION.md` (Administrator), `UI_SCREEN_CATALOG.md`, Entity Catalog |
| Conflicting language | Admins configure controlled vocabularies and feature flags; UI provides variables, scoring, and access admin only; no FeatureFlag entity; vocabularies implicit in enums |
| Impact | Admin jobs incomplete; flags may become env-only without audit |
| Recommended resolution | Either add UI-27/UI-28 + entities, or explicitly defer feature-flag UI to config files managed by engineering with ADR; document vocabulary ownership (reference tables vs config YAML) |
| Required approver | product_owner |
| Status | open |
| Target prompt | before Prompt 11 (config approach ADR in Prompt 1) |

---

## CONF-011 — Operating-loop wording drift in root README

| Field | Value |
|---|---|
| Severity | low |
| Documents | Root `README.md`, Functional Spec §1, Prompt 0 mission statement |
| Conflicting language | Root README: `Collect → Normalize → Evidence → Confidence → Completeness → Score → Review → Discover → Re-score → Outreach → Opportunity → Learn`; Functional Spec includes Target definition, normalization, response/outcome, model feedback with different granularity |
| Impact | Onboarding confusion only; behavior still governed by Functional Spec |
| Recommended resolution | Align root README loop to Functional Spec §1 when docs may be edited |
| Required approver | product_owner |
| Status | open |
| Target prompt | documentation hygiene (any) |

---

## CONF-012 — Database tables without Entity Catalog entries

| Field | Value |
|---|---|
| Severity | medium |
| Documents | `DATABASE_ARCHITECTURE.md`, `BUSINESS_ENTITY_CATALOG.md` |
| Conflicting language | DB includes `outreach_recipients`, `import_entity_links`, `job_runs`, `export_jobs`, `outbox_events`, `response_classifications`, `score_factors`, etc. without corresponding Entity Catalog rows |
| Impact | Unclear domain ownership and lifecycle; Blueprint package ownership may miss them |
| Recommended resolution | Extend Entity Catalog with infrastructure/supporting entities or mark them as platform-owned technical entities with owners |
| Required approver | engineering_owner |
| Status | open |
| Target prompt | before Prompt 2 |

---

## CONF-013 — Campaign entity without campaign management UI

| Field | Value |
|---|---|
| Severity | medium |
| Documents | Functional Spec §3.8, Entity Catalog (Campaign), UI Screen Catalog, Dashboard D6 |
| Conflicting language | Campaigns are first-class; UI-18/19 cover outreach ops and templates/sequences but not campaign create/edit/pause |
| Impact | Operators may need DB/scripts to manage campaigns—violates Functional Spec §5 “no direct database editing” |
| Recommended resolution | Add UI screen for campaigns or fold campaign CRUD into UI-18/UI-19 with explicit actions |
| Required approver | product_owner |
| Status | open |
| Target prompt | before Prompt 8/11 |

---

## CONF-014 — Tasks, notes, tags, territories package ownership thin

| Field | Value |
|---|---|
| Severity | medium |
| Documents | Entity Catalog, Repository Blueprint, Technical Architecture bounded contexts |
| Conflicting language | Tasks/Notes/Tags/Territory/Assignment are required entities; Blueprint has no `packages/work` or `packages/assignment`; Identity & Access is a context but not a domain package |
| Impact | Prompt 2 may dump unrelated logic into `platform` or `organizations` |
| Recommended resolution | Assign owners explicitly: Territories/Assignments → Identity or Organizations; Tasks/Notes/Tags → `platform` work module or `organizations` application services with public ports—document in Blueprint |
| Required approver | engineering_owner |
| Status | open |
| Target prompt | Prompt 1–2 |

---

## CONF-015 — Terminal/routed state re-entry underspecified

| Field | Value |
|---|---|
| Severity | medium |
| Documents | `WORKFLOW_STATE_MACHINE.md` |
| Conflicting language | Re-entry from NURTURE/DISQUALIFIED/DUPLICATE/EXISTING_RELATIONSHIP/OUT_OF_TERRITORY “requires authorized reason” but no from→to table, required fields, or role matrix |
| Impact | Ambiguous guards; exception path overuse |
| Recommended resolution | Add re-entry transition rows: allowed targets, roles, required reason codes, side effects (reopen tasks, invalidate stale scores) |
| Required approver | product_owner |
| Status | open |
| Target prompt | before Prompt 6 |

---

## CONF-016 — RESEARCH_REQUIRED path incomplete

| Field | Value |
|---|---|
| Severity | medium |
| Documents | State Machine diagram vs transition table |
| Conflicting language | Diagram shows REVIEW ↘ RESEARCH_REQUIRED ↗ back toward REVIEW/SCORED path; table has Review→Research Required but not return transitions or whether scoring must re-run |
| Impact | Research queue and review loop implementation guesswork |
| Recommended resolution | Define `research_required → research → scored → review` (or direct return) with required outputs |
| Required approver | product_owner |
| Status | open |
| Target prompt | before Prompt 6 |

---

## CONF-017 — Prospect OPPORTUNITY stage vs Opportunity aggregate

| Field | Value |
|---|---|
| Severity | medium |
| Documents | State Machine, Entity Catalog, Opportunities DB |
| Conflicting language | Prospect lifecycle includes `OPPORTUNITY`; Opportunity entity has its own stages; parallel-state example allows outreach + open opportunity simultaneously, while transition table shows Outreach Active → Opportunity |
| Impact | Unclear whether prospect_stage must move, whether multiple opportunities allowed, and dashboard funnel counting |
| Recommended resolution | Rules: (1) creating an opportunity does not erase outreach_status; (2) prospect_stage policy when ≥1 open opportunity; (3) cardinality of open opportunities per organization/motion |
| Required approver | product_owner |
| Status | open |
| Target prompt | before Prompt 9 |

---

## CONF-018 — Manual create entry state

| Field | Value |
|---|---|
| Severity | low |
| Documents | Functional Spec §3.1, State Machine Raw→Normalization |
| Conflicting language | Manual create path does not state whether records start in RAW or skip to RESEARCH when fields validate |
| Impact | Minor workflow/test variance |
| Recommended resolution | Manual create with validation passing enters NORMALIZATION complete / RESEARCH with duplicate check; incomplete drafts remain RAW or UI-draft only |
| Required approver | product_owner |
| Status | open |
| Target prompt | before Prompt 4 |

---

## CONF-019 — Auth/audit delivery split across prompts

| Field | Value |
|---|---|
| Severity | medium |
| Documents | Repository Blueprint (`Prompt 1/3`), Roadmap Prompt 1 vs 3 |
| Conflicting language | Blueprint assigns `authorize.ts` and `audit-service.ts` to Prompt 1/3; Roadmap Prompt 1 includes auth/audit scaffolds; Prompt 3 is variables/evidence |
| Impact | Unclear minimum auth for Prompt 2 CRUD tests |
| Recommended resolution | Prompt 1 delivers authz ports, middleware stubs, audit port + append-only table scaffold; Prompt 2 enforces territory on org/contact; Prompt 3 completes field-sensitive audit redaction for evidence excerpts |
| Required approver | engineering_owner |
| Status | open |
| Target prompt | Prompt 1 ADR |

---

## CONF-020 — Scoring ↔ Variables recalculation dependency direction

| Field | Value |
|---|---|
| Severity | medium |
| Documents | Technical Architecture services, Blueprint scoring/variables packages |
| Conflicting language | VariableService emits affected-score events; ScoringService reads variables; Discovery confirmation triggers both—cycle risk if packages import each other |
| Impact | Circular package dependency / shared-module abuse |
| Recommended resolution | Use domain events/outbox: Variables publishes `VariableValueChanged`; Scoring application layer consumes via worker; neither package imports the other’s infrastructure |
| Required approver | engineering_owner |
| Status | open |
| Target prompt | Prompt 1–5 (ports in 1, events in 3/5) |

---

## CONF-021 — `packages/ui` vs `apps/web` overlap

| Field | Value |
|---|---|
| Severity | low |
| Documents | Repository Blueprint |
| Conflicting language | Both `packages/ui` and `apps/web/src/components` exist without a split rule beyond “feature folders compose presentation” |
| Impact | Duplicate components or premature design system |
| Recommended resolution | `packages/ui` = primitive accessible components only; features stay in `apps/web` |
| Required approver | engineering_owner |
| Status | open |
| Target prompt | Prompt 1 |

---

## Summary counts

| Severity | Open |
|---|---:|
| critical | 0 (tenant modeled as DEC-003 decision, not pure conflict) |
| high | 4 (CONF-002, 005, 007, 009) |
| medium | 12 |
| low | 5 |
| **Total** | **21** |
