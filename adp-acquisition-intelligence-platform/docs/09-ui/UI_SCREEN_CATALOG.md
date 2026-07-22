# UI Screen Catalog

**Version:** 1.1.0

## Global shell

Authenticated shell with role-aware navigation, global organization search, task indicator, import/export job status, help, user/timezone controls, and environment badge outside production. Every screen supports loading, empty, partial-data, stale, permission-denied, offline/retry, and recoverable error states.

## Screens

| ID | Route concept | Purpose | Primary actions |
|---|---|---|---|
| UI-01 | `/dashboard` | Executive overview | filter period/owner/territory/parallel dimensions, drill into metrics |
| UI-02 | `/prospects` | Prospect master table | filter by prospect/research/outreach/freshness, save view, bulk assign/tag, export |
| UI-03 | `/prospects/new` | Manual organization/contact entry | validate, duplicate check, create |
| UI-04 | `/prospects/:id` | Organization 360 | inspect summary, parallel states, variables, evidence, scores, consent, activity, next action |
| UI-05 | `/imports` | Import history and start | upload, map, dry run (incl. consent impacts), inspect errors, commit/revert |
| UI-06 | `/imports/:id` | Batch detail | row results, entity links, error export |
| UI-07 | `/duplicates` | Duplicate review queue | compare, merge, dismiss, defer |
| UI-08 | `/research` | Research queue/table | prioritize gaps, filter research_status/freshness, assign, open evidence entry |
| UI-09 | `/evidence/:id` | Evidence detail | inspect claim/source/context, accept/reject/contradict |
| UI-10 | `/scoring` | Multi-motion scoring table | compare scores, confidence/completeness, recalculate authorized set |
| UI-11 | `/scores/:id` | Score explanation | view snapshot, contributions, gaps, version/history |
| UI-12 | `/reviews` | Qualification queue | route and assign reviewer |
| UI-13 | `/reviews/:id` | Review workspace | decide, override with reason, create task |
| UI-14 | `/discovery` | Discovery table/calendar list | prepare/schedule/open session |
| UI-15 | `/discovery/:id/agenda` | Agenda builder | accept/reorder recommended questions, export agenda |
| UI-16 | `/discovery/:id` | Session capture | record verbatim answers and proposed mappings |
| UI-17 | `/discovery/:id/review` | Mapping and score-delta review | confirm/reject mappings, recalculate, route |
| UI-18 | `/outreach` | Outreach operations table | select sequence, review drafts, record activity/response; show channel permission ruling |
| UI-19 | `/outreach/templates` | Template/sequence library | draft, approve, version, retire |
| UI-20 | `/opportunities` | Opportunity/stage table | advance `opportunity_stage`, flag risk, record outcome |
| UI-21 | `/performance` | Model performance | inspect funnel/cohorts by score/motion/message |
| UI-22 | `/tasks` | Work queue | assign, prioritize, complete, reschedule |
| UI-23 | `/admin/variables` | Variable definitions | view/version/publish authorized configuration |
| UI-24 | `/admin/scoring` | Score definitions | validate, replay, activate/retire version |
| UI-25 | `/admin/access` | Users/roles/territories | administer access and assignments |
| UI-26 | `/audit` | Audit search | inspect actor/action/subject incl. permission blocks and state transitions; restricted export |
| UI-27 | `/admin/consent` | Consent, restrictions, suppressions | assert/supersede permissions, org restrictions, global suppressions; attach evidence; lift opt-out with reviewer |

## Organization 360 layout

Header: identity, aliases, firm type, owner, territory, **`prospect_stage`**, **`research_status`**, **`outreach_status`**, **`data_freshness_status`**, primary/secondary motion, completeness/confidence, last activity, next action. Tabs: overview, variables, evidence, scores, qualification, discovery, outreach (with per-contact channel permissions), opportunities (`opportunity_stage`), consent/restrictions, tasks/notes, history (`operational_state_transitions` + audit). Score cards always display state/version, confidence, completeness, positive/negative factors, and high-impact gaps. Channel actions that are not effectively `allowed` are disabled with an explanation; server enforcement remains authoritative.

## Interaction standards

- Destructive/merging actions require impact preview and confirmation.
- Autosave is permitted for drafts only; committed business transitions use explicit submit.
- Long-running operations return job state and are safe to leave/revisit.
- Tables allow column choice, fixed identity column, keyboard navigation, accessible labels, pagination, and URL-addressable filters (including parallel-dimension facets).
- Inline edits validate immediately and show source/confidence requirements.
- Tooltips cannot contain essential-only information.
- User-facing dates show timezone; exports document UTC convention and permission redaction.

## Permissions

Researchers can propose evidence/values and non-lifting permission asserts; reviewers accept conflicts/merges, qualification decisions, and opt-out lifts; sales users manage discovery/outreach/opportunities within assignments; administrators publish definitions, manage access, and global suppressions. Permissions are server-enforced and UI-hidden/disabled states are convenience only.

See [Dashboard Specification](../10-dashboards/DASHBOARD_SPECIFICATION.md), [Functional Specification](../02-functional/PHASE_1_FUNCTIONAL_SPECIFICATION.md), and [Operational State and Consent Model](../05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md).
