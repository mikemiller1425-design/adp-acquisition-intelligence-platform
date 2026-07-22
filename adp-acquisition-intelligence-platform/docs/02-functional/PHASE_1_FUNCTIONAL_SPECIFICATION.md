# Phase 1 Functional Specification

**Version:** 1.1.0  
**Status:** Authoritative business specification

## 1. System loop

```text
Target definition → collection → normalization → evidence → completeness
→ motion scoring → human review → discovery → re-scoring → outreach
→ response/outcome → opportunity/stage history → model feedback
```

Every stage produces durable records, timestamps, actor identity, reason codes, and an actionable next step.

## 2. Units of analysis

The system MUST keep organization, location, contact, commercial motion, discovery session, outreach activity, opportunity, evidence record, variable value, score result, and consent/permission records separate. A score belongs to a subject and score definition/version; an activity belongs to a contact and organization; an opportunity belongs to an organization and motion. Parallel operational dimensions (`prospect_stage`, `research_status`, `outreach_status`, `data_freshness_status`, `opportunity_stage`) MUST remain independent per the [Operational State and Consent Model](../05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md). See the [Entity Catalog](../03-business/BUSINESS_ENTITY_CATALOG.md).

## 3. Functional capabilities

### 3.1 Collection and import

Users can create an organization and contacts manually. CSV import follows `upload → map → validate → normalize → duplicate preview → confirm → report`. Imports MUST support dry run, retain source row and batch ID, show accepted/rejected/skipped counts, and permit a compensating rollback of records created solely by the batch. Malformed or unauthorized fields are rejected with row-level messages.

### 3.2 Identity resolution

Normalization standardizes names, domains, phone numbers, addresses, enums, and nulls. Duplicate candidates use deterministic signals such as normalized legal name, domain, location, and external identifiers. A merge is reviewer-controlled, preserves aliases and audit history, reassigns children transactionally, and is reversible through an explicit administrative process.

### 3.3 Research, evidence, and provenance

A research observation is a claim linked to a source and optionally mapped to a variable. Evidence records store source locator, retrieval date, excerpt or structured payload, reliability, specificity, recency, extraction certainty, and review status. Values are labeled `verified_fact`, `source_derived_fact`, `user_entered_fact`, `calculated`, `ai_inference`, or `unknown`. AI inference MUST never display as verified fact.

### 3.4 Variables and completeness

Variable definitions are configuration-driven. Values support typed content, normalized content, status, confidence, effective time, expiry, source, actor, and visible override metadata. Unknown, not applicable, withheld, contradicted, and stale are distinct statuses. Completeness is weighted by required inputs for a purpose, not simply by field count. The system calculates overall, acquisition, wholesale, CAS, direct-payroll, discovery-readiness, and outreach-readiness completeness.

### 3.5 Scoring and recommendations

Scores are deterministic functions of a versioned definition and immutable input snapshot. Low-confidence inputs reduce score confidence, not necessarily raw fit. Results include score, tier, confidence, completeness, positive/negative factors, missing high-impact variables, recommended action, and version. If minimum completeness is unmet, the score is `provisional` or `insufficient_data` according to its definition. See [Scoring Specification](../08-scoring/SCORING_ENGINE_SPECIFICATION.md).

### 3.6 Qualification review

Review outcomes are `qualified`, `conditionally_qualified`, `research_required`, `nurture`, `disqualified`, `duplicate`, `existing_relationship`, and `out_of_territory`. The reviewer sees evidence, score explanations, completeness, unknowns, and conflicts. Overrides require reason and actor; policy-sensitive outcomes may require a reviewer role. A decision creates a next task or terminal reason.

### 3.7 Discovery

The platform selects recommended questions using motion, organization type, industry, contact role, missing high-impact variables, and prior answers. It stores the original answer separately from normalized interpretations. Users confirm mappings before values change. Confirmed mappings create evidence, supersede or contradict prior values according to policy, recalculate affected scores, record pre/post score deltas, and recommend a next action.

### 3.8 Outreach tracking

Phase 1 supports campaigns, reusable sequences, templates, steps, recipients, drafts, manual sent/attempted records, responses, and next actions for email, phone, voicemail, LinkedIn, internal introduction, meeting, and manual follow-up. Content MUST be human-reviewed before use. The platform does not send autonomously. Responses use controlled classes including positive, negative, alternate contact, provider lock-in, timing issue, needs information, meeting booked, unsubscribe, no longer relevant, no response, and unknown.

### 3.8a Consent, channel permission, and suppression

Outreach and contact attempts MUST evaluate server-side effective permission for the contact, organization, and channel. Canonical states are `allowed`, `unknown`, `restricted`, `opted_out`, and `not_applicable`. **`unknown` is never treated as `allowed`.** The model includes contact channel permissions, organization communication restrictions, and global/channel suppressions with source, scope, effective/expiry/revocation times, actor, reason, evidence links, and append-only supersession history. Precedence: global suppression → organization restriction → channel opt-out → contact permission; revoked/expired rows are inactive; conflicts resolve to the most restrictive state until reviewed. UI disablement is convenience only. Permission changes that lift `opted_out` or global suppression require reviewer/admin authorization. This is technical enforcement and auditability—not a claim of legal compliance. See [Operational State and Consent Model](../05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md).

### 3.8b Parallel operational states

The system MUST persist and display these dimensions separately and MUST NOT collapse them into one organization status field:

| Dimension | Subject | Role |
|---|---|---|
| `prospect_stage` | Organization | Commercial funnel position |
| `research_status` | Organization | Research/gap posture |
| `outreach_status` | Organization | Outreach operational posture |
| `data_freshness_status` | Organization | Aggregate intelligence freshness |
| `opportunity_stage` | Opportunity | Stage of a specific opportunity |

Creating an opportunity does not clear research gaps. Stale evidence updates freshness/research posture without inventing fit. Outreach blocks from consent MUST NOT mutate scores. Opportunity stage moves independently of prospect stage subject to the relationship rules in the Operational State and Consent Model. Every transition appends history via `operational_state_transitions` and is audited.

### 3.9 Opportunities and stage history

Qualified work can create an opportunity with motion, potential value, probability, owner, stage, next action, and risk. Every stage transition records previous/new stage, actor, time, reason, and validation result in `operational_state_transitions` (`dimension=opportunity_stage`). Terminal outcomes retain structured loss/disqualification reason. Phase 1 allows at most one open opportunity per organization per commercial motion.

### 3.10 Tasks, notes, ownership, and territory

Every active prospect SHOULD have an owner and next action. Tasks have due time, status, priority, subject, and assignee. Notes do not replace structured fields. Territory and existing-relationship checks can block qualification or outreach. Authorization is role- and territory-aware.

### 3.11 Dashboards and exports

Eight dashboard views cover executive overview, prospect master, collection/research, scoring, discovery, outreach, opportunity/stage, and model performance. Tables support filters, sorting, pagination, saved views, drill-down, and CSV export, including independent filters for parallel operational dimensions and permission/restriction flags. PDF is optional and must not block Phase 1. Metrics define numerator, denominator, inclusion window, timezone, and refresh time. Exports MUST mask or omit channel values that are opted out/restricted per authorization. See [Dashboard Specification](../10-dashboards/DASHBOARD_SPECIFICATION.md) and [Operational State and Consent Model](../05-data/OPERATIONAL_STATE_AND_CONSENT_MODEL.md).

## 4. Cross-cutting requirements

- Archive by default; hard deletion is restricted and separately audited.
- All writes validate authorization, input schema, and optimistic concurrency where edits may collide.
- Audit events are append-only and redact secrets.
- Personally identifiable information is minimized and access-controlled.
- User-visible calculations expose “why,” freshness, and source.
- Time is stored in UTC and displayed in the user timezone.
- Accessible keyboard operation, focus states, labels, and contrast are required.
- Empty, loading, partial, stale, permission-denied, and error states are designed explicitly.

## 5. End-to-end acceptance scenario

Import at least 25 organizations including malformed and duplicate rows; resolve duplicates; research one target with conflicting evidence; display high-impact unknowns; calculate all applicable scores; qualify it; generate a discovery agenda; record and map answers; verify score deltas; select an outreach sequence; verify channel permission allows the attempt; record a contact attempt and positive response; create an opportunity while research gaps may remain open; advance opportunity stage independently; view audit and operational-state history; filter each dashboard by parallel dimensions; export the prospect, scoring, discovery, outreach, and opportunity tables with permission-aware redaction. No step may require direct database editing.

## 6. Explicit deferrals

Referral-partner entities and workflows, automated enrichment/monitoring, CRM/email/calendar synchronization, machine learning, proposal generation, and autonomous outbound are later phases. Extension seams MAY exist; dormant UI and speculative implementation MUST NOT.

