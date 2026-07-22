# Operational State and Consent Model

**Version:** 1.0.0  
**Status:** Canonical for Phase 1  
**Resolves:** CONF-005, CONF-009  
**Authority:** Complements the [Workflow State Machine](../07-workflows/WORKFLOW_STATE_MACHINE.md) (lifecycle transitions), [Functional Specification](../02-functional/PHASE_1_FUNCTIONAL_SPECIFICATION.md) (business behavior), and [Database Architecture](DATABASE_ARCHITECTURE.md) (persistence). Where this document defines parallel operational dimensions or consent/permission enforcement, it is authoritative for those subjects.

**Disclaimer:** This model provides technical enforcement and auditability. It does **not** claim legal compliance. Legal and privacy owners must approve production policies separately.

---

## 0. Explicit non-goals

- Legal advice, regulatory compliance certification, or jurisdiction-specific consent frameworks.
- Autonomous message sending or external ESP/CRM sync.
- Phase 2 referral-partner introduction permissions or partner portals.
- Collapsing operational dimensions into a single `organizations.status`.
- Treating `unknown` channel permission as `allowed`.
- Soft-deleting audit or transition history to “fix” consent mistakes.
- Field-level marketing preference centers beyond Phase 1 outreach channels listed here.

---

## 1. Canonical persistence approach (CONF-005 decision)

### Decision

Use **current-state columns on the subject entity** plus **one append-only transition history table** shared across dimensions, plus a **single workflow transition application service**.

| Concern | Choice |
|---|---|
| Current state | Typed columns on the subject (`organizations` or `opportunities`) |
| History | `operational_state_transitions` (append-only) |
| Controlled vocabulary | Database enums **or** versioned reference tables with identical keys; API/storage keys are `snake_case` |
| Transition orchestration | `OperationalStateService` (application service); domain packages call it—UI never writes columns directly |
| Record lifecycle | Separate `record_status` (`active` \| `archived`) on organizations/contacts—**not** an operational dimension |

### Rejected alternatives

| Alternative | Why rejected |
|---|---|
| One overloaded `organizations.status` | Violates parallel-state rule; breaks dashboards and guards |
| Dedicated current-state table per dimension | Extra joins without benefit for 1:1 org dimensions |
| History-only (derive current from last event) | Harder queries, race conditions, weaker invariants |
| Separate history table per dimension | Duplicates transition contract and audit shape |

### What each dimension needs

| Dimension | Current-state column | Dedicated current-state table | History table | Transition service | Controlled vocabulary |
|---|---|---|---|---|---|
| `prospect_stage` | Yes — `organizations.prospect_stage` | No | Yes — shared | Yes — shared | Yes — enum/ref |
| `research_status` | Yes — `organizations.research_status` | No | Yes — shared | Yes — shared | Yes — enum/ref |
| `outreach_status` | Yes — `organizations.outreach_status` | No | Yes — shared | Yes — shared | Yes — enum/ref |
| `data_freshness_status` | Yes — `organizations.data_freshness_status` | No | Yes — shared (incl. system actors) | Yes — shared (+ automated evaluators) | Yes — enum/ref |
| `opportunity_stage` | Yes — `opportunities.opportunity_stage` | No | Yes — shared (`subject_type=opportunity`) | Yes — shared | Yes — enum/ref |

`stage_history` (prior name) is **superseded** by `operational_state_transitions`. Prompt 2 MUST implement the new table; do not introduce a second parallel history mechanism.

---

## 2. Parallel-state definitions

Storage and API keys use `snake_case`. Diagrams MAY show Title Case labels that map 1:1 to these keys.

### 2.1 `prospect_stage`

| Field | Definition |
|---|---|
| Purpose | Where the organization sits in the commercial pursuit funnel |
| Subject entity | Organization |
| Canonical storage key | `organizations.prospect_stage` |
| Allowed values | `raw`, `normalization`, `research`, `scored`, `review`, `research_required`, `qualified`, `discovery_scheduled`, `discovery_completed`, `outreach_ready`, `outreach_active`, `opportunity`, `nurture`, `disqualified`, `duplicate`, `existing_relationship`, `out_of_territory` |
| Initial value | `raw` (manual draft or import before normalization completes) |
| Terminal values | `disqualified`, `duplicate`, `existing_relationship`, `out_of_territory` are **routed/terminal for active pursuit** (not hard delete). `won`/`lost` are **opportunity** terminals, not prospect_stage values. Re-entry from routed states requires authorized reason (see State Machine; detailed re-entry matrix remains CONF-015) |
| Entry criteria | Satisfies [Workflow State Machine](../07-workflows/WORKFLOW_STATE_MACHINE.md) guards for the target value |
| Exit criteria | Target transition allowed; required outputs present; no blocking policy unless authorized exception |
| Allowed transitions | See §3.1 |
| Blocked transitions | Unresolved duplicate identity; unauthorized territory; restricted org communication for pursuit-advancing outreach steps; insufficient-data opportunity creation without reviewer exception; any write by unauthorized actor |
| Actor permissions | Importer/researcher: early stages; reviewer: qualification routes; sales: discovery/outreach/opportunity-linked advances within assignment; admin: exceptions with reason |
| Transition reason requirements | Required for all routed terminals, re-entry, exceptions, and nurture. Optional note for happy-path advances; structured `reason_code` preferred |
| Current-state storage | Column on `organizations` |
| Append-only history | `operational_state_transitions` with `dimension=prospect_stage` |
| Audit behavior | Transition row + `audit_events` for consequential changes |
| Task side effects | Creates/closes/reassigns tasks per transition config (review task, research gaps, follow-up) |
| Dashboard usage | D1 funnel, D2 prospect stage column, Org 360 header |
| API representation | `prospect_stage: enum` on organization resources; transition via command `TransitionProspectStage` |
| Unknown behavior | Not applicable—stage is always set. Missing migration backfill uses `raw` only for pre-normalization orphans |
| Archive behavior | Archiving organization cancels open tasks; columns retained; history retained |

### 2.2 `research_status`

| Field | Definition |
|---|---|
| Purpose | Research workability and gap posture—independent of commercial funnel position |
| Subject entity | Organization |
| Canonical storage key | `organizations.research_status` |
| Allowed values | `not_started`, `in_progress`, `gaps_open`, `awaiting_review`, `sufficient_for_purpose`, `blocked_conflict`, `paused` |
| Initial value | `not_started` |
| Terminal values | None required. `sufficient_for_purpose` is a success posture, not a deleted state |
| Entry / exit | Driven by research/evidence/completeness events and human actions (see §3.2) |
| Allowed / blocked transitions | See §3.2. Must not be overwritten by outreach or opportunity stage changes |
| Actor permissions | Researcher proposes; reviewer resolves conflicts; system may set `gaps_open` / `blocked_conflict` from stale/contradicted evidence rules |
| Reason requirements | Required for `paused`, `blocked_conflict` manual sets, and forced overrides |
| Current / history / audit / tasks | Same pattern as §1; research gap tasks on `gaps_open` / `blocked_conflict` |
| Dashboard usage | D3 research queue; Org 360; may show alongside `prospect_stage=outreach_active` |
| API | `research_status` field; commands `TransitionResearchStatus` / system evaluator jobs |
| Unknown behavior | If evaluator cannot compute freshness/gaps, leave prior status and set `data_freshness_status=unknown` rather than inventing research progress |
| Archive behavior | Retained |

### 2.3 `outreach_status`

| Field | Definition |
|---|---|
| Purpose | Outreach operational posture for the organization (not channel permission) |
| Subject entity | Organization |
| Canonical storage key | `organizations.outreach_status` |
| Allowed values | `not_started`, `ready`, `active`, `waiting_response`, `paused`, `completed`, `blocked_restriction`, `do_not_contact` |
| Initial value | `not_started` |
| Terminal values | `completed`, `do_not_contact` (operational terminals; reversible only with authorized reason) |
| Relationship to consent | Permission denials set or keep `blocked_restriction` / `do_not_contact` **without** changing fit scores or `prospect_stage` qualification value except where State Machine already requires a separate route |
| Allowed / blocked | See §3.3. Recording activity requires effective channel permission = `allowed` |
| Actors | Sales users within territory; reviewers/admins for restriction overrides documentation (cannot bypass opt-out without explicit admin+reason policy path that still audits denial if policy forbids send) |
| Reason requirements | Required for `paused`, `blocked_restriction`, `do_not_contact`, and re-activation |
| Dashboard / API | D6; `outreach_status` on org; commands via OutreachService that also call OperationalStateService |
| Unknown behavior | N/A for status itself; channel permission `unknown` blocks send (see §5) |
| Archive behavior | Retained; active sequences cancelled on org archive |

### 2.4 `data_freshness_status`

| Field | Definition |
|---|---|
| Purpose | Aggregate freshness posture of high-impact intelligence for the organization |
| Subject entity | Organization |
| Canonical storage key | `organizations.data_freshness_status` |
| Allowed values | `current`, `aging`, `stale`, `mixed`, `unknown` |
| Initial value | `unknown` |
| Terminal values | None |
| Entry / exit | Computed from variable/evidence expiry and stale markers; human may acknowledge but cannot mark `current` without evidence meeting policy |
| Transitions | See §3.4. Primarily system-driven |
| Actors | System evaluator; researchers trigger recompute after evidence changes |
| Reason | System reason codes (`evidence_expired`, `conflict_detected`, `reverified`) |
| Side effects | Moving to `stale` or `mixed` SHOULD set `research_status` to `gaps_open` when high-impact inputs are affected (unless already `blocked_conflict` or `paused`) |
| Dashboard / API | D3 freshness filters; Org 360; field on organization |
| Unknown behavior | Default and fallback when insufficient metadata exists |
| Archive behavior | Retained; evaluators skip archived orgs |

### 2.5 `opportunity_stage`

| Field | Definition |
|---|---|
| Purpose | Commercial stage of a **specific opportunity** aggregate |
| Subject entity | Opportunity |
| Canonical storage key | `opportunities.opportunity_stage` |
| Allowed values | `open`, `discovery_validation`, `solution_alignment`, `commercial_review`, `won`, `lost`, `nurture` |
| Initial value | `open` |
| Terminal values | `won`, `lost` (and optionally long-lived `nurture` as parked) |
| Independence | Changes **independently** of `organizations.prospect_stage` once an opportunity exists; org `prospect_stage` becomes `opportunity` when the first open opportunity is created (see §4) |
| Allowed / blocked | See §3.5 and State Machine opportunity rules |
| Actors | Sales owner; reviewer for exceptions |
| Reason | Required for `lost`, `nurture`, and probability overrides |
| History | `operational_state_transitions` with `subject_type=opportunity`, `dimension=opportunity_stage` |
| Dashboard / API | D7; opportunity resource field; `TransitionOpportunityStage` |
| Unknown behavior | N/A |
| Archive behavior | Opportunity `record_status` archive retains stage + history |

---

## 3. State-transition matrices

Notation: rows = from, columns = to. `Y` = allowed when guards pass. `R` = allowed with structured reason + elevated role. `S` = system-only. Blank = blocked.

### 3.1 `prospect_stage` (happy path and routes)

Primary happy path:

`raw → normalization → research → scored → review → qualified → discovery_scheduled → discovery_completed → outreach_ready → outreach_active → opportunity`

Also: `review → research_required → research` (then re-score path `research → scored → review`).  
Routes from `review`: `nurture`, `disqualified`, `duplicate`, `existing_relationship`, `out_of_territory`.

| From \ To | normalization | research | scored | review | research_required | qualified | discovery_scheduled | discovery_completed | outreach_ready | outreach_active | opportunity | nurture | disqualified | duplicate | existing_relationship | out_of_territory |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| raw | Y | | | | | | | | | | | | | | | |
| normalization | | Y | | | | | | | | | | | | R | | |
| research | | | Y | | | | | | | | | | | | | |
| scored | | | | Y | | | | | | | | | | | | |
| review | | | | | Y | Y | | | | | | Y | Y | Y | Y | Y |
| research_required | | Y | | | | | | | | | | | | | | |
| qualified | | | | | | | Y | | | | | R | R | | | |
| discovery_scheduled | | | | | | | | Y | | | | R | | | | |
| discovery_completed | | | | | | | | | Y | | | R | | | | |
| outreach_ready | | | | | | | | | | Y | | R | | | | |
| outreach_active | | | | | | | | | | | Y | R | | | | |
| opportunity | | | | | | | | | | R | | R | | | | |
| nurture / terminals | | | | | | R | | | | | | | | | | |

Re-entry specifics beyond this summary remain tracked under CONF-015.

### 3.2 `research_status`

| From \ To | not_started | in_progress | gaps_open | awaiting_review | sufficient_for_purpose | blocked_conflict | paused |
|---|---|---|---|---|---|---|---|
| not_started | | Y | Y | | | | Y |
| in_progress | | | Y | Y | Y | Y | Y |
| gaps_open | | Y | | Y | | Y | Y |
| awaiting_review | | Y | Y | | Y | Y | Y |
| sufficient_for_purpose | | Y | Y | | | Y | Y |
| blocked_conflict | | Y | Y | Y | | | Y |
| paused | | Y | Y | | | | |

System may set `gaps_open` or `blocked_conflict` (`S`/`Y` with system actor). Outreach/opportunity transitions MUST NOT clear `gaps_open`.

### 3.3 `outreach_status`

| From \ To | not_started | ready | active | waiting_response | paused | completed | blocked_restriction | do_not_contact |
|---|---|---|---|---|---|---|---|---|
| not_started | | Y | | | | | Y | Y |
| ready | | | Y | | Y | | Y | Y |
| active | | | | Y | Y | Y | Y | Y |
| waiting_response | | | Y | | Y | Y | Y | Y |
| paused | | Y | Y | | | | Y | Y |
| completed | | R | | | | | | Y |
| blocked_restriction | | R | | | | | | Y |
| do_not_contact | | | | | | | | |

Moving to `ready`/`active` requires at least one recipient contact with an effective `allowed` permission on the intended channel (see §8). Denial sets `blocked_restriction` without changing scores.

### 3.4 `data_freshness_status`

| From \ To | current | aging | stale | mixed | unknown |
|---|---|---|---|---|---|
| unknown | S | S | S | S | |
| current | | S | S | S | S |
| aging | S | | S | S | S |
| stale | S | S | | S | S |
| mixed | S | S | S | | S |

Human override to `current` is **blocked**. Humans may trigger recompute after verification.

### 3.5 `opportunity_stage`

| From \ To | open | discovery_validation | solution_alignment | commercial_review | won | lost | nurture |
|---|---|---|---|---|---|---|---|
| open | | Y | | | | Y | Y |
| discovery_validation | | | Y | | | Y | Y |
| solution_alignment | | R | | Y | | Y | Y |
| commercial_review | | | R | | Y | Y | Y |
| nurture | R | R | | | | Y | |
| won / lost | | | | | | | |

---

## 4. Cross-dimension relationship rules

1. **Prospect becoming an opportunity:** Creating the first open opportunity for an organization MUST transition `prospect_stage` to `opportunity` (with history) and set `opportunity_stage=open` on the opportunity. It MUST NOT force `research_status` to `sufficient_for_purpose` or clear gaps.
2. **Research after outreach:** `prospect_stage` in `outreach_ready` / `outreach_active` / `opportunity` MAY coexist with `research_status` in `gaps_open`, `in_progress`, or `blocked_conflict`.
3. **Stale evidence:** Evaluator sets `data_freshness_status` to `stale` or `mixed` and, when high-impact inputs are affected, sets `research_status=gaps_open` (unless `paused` or `blocked_conflict`). Fit scores are not silently altered; recalculation may yield provisional/insufficient per Scoring Spec.
4. **Outreach blocked without changing fit:** Effective permission ≠ `allowed` blocks activity creation, may set `outreach_status=blocked_restriction` or `do_not_contact`, and MUST NOT mutate score results or pretend qualification changed.
5. **Opportunity stage independence:** `opportunity_stage` transitions do not rewrite `prospect_stage` except: (a) first open opportunity ⇒ `prospect_stage=opportunity`; (b) optional product policy when **all** opportunities are `lost`/`won` may move prospect to `nurture` or keep `opportunity`—Phase 1 default: **keep `prospect_stage=opportunity`** while any opportunity exists (open or terminal) until an authorized prospect transition occurs; dashboards use opportunity filters for pipeline.
6. **Cardinality (Phase 1):** At most **one open** opportunity per organization per commercial motion. Additional motions may each have one open opportunity.
7. **Record status vs operational state:** `record_status=archived` stops active work; operational columns remain for history.

---

## 5. Consent and permission model (CONF-009)

### 5.1 Entities

| Entity | Purpose | Subject |
|---|---|---|
| Contact Channel Permission | Effective permission for one contact on one channel | Contact (+ organization via contact) |
| Organization Communication Restriction | Org-level restriction that can limit all or selected channels | Organization |
| Suppression Entry | Global or channel-specific suppression keyed by identifier and/or contact | Tenant/scope global, or contact/org-linked |
| Permission Evidence Link | Links a permission/restriction/suppression record to evidence | Permission aggregate |

### 5.2 Channels

`email`, `phone`, `voicemail`, `linkedin`, `internal_introduction`, `meeting`, `manual_follow_up`

### 5.3 Permission states

`allowed` | `unknown` | `restricted` | `opted_out` | `not_applicable`

**`unknown` is never treated as `allowed`.**

### 5.4 Record fields (all permission-like aggregates)

| Field | Meaning |
|---|---|
| `channel` | One of §5.2, or `null`/`all` where org restriction/suppression is global across channels |
| `state` | One of §5.3 (suppressions use `opted_out` or `restricted`) |
| `scope` | `contact_channel` \| `organization` \| `organization_channel` \| `global` \| `global_channel` |
| `source` | `user_asserted` \| `import` \| `discovery` \| `response_unsubscribe` \| `admin` \| `policy` \| `system` |
| `effective_at` | UTC start |
| `expires_at` | UTC end (nullable = open-ended) |
| `revoked_at` | UTC revocation (nullable) |
| `captured_by_user_id` | Actor |
| `reason_code` / `reason_note` | Why |
| `evidence_record_ids` | Supporting evidence (optional but required for opt-out from response when available) |
| `record_version` / supersession | Prior rows superseded explicitly; corrections create new effective-dated rows |

Permission rows are **immutable once effective**: corrections supersede (new row); do not rewrite history.

### 5.5 Precedence rules (highest wins = most restrictive)

1. **Global suppression** overrides every channel and contact permission.
2. **Organization restrictions** override contact permission where applicable (same channel or org-wide).
3. **Channel-specific opt-out** blocks that channel for the contact (and matching identifiers).
4. **Revoked or expired** permission is not active permission; effective state falls through to next applicable record or `unknown`.
5. **Conflicting** concurrent effective records resolve to the **most restrictive** effective state until a reviewer resolves supersession (`opted_out` > `restricted` > `unknown` > `not_applicable` > `allowed`).
6. **UI visibility does not replace server-side enforcement.** OutreachService MUST call ConsentPermissionService on every activity/draft-approval that would contact a person.

### 5.6 Effective permission algorithm (server)

```text
evaluate(contact, organization, channel, at_time):
  if global suppression matches contact identifiers or contact_id at_time → deny(opted_out|restricted)
  if org restriction (all channels or this channel) active at_time → deny(restricted|opted_out)
  if contact channel permission active at_time:
     return that state (after expiry/revocation checks)
  else → unknown
  if conflicts among equally scoped rows → most restrictive
  allow activity only if final state == allowed
```

### 5.7 Authorization

| Action | Researcher | Sales | Reviewer | Admin |
|---|---|---|---|---|
| Assert `unknown` / `allowed` with evidence (non-opt-out) | Y | Y (assigned) | Y | Y |
| Set `restricted` | Y | Y (assigned) | Y | Y |
| Set `opted_out` | Y | Y | Y | Y |
| Clear/supersede `opted_out` to `allowed` | | | Y | Y |
| Create/lift global suppression | | | | Y |
| Org-wide communication restriction | | | Y | Y |
| Import consent columns | via import commit roles | | | Y |

Reviewer approval **required** to move from `opted_out` → `allowed` or to lift global suppression.

### 5.8 Evidence, import, outreach, audit, export, retention

- **Evidence:** Opt-out from unsubscribe/response SHOULD link the response/activity evidence; manual changes SHOULD attach note + optional evidence.
- **Import:** Consent/permission columns map into proposed permission rows; dry-run shows effective state impact; `allowed` from import without source/evidence is stored as `unknown` unless policy flag `accept_import_allowed=true` (admin-only). Conflicting import vs existing opt-out keeps opt-out.
- **Outreach check:** Before draft approval for send-attempt recording and before completing an outbound activity, evaluate permission; on deny, refuse command, set/keep `outreach_status=blocked_restriction` when org-level pursuit blocked, write audit `outreach_blocked_by_permission`.
- **Blocked attempts:** Always audited with contact, channel, effective state, rule that fired, actor, correlation id.
- **Exports:** Restricted/opted-out contact channels are suppressed or masked per export classification; export metadata notes redaction; authorization revalidated.
- **Deletion/retention:** Permission and suppression history follow retention policy (DEC-012); prefer archive/supersession over hard delete; privacy hard-delete is a separately audited workflow and MUST retain non-identifying audit of the deletion event.

---

## 6. Database-oriented field definitions

### 6.1 Organization operational columns

```text
organizations.record_status          -- active | archived
organizations.prospect_stage         -- enum §2.1
organizations.research_status        -- enum §2.2
organizations.outreach_status        -- enum §2.3
organizations.data_freshness_status  -- enum §2.4
organizations.existing_relationship_flag
organizations.row_version
```

Do **not** store prospect/research/outreach/freshness in a single `status` column.

### 6.2 Opportunity

```text
opportunities.opportunity_stage  -- enum §2.5
opportunities.record_status      -- active | archived
opportunities.row_version
```

### 6.3 History

```text
operational_state_transitions
  id, tenant_id?, subject_type, subject_id,
  dimension, from_value, to_value,
  actor_user_id, actor_type,  -- user | system
  reason_code, reason_note,
  command_correlation_id,
  validation_result, exception_authorized,
  related_score_result_id?, related_review_id?,
  created_at
```

Indexes: `(subject_type, subject_id, dimension, created_at DESC)`, `(dimension, to_value, created_at)`.

### 6.4 Consent tables

```text
contact_channel_permissions
  id, contact_id, channel, state, source,
  effective_at, expires_at, revoked_at,
  captured_by_user_id, reason_code, reason_note,
  superseded_by_id?, created_at

organization_communication_restrictions
  id, organization_id, channel_nullable, state, source,
  effective_at, expires_at, revoked_at,
  captured_by_user_id, reason_code, reason_note,
  superseded_by_id?, created_at

suppression_entries
  id, scope, channel_nullable,
  contact_id?, organization_id?,
  identifier_type?, identifier_hash?,  -- email/phone normalized hash
  state, source, effective_at, expires_at, revoked_at,
  captured_by_user_id, reason_code, reason_note,
  superseded_by_id?, created_at

permission_evidence_links
  id, subject_type, subject_id, evidence_record_id, created_at
```

Partial unique constraints SHOULD ensure one **current non-revoked** row per natural key where feasible; otherwise enforce in transaction logic.

---

## 7. Service interface contracts

### 7.1 `OperationalStateService`

| Item | Contract |
|---|---|
| Commands | `TransitionProspectStage`, `TransitionResearchStatus`, `TransitionOutreachStatus`, `TransitionOpportunityStage`, `RecomputeDataFreshness` |
| Inputs | subject id, target value, actor, reason, correlation id, optional exception flag |
| Outputs | new current state, transition id |
| Validation | matrix + State Machine guards + authz + concurrency version |
| Side effects | history insert, audit, tasks, outbox events |
| Failures | `TRANSITION_BLOCKED`, `UNAUTHORIZED`, `CONFLICT_VERSION`, `VALIDATION_FAILED` — prior state unchanged |

### 7.2 `ConsentPermissionService`

| Item | Contract |
|---|---|
| Commands | `AssertContactChannelPermission`, `SupersedePermission`, `SetOrganizationRestriction`, `UpsertSuppression`, `RevokeSuppression` |
| Queries | `EvaluateOutreachPermission(contactId, organizationId, channel, at)` → `{ state, ruling_rule, evidence_refs }` |
| Side effects | immutable row insert / supersession, audit, optional outreach_status transition request |
| Failures | `PERMISSION_DENIED_CHANGE`, `REVIEWER_REQUIRED`, `VALIDATION_FAILED` |

### 7.3 `OutreachService` (enforcement hook)

MUST call `EvaluateOutreachPermission` before approving outbound drafts or completing outbound activities. On deny: no activity completion as sent; audit block; optional status transition to `blocked_restriction`.

### 7.4 `ImportService` (consent columns)

Maps consent fields to proposed permission rows; never auto-lifts opt-out; dry-run reports effective permission impacts.

---

## 8. Authorization, audit, import, outreach, UI, dashboards

- **Authorization:** Territory-scoped; object-level checks on organization/contact; field masking for restricted channels on read/export.
- **Audit:** All permission changes, evaluations that block outreach, and state transitions are append-only audit subjects (minimize PII; prefer hashes for suppressed identifiers).
- **UI:** Org 360 shows four org dimensions + linked opportunities’ stages; contact panel shows per-channel effective permission and ruling rule; outreach UI disables channels server-denied and explains why.
- **Dashboards:** Filter/facet by each dimension independently (D1–D7). Restriction flags on D6 derive from effective permission ≠ `allowed` or `outreach_status` in `blocked_restriction` / `do_not_contact`.

Screens: extend Org 360 and contact views; add **UI-27** consent/suppression admin (see UI catalog).

---

## 9. Test scenarios

1. Org with `prospect_stage=outreach_active`, `research_status=gaps_open`, open opportunity `opportunity_stage=discovery_validation` — all three readable independently.
2. Stale high-impact evidence ⇒ `data_freshness_status=stale` and `research_status=gaps_open`; scores unchanged until recalc.
3. Opt-out on email blocks email activity; phone `allowed` still permitted; scores unchanged; audit written.
4. Global suppression blocks all channels despite contact `allowed`.
5. Org restriction overrides contact `allowed`.
6. Expired `allowed` falls back to `unknown` and blocks outreach.
7. Conflicting rows ⇒ most restrictive until reviewer supersedes.
8. Import cannot lift existing opt-out; dry-run shows skip/conflict.
9. `unknown` permission never allows outreach.
10. Transition matrices reject illegal moves; failure leaves prior state.
11. First opportunity creation sets `prospect_stage=opportunity` and history rows for both dimensions.
12. Export masks opted-out channel values for unauthorized exporters.

---

## 10. Phase 2 extension considerations

- Partner introduction permissions and referral-network edges MAY reuse suppression/permission primitives with new scopes (`partner_introduction`) but MUST NOT activate in Phase 1 UI/workflows.
- Organization roles marked partner-capable remain dormant regarding referral transitions.

---

## 11. Traceability

| Concern | Primary docs |
|---|---|
| Business behavior | Functional Spec §3.8a–3.8b, §3.12 |
| Entities | Business Entity Catalog |
| Persistence | Database Architecture |
| Transitions | Workflow State Machine + this doc §3 |
| Services | Technical Architecture + Blueprint |
| UI/Dashboards | UI Screen Catalog, Dashboard Spec |
| Tests | Testing Master Plan scenarios 9, 13–14 |
| Conflicts | CONF-005, CONF-009 resolved |
