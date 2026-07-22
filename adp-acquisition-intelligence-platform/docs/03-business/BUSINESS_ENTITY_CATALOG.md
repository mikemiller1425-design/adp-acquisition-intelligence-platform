# Business Entity Catalog

**Version:** 1.1.0

## Conventions

Entities use UUID identifiers, UTC timestamps, archive metadata, and optimistic version numbers where mutable. “Owner” below means domain ownership, not necessarily a database package. Field details live in [Database Architecture](../05-data/DATABASE_ARCHITECTURE.md). Parallel operational dimensions and consent aggregates are specified in [Operational State and Consent Model](../05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md).

| Entity | Purpose | Lifecycle / ownership | Principal relationships |
|---|---|---|---|
| Organization | Canonical prospect/company identity | Created/imported; normalized; `record_status` active/archived; carries parallel ops columns; Organization domain | locations, contacts, roles, variables, scores, reviews, activities, opportunities, org restrictions |
| Organization Location | Office/branch and territory context | Active/closed/archived; Organization | belongs to organization and territory |
| Organization Role | Declares direct prospect or future partner-capable role without duplication | assigned/retired; Organization | organization + controlled role; referral roles reserved for Phase 2 |
| Contact | A person associated with an organization/location | active/inactive/archived; Contact | roles, outreach, discovery participation, channel permissions |
| Contact Role | Decision/influence function and seniority | effective-dated; Contact | contact + organization/location |
| Contact Channel Permission | Effective-dated permission for one contact on one outreach channel | asserted/superseded/revoked; Consent | contact, channel, evidence, actor |
| Organization Communication Restriction | Org-level communication limit (all or one channel) | effective-dated/superseded; Consent | organization, optional channel, evidence |
| Suppression Entry | Global or channel-specific suppression by contact and/or identifier | effective-dated/superseded; Consent | scope, identifiers, evidence |
| Permission Evidence Link | Joins permission/restriction/suppression rows to evidence | immutable; Consent | evidence records |
| Source | Reusable description of where information came from | active/disabled; Evidence | evidence records |
| Evidence Record | Immutable support for a claim/value | captured/reviewed/superseded; Evidence | source, observation, variable value, discovery answer, permissions |
| Research Observation | Human or automated claim awaiting/holding mapping | proposed/accepted/rejected/contradicted; Research | organization/contact, evidence, variable definition |
| Variable Definition | Configured meaning, type, validation, and usage | versioned/active/retired; Variables | values, score inputs, discovery mappings |
| Variable Value | Effective typed value for a subject | proposed/current/superseded/contradicted/stale; Variables | definition, subject, evidence, override |
| Score Definition | Versioned formula and thresholds | draft/active/retired; Scoring | component definitions and required variables |
| Score Result | Reproducible evaluation | immutable; recalculation creates another result; Scoring | subject, definition/version, input snapshot |
| Qualification Review | Human routing decision | pending/decided/superseded; Qualification | organization, scores, reviewer, reason |
| Disqualification Reason | Controlled terminal or delay reason | active/retired; Configuration | qualification and opportunity outcomes |
| Discovery Template | Versioned question selection rules | draft/active/retired; Discovery | questions and motion/persona tags |
| Discovery Question | Prompt plus response and mapping metadata | versioned/active/retired; Discovery | template, variable mappings |
| Discovery Session | Planned/completed interaction | planned/in_progress/completed/cancelled; Discovery | organization, contacts, answers, score runs |
| Discovery Answer | Verbatim response and confirmed interpretations | draft/confirmed/rejected; Discovery | session, question, mappings, evidence |
| Campaign | Analytic grouping for outreach | draft/active/paused/completed; Outreach | sequences and recipients |
| Sequence | Ordered reusable outreach plan | draft/active/retired; Outreach | steps, campaign selection |
| Sequence Step | Channel, timing, template, and objective | versioned within sequence; Outreach | template and activities |
| Message Template | Reusable human-reviewed draft pattern | draft/approved/retired; Outreach | motion/persona/industry/trigger tags |
| Outreach Activity | An attempted, sent, received, or meeting interaction | planned/completed/cancelled; Outreach | organization, contact, step, response |
| Response | Classified inbound outcome | unclassified/classified/reclassified; Outreach | activity and next action |
| Opportunity | A concrete commercial pursuit | open stages via `opportunity_stage`; record active/archived; Opportunity | organization, motion, owner, transitions |
| Operational State Transition | Append-only history for any parallel dimension | immutable; Workflow | subject (org or opportunity), dimension, from/to, reason |
| Task | Explicit operational next action | open/in_progress/completed/cancelled; Work management | subject, assignee, due time |
| Note | Supplemental human context | active/archived; Shared | polymorphic subject, author |
| Tag | Controlled or user-created classification | active/retired; Shared | organizations and other subjects |
| User | Authenticated actor | invited/active/suspended; Identity | roles, ownership, audit events |
| Role/Permission | Authorization capability grouping | configured/versioned; Identity | users and permissions |
| Territory | Geographic/organizational scope | active/retired; Assignment | locations, users, assignments |
| Account Assignment | Owner and territory responsibility | effective-dated; Assignment | organization, user, territory |
| Import Batch/Row | Traceable ingestion and row outcome | pending/validated/committed/reverted; Collection | source file, created entities, errors |
| Saved View | User-owned filters/columns/sort | active/archived; UI | dashboard/table and user |
| Audit Event | Append-only security/business trace | immutable; Audit | actor, subject, action, before/after metadata |

## Aggregate and ownership rules

- Organization is the root for prospect identity but does not own immutable audit or score history transactionally.
- Organization **record_status** (active/archived) is distinct from `prospect_stage`, `research_status`, `outreach_status`, and `data_freshness_status`.
- Variable Definition and Score Definition are versioned configuration aggregates. Published versions are immutable.
- Discovery Session owns draft answers; confirmation invokes the Variables service rather than mutating values directly.
- Sequence owns ordering of steps. Existing activities retain the version used when created.
- Opportunity owns `opportunity_stage`; organization research and outreach statuses remain separately visible.
- Consent aggregates are effective-dated and immutable once written; corrections supersede.
- Cross-domain code uses application service interfaces and identifiers, never foreign-domain repository access.

## Required invariants

1. One canonical active organization per resolved real-world entity within a tenant/scope.
2. A current variable value cannot silently overwrite provenance; supersession is explicit.
3. Published score definitions and computed input snapshots are immutable.
4. A completed discovery answer retains verbatim text even if its normalized mapping changes.
5. An outreach activity names its channel, actor, time, and outcome status, and MUST only complete outbound when effective permission is `allowed`.
6. A state transition either satisfies the [State Machine](../07-workflows/WORKFLOW_STATE_MACHINE.md) and [Operational State and Consent Model](../05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md) or records an authorized exception.
7. Phase 1 organization roles cannot activate referral workflow behavior.
8. Parallel operational dimensions MUST NOT be collapsed into a single status column.
9. `unknown` channel permission is never treated as `allowed`.
