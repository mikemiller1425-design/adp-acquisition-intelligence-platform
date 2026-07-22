# Business Entity Catalog

**Version:** 1.0.0

## Conventions

Entities use UUID identifiers, UTC timestamps, archive metadata, and optimistic version numbers where mutable. “Owner” below means domain ownership, not necessarily a database package. Field details live in [Database Architecture](../05-data/DATABASE_ARCHITECTURE.md).

| Entity | Purpose | Lifecycle / ownership | Principal relationships |
|---|---|---|---|
| Organization | Canonical prospect/company identity | Created/imported; normalized; active/archived; Organization domain | locations, contacts, roles, variables, scores, reviews, activities, opportunities |
| Organization Location | Office/branch and territory context | Active/closed/archived; Organization | belongs to organization and territory |
| Organization Role | Declares direct prospect or future partner-capable role without duplication | assigned/retired; Organization | organization + controlled role; referral roles reserved for Phase 2 |
| Contact | A person associated with an organization/location | active/inactive/archived; Contact | roles, outreach, discovery participation |
| Contact Role | Decision/influence function and seniority | effective-dated; Contact | contact + organization/location |
| Source | Reusable description of where information came from | active/disabled; Evidence | evidence records |
| Evidence Record | Immutable support for a claim/value | captured/reviewed/superseded; Evidence | source, observation, variable value, discovery answer |
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
| Opportunity | A concrete commercial pursuit | open/won/lost/archived; Opportunity | organization, motion, owner, stage history |
| Stage History | Append-only transition record | immutable; Workflow | prospect/opportunity, from/to, reason |
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
- Variable Definition and Score Definition are versioned configuration aggregates. Published versions are immutable.
- Discovery Session owns draft answers; confirmation invokes the Variables service rather than mutating values directly.
- Sequence owns ordering of steps. Existing activities retain the version used when created.
- Opportunity owns its commercial stage; organization research stage remains separately visible.
- Cross-domain code uses application service interfaces and identifiers, never foreign-domain repository access.

## Required invariants

1. One canonical active organization per resolved real-world entity within a tenant/scope.
2. A current variable value cannot silently overwrite provenance; supersession is explicit.
3. Published score definitions and computed input snapshots are immutable.
4. A completed discovery answer retains verbatim text even if its normalized mapping changes.
5. An outreach activity names its channel, actor, time, and outcome status.
6. A stage transition either satisfies the [State Machine](../07-workflows/WORKFLOW_STATE_MACHINE.md) or records an authorized exception.
7. Phase 1 organization roles cannot activate referral workflow behavior.

