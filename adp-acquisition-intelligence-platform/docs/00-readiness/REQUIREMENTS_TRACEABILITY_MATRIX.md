# Requirements Traceability Matrix

**Version:** 1.1.0
**Status:** Prompt 0 baseline; updated Prompt 1.5 for CONF-005/009
**Created:** 2026-07-22T18:33:53Z
**Updated:** 2026-07-22T19:15:56Z

Maps Phase 1 requirements from canonical sources through entities, modules, UI, prompts, tests, and exit-contract checks.

Legend: **Prompt** = implementation prompt; **Test** = primary automated layer; **Manual** = human/operational evidence when unavoidable.

---

## Foundation and platform

| Requirement | Canonical source | Business entity | Service/module | UI/dashboard | Prompt | Test | Exit check |
|---|---|---|---|---|---|---|---|
| Deterministic install/setup | Tech Arch; Constitution; Roadmap P1 | — | apps/*, tooling | — | 1 | Static + smoke | FND-001 |
| Web/API/worker health | Tech Arch topology | — | apps/web, api, worker | Shell env badge | 1 | Integration smoke | FND-002 |
| Central config/logging/errors/auth/audit/jobs | Tech Arch cross-cutting; Blueprint platform | Audit Event, User, Role | `packages/platform/*` | UI-25, UI-26 | 1, 3 | Unit + integration | FND-003 |
| Build/lint/typecheck/dependency/unit gates | Constitution; Testing Plan | — | tooling | — | 1 | Static/unit | FND-004 |
| Modular monolith dependency law | Tech Arch; Constitution | — | all packages | — | 1+ | Dependency/cycle checks | QAR-007 |
| Feature flags default off | Tech Arch; Vision Admin | (gap CONF-010) | platform/config | Admin TBD | 1 | Config schema tests | SCP-* guards |

---

## Data model, identity, territory

| Requirement | Canonical source | Business entity | Service/module | UI/dashboard | Prompt | Test | Exit check |
|---|---|---|---|---|---|---|---|
| Canonical entities, FKs, indexes | Entity Catalog; Database Arch | Organization…Audit Event | `packages/database`, domain packages | — | 2 | Migration + constraint integration | DAT-001 |
| Empty + upgrade migrations | Database Arch; Testing Plan | — | database/migrations | — | 2+ | Migration suites | DAT-002 |
| Archive, supersession, append-only audit | Functional §4; Entity invariants | Variable Value, Evidence, Audit, Score Result | domain + platform/audit | UI-26 | 2–3 | Integration history tests | DAT-003 |
| Territory, ownership, existing-relationship controls | Functional §3.10; Entity Assignment | Territory, Account Assignment, Organization | organizations + platform/auth | UI-04, UI-25, D2 | 2, 6 | Authz matrix | DAT-004 |
| Encrypted backup/restore rehearsal | Database Arch; Testing Plan | — | operations | — | 12 | Manual restore + checksums | DAT-005 |
| Users/roles/permissions | Vision; Entity Catalog | User, Role/Permission | platform/auth, database | UI-25 | 1–2 | Auth integration | FND-003, DAT-004 |
| Tasks and notes | Functional §3.10 | Task, Note | work ports (owner TBD CONF-014) | UI-22, Org 360 | 2, 6 | Unit + integration | WFL-002 |
| Parallel prospect/research/outreach/freshness/opportunity states | State Machine; Operational State and Consent Model | Organization / Opportunity ops columns; Operational State Transition | OperationalStateService | Org 360, D1–D7 | 2, 6 | Unit + integration scenarios 11, 13 | WFL-002 |
| Consent, channel permission, suppression | Functional §3.8a; Operational State and Consent Model | Contact Channel Permission, Org Restriction, Suppression Entry | ConsentPermissionService | UI-18, UI-27, D6 | 2, 8 | Scenarios 9, 14 | WFL-005 |

---

## Collection and identity resolution

| Requirement | Canonical source | Business entity | Service/module | UI/dashboard | Prompt | Test | Exit check |
|---|---|---|---|---|---|---|---|
| Manual org/location/contact entry | Functional §3.1 | Organization, Location, Contact | organizations | UI-03 | 4 | E2E + validation | COL-001 |
| CSV map/validate/dry-run/commit/report/revert | Functional §3.1 | Import Batch/Row | collection/ImportService | UI-05, UI-06 | 4 | Scenario 1 integration/E2E | COL-002 |
| Retain source rows and import audit | Functional §3.1; Database | Import Batch/Row, Audit | collection + audit | UI-06 | 4 | Integration | COL-003 |
| Deterministic normalization | Functional §3.2 | Organization aliases, contacts | collection/normalizers | — | 4 | Unit golden | COL-004 |
| Explainable duplicates; human merge | Functional §3.2; Entity | Duplicate candidates, Merge events | collection/duplicate-matcher | UI-07 | 4 | Scenario 2 | COL-005 |
| Merge preserves aliases/children/history | Entity invariants; Functional | Organization, Evidence, Variables | collection + orgs | UI-07 | 4 | Transactional integration | COL-005, DAT-003 |

---

## Evidence, variables, confidence, completeness

| Requirement | Canonical source | Business entity | Service/module | UI/dashboard | Prompt | Test | Exit check |
|---|---|---|---|---|---|---|---|
| Evidence source/claim/date/context/review | Functional §3.3; Entity | Source, Evidence Record, Observation | evidence/* | UI-08, UI-09, D3 | 3 | Integration | INT-001 |
| Fact vs calculation vs inference vs unknown distinct | Functional §3.3; Variables | Variable Value, Evidence | variables + evidence | Org 360 variables | 3 | Scenario 3 unit/integration | INT-002 |
| zero/false/unknown/N/A/withheld/contradicted/stale distinct | Variable Dictionary; Constitution | Variable Value | variables | D3 | 3, 5 | Scenario 3–4 | INT-003 |
| Confidence from reliability/specificity/recency/agreement/extraction | Variables; Scoring | Evidence Record | evidence + variables confidence policy | UI-09, scores | 3, 5 | Unit + golden | INT-004 |
| Purpose completeness (overall/motions/discovery/outreach) | Functional §3.4; Variables | Variable Definition/Value | completeness-service | D3, Org 360 | 5 | Unit + fixtures | INT-005 |
| Variable supersession explicit; provenance preserved | Entity invariants; Functional | Variable Value, Evidence | value-service | UI-09, discovery review | 3, 7 | Integration | DAT-003, INT-001 |
| Definition versioning | Variables; Database | Variable Definition | variables + admin | UI-23 | 3 | Version immutability tests | INT-001 |

---

## Scoring and recommendations

| Requirement | Canonical source | Business entity | Service/module | UI/dashboard | Prompt | Test | Exit check |
|---|---|---|---|---|---|---|---|
| Nine score families exist | Vision; Scoring Spec; Exit | Score Definition/Result | scoring/* | UI-10, UI-11, D4 | 5 | Golden suite | SCR-001 |
| Business-approved rubrics/weights | Scoring Spec; Exit | Score Definition versions | config/scoring | UI-24 | 5, 12 | Manual approval evidence + golden | SCR-002 |
| Versioned, deterministic, replayable | Scoring Spec; Constitution | Score Result + snapshot | score-engine + scoring-service | UI-11 | 5 | Replay/property | SCR-003 |
| Output status/tier/confidence/completeness/factors/gaps/action/snapshot | Scoring output contract | Score Result, Score Factor | scoring-service | UI-11, D4 | 5 | Contract tests | SCR-004 |
| Low completeness/conflicts ≠ false precision | Scoring calc steps 5–9 | Score Result | score-engine | D4 | 5 | Scenario 6 | SCR-005 |
| Override auth+reason; preserve computed | Scoring overrides; Functional §3.6 | Qualification Review / override metadata | qualification + scoring | UI-13 | 5–6 | Authz + audit | SCR-006 |
| Recommendation + deterministic tie-break | Scoring recommendation policy | Score Result | score-engine | UI-10, Org 360 | 5 | Unit ties | SCR-001, SCR-003 |
| Disqualifiers/policy blocks ≠ fit | Scoring; State Machine blocked | Disqualification Reason, flags | qualification + outreach | UI-13, UI-18 | 6, 8 | Guard tests | WFL-001, WFL-005 |
| No automated weight learning | Vision non-goals; Scoring calibration | — | reporting (read-only) | D8 | 5, 10 | Scope tests | SCP-* / SCR-002 |

---

## Qualification and workflow

| Requirement | Canonical source | Business entity | Service/module | UI/dashboard | Prompt | Test | Exit check |
|---|---|---|---|---|---|---|---|
| Qualification outcomes + structured reasons | Functional §3.6; State Machine | Qualification Review, Disqualification Reason | qualification/review-service | UI-12, UI-13 | 6 | Transition matrix | WFL-001 |
| Transition guards, history, exceptions, next tasks | State Machine contract | Stage History, Task | qualification + workflow config | Org 360, UI-22 | 6 | Scenario/guards | WFL-002 |
| `conditionally_qualified` behavior | Functional §3.6; State Machine (**CONF-002 resolved**) | Qualification Review, Task | qualification | UI-13 | 6 | Condition tasks block discovery/outreach until satisfied or waived | WFL-001 |
| Territory/duplicate/relationship blocks | State Machine blocked | Organization flags, Assignment | qualification + auth | UI-13 | 6 | Authz | DAT-004, WFL-002 |

---

## Discovery

| Requirement | Canonical source | Business entity | Service/module | UI/dashboard | Prompt | Test | Exit check |
|---|---|---|---|---|---|---|---|
| Context-sensitive agenda | Functional §3.7 | Discovery Template/Question/Session | discovery/agenda-service | UI-14, UI-15 | 7 | Unit selection | WFL-003 |
| Verbatim answers retained | Functional §3.7; Entity invariant 4 | Discovery Answer | discovery | UI-16 | 7 | Integration | WFL-003 |
| Confirm mappings before value change | Functional §3.7 | Answer Mapping → Variable Value | answer-mapping-service | UI-17 | 7 | Scenario 8 | WFL-003 |
| Rescore + pre/post deltas | Functional §3.7; Scoring recalc | Score Result | discovery + scoring | UI-17, D5 | 7 | Integration | WFL-003, SCR-003 |

---

## Outreach

| Requirement | Canonical source | Business entity | Service/module | UI/dashboard | Prompt | Test | Exit check |
|---|---|---|---|---|---|---|---|
| Templates, sequences, approvals, activities, responses, follow-ups | Functional §3.8 | Campaign, Sequence, Template, Activity, Response | outreach/* | UI-18, UI-19, D6 | 8 | Integration + E2E | WFL-004 |
| Human approval required; no autonomous send | Vision; Functional; Constitution | Message Template, Activity | outreach-service | UI-18 | 8 | Scenario 9 + scope | WFL-004, SCP-002 |
| Opt-out/channel restrictions block | State Machine; Operational State and Consent Model; Testing | Contact Channel Permission, Org Restriction, Suppression | outreach + ConsentPermissionService | UI-18, UI-27, D6 | 2, 8 | Scenarios 9, 14 | WFL-005 |
| Response classes controlled | Functional §3.8 | Response | outreach | UI-18, D6 | 8 | Unit classification | WFL-004 |
| Idempotent activity commands | Testing scenario 10 | Outreach Activity, Task | outreach | UI-18 | 8 | Retry tests | WFL-004 |

---

## Opportunities

| Requirement | Canonical source | Business entity | Service/module | UI/dashboard | Prompt | Test | Exit check |
|---|---|---|---|---|---|---|---|
| Create opportunity from validated interest | Functional §3.9; State Machine | Opportunity | opportunities/* | UI-20, D7 | 9 | Integration | WFL-006 |
| Stage rules, history, aging, risk, outcomes | State Machine opportunity stages | Stage History, Opportunity | opportunity-service | UI-20, D7 | 9 | Scenario 11 | WFL-006 |
| Probability policy / override reason | State Machine | Opportunity | opportunities | UI-20 | 9 | Validation tests | WFL-006 |

---

## Dashboards and exports

| Requirement | Canonical source | Business entity | Service/module | UI/dashboard | Prompt | Test | Exit check |
|---|---|---|---|---|---|---|---|
| Eight dashboard views | Functional §3.11; Dashboard Spec D1–D8 | Reporting queries | reporting/dashboard-query-service | UI-01,02,08,10,14,18,20,21 | 10–11 | Scenario 12 | DSH-001 |
| Filters/sort/pagination/saved views/drilldowns | Dashboard shared; UI standards | Saved View | reporting + web | all tables | 10–11 | Component + E2E | DSH-002 |
| Metrics reconcile to fixtures | Dashboard acceptance; Testing | — | reporting | D1–D8 | 10 | Fixture parity | DSH-003 |
| Permission-scoped CSV exports + metadata | Functional §3.11; Dashboard | Export Job | export-service | tables + jobs in shell | 10 | Authz + contract | DSH-004 |
| Empty/loading/partial/stale/denied/error | Functional §4; UI global; Dashboard | — | web + reporting | all | 11 | Component/a11y | DSH-005 |
| Timezone: store UTC, display user TZ | Functional §4; UI standards | — | platform + web | all | 1, 11 | Unit + E2E boundaries | DSH-003 |

---

## Quality, security, scope, acceptance

| Requirement | Canonical source | Business entity | Service/module | UI/dashboard | Prompt | Test | Exit check |
|---|---|---|---|---|---|---|---|
| Required test layers pass | Testing Master Plan | — | tests/* | — | 1–12 | All layers | QAR-001 |
| Security/privacy threat model + independent review | Tech Arch; Testing | — | platform | — | 12 | Manual + automated security | QAR-002 |
| Target-volume performance baselines | Tech Arch; Testing (100k orgs…) | — | reporting, indexes | dashboards | 10, 12 | Performance | QAR-003 |
| Ops/dev/user documentation current | Constitution; Roadmap P12 | — | docs | — | 12 | Manual review | QAR-004 |
| 25-org E2E without DB edits | Functional §5 | end-to-end | all | UI path | 12 | E2E | QAR-005 |
| No open blocking defects/prohibited waivers | Exit Contract | — | — | — | 12 | Review | QAR-006 |
| Every prompt architecture review clean of critical/high | Checklist; Constitution | — | — | — | each | Review artifacts | QAR-007 |
| Final repository architecture review | Checklist final | — | — | — | 12 | Final review | QAR-008 |
| No referral partner workflows | Vision; Functional deferrals; State Machine Phase 2 seam | Organization Role (dormant only) | — | no referral UI | all | Scope grep/tests | SCP-001 |
| No autonomous external sending | Vision; Functional; Outreach | — | outreach | UI-18 | 8, 12 | Scope tests | SCP-002 |

---

## Coverage notes

1. **Unprovable until human gates:** SCR-002, QAR-002, DAT-005, all `required_signoffs`.
2. **Resolved Prompt 6 entry conflicts:** WFL-001 path for `conditionally_qualified` (CONF-002) and SCR-001/SCR-002 baseline score activation (CONF-007) are resolved for Phase 1. CONF-005 and CONF-009 are **resolved** in Prompt 1.5.
3. **Campaign UI gap (CONF-013)** threatens QAR-005 “no DB edits” if campaigns are required in the happy path—resolve before Prompt 8/11.
4. Traceability IDs above are stable for Prompt evidence linking; extend rows when ADRs add requirements—do not delete historical rows.
