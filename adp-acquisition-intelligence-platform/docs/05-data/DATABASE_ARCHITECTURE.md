# Database Architecture

**Version:** 1.2.0

## Conventions

PostgreSQL is the reference datastore. Tables use `uuid` primary keys; `created_at`, `updated_at`, and optional `archived_at`; UTC `timestamptz`; constrained enums or reference tables; and explicit foreign-key behavior. Human-facing identifiers are separate from primary keys. JSON is reserved for immutable snapshots, flexible evidence payloads, and configuration—not core relationships.

Operational parallel states and consent persistence are specified in [Operational State and Consent Model](OPERATIONAL_STATE_AND_CONSENT_MODEL.md).

## Canonical tables

### Identity and assignments

- `users`, `roles`, `permissions`, `user_roles`, `role_permissions`
- `territories`, `account_assignments`

### Organizations and contacts

- `organizations` — legal/display/normalized names, domain, firm type, **`record_status`** (`active`|`archived`), **`prospect_stage`**, **`research_status`**, **`outreach_status`**, **`data_freshness_status`**, existing-relationship flag, record version.
- `organization_aliases`, `organization_locations`, `organization_roles`
- `contacts`, `contact_roles`
- `duplicate_candidates`, `merge_events`

Unique/partial indexes SHOULD cover normalized domain when present, active aliases, and current assignments. Duplicate candidates store features and decision, never an unexplained scalar alone.

**Forbidden:** a single `organizations.status` column that mixes record lifecycle with prospect/research/outreach/freshness.

### Collection and evidence

- `import_batches`, `import_rows`, `import_entity_links`
- `sources` — type, title, locator, reliability default, access policy.
- `evidence_records` — immutable claim context, retrieval/observation time, excerpt/payload hash, specificity, recency, extraction certainty, reviewer status.
- `research_observations` — subject, claim, proposed definition/value, status.

### Variables

- `variable_definitions`, `variable_definition_versions`
- `variable_values` — subject type/id, definition version, typed value columns or validated JSON value, normalized value, semantic status, confidence, effective/expiry times, evidence type, actor, override metadata.
- `variable_value_evidence` — many-to-many support.

Only one current non-contradicted value per subject/definition/effective context is enforced through transaction logic and a partial unique constraint where feasible. Prior values remain superseded.

### Scores and qualification

- `score_definitions`, `score_definition_versions`, `score_components`
- `score_results` — score, tier, confidence, completeness, status, calculated_at, immutable input/explanation snapshots.
- `score_factors` — direction, contribution, variable/evidence reference, explanation.
- `qualification_reviews`, `qualification_review_scores`, `disqualification_reasons`

Index score results by subject, definition/version, and calculated time. A published score definition cannot be updated.

### Discovery

- `discovery_templates`, `discovery_template_versions`, `discovery_questions`, `discovery_question_tags`
- `discovery_sessions`, `discovery_session_participants`, `discovery_session_questions`
- `discovery_answers`, `discovery_answer_mappings`

Answer mappings store verbatim-to-normalized transformations, confirmation actor/time, and resulting variable value ID.

### Consent, channel permission, and suppression

- `contact_channel_permissions` — contact, channel, state (`allowed`|`unknown`|`restricted`|`opted_out`|`not_applicable`), source, effective/expiry/revoked timestamps, actor, reason, supersession pointer.
- `organization_communication_restrictions` — organization, optional channel, state, source, effective dating, actor, reason, supersession.
- `suppression_entries` — scope (global/global_channel/contact/org), optional channel, contact/org/identifier hash, state, effective dating, actor, reason, supersession.
- `permission_evidence_links` — permission-like subject to `evidence_records`.

Rows are immutable once written; corrections supersede. Indexes MUST support evaluate-by-contact/channel/time. See Operational State and Consent Model for precedence.

### Outreach and opportunities

- `campaigns`, `sequences`, `sequence_versions`, `sequence_steps`
- `message_templates`, `message_template_versions`, `outreach_recipients`
- `outreach_activities`, `responses`, `response_classifications`
- `opportunities` — includes **`opportunity_stage`**, motion, owner, value band, probability policy refs, risk, `record_status`, row version
- `operational_state_transitions` — append-only history for `prospect_stage`, `research_status`, `outreach_status`, `data_freshness_status`, and `opportunity_stage` (replaces prior generic `stage_history` name)

Activities retain rendered-content hash or authorized snapshot, template version, channel, occurrence time, and human approval. Opt-out/restriction/`unknown` permission prevents later incompatible activity creation (enforced in services, constrained where feasible in DB).

### Work, UI, and audit

- `tasks`, `notes`, `tags`, `taggings`, `saved_views`
- `audit_events`, `outbox_events`, `job_runs`, `export_jobs`

Audit events are append-only and partitionable by time. Before/after data is minimized and redacted; large payloads use hashes/references. Blocked outreach evaluations MUST be auditable.

## Relationship summary

```text
organizations 1—N locations, contacts, observations, values, scores,
                  reviews, discovery_sessions, activities, opportunities,
                  organization_communication_restrictions
organizations columns: prospect_stage, research_status, outreach_status, data_freshness_status
contacts 1—N contact_channel_permissions
suppression_entries (global/identifier/contact/org scoped)
operational_state_transitions N—1 subject (organization | opportunity)
variable_definition_versions 1—N variable_values
score_definition_versions 1—N score_results 1—N score_factors
discovery_sessions 1—N answers 1—N answer_mappings → variable_values
sequences 1—N sequence_versions 1—N steps → outreach_activities → responses
opportunities.opportunity_stage + transitions
```

## Constraints and lifecycle

- Currency uses integer minor units plus ISO currency.
- Percent/probability ranges are database-constrained.
- Organization/contact archival is blocked or cascades to active-work cancellation by application policy; it does not erase evidence/history/transitions/permissions.
- Foreign keys default `RESTRICT`; join rows may cascade only when their parent is safely deletable.
- Hard deletion is limited to approved retention/privacy workflows and separately audited.
- Migrations are forward-only in production, transactional when supported, reviewed for locks, and tested against a production-shaped copy.
- Enum/check constraints MUST encode parallel-state and permission vocabularies from the Operational State and Consent Model.

## Tenant and scope decision

**Resolved by [ADR-003](../adr/ADR-003-single-tenant-deployment.md) / DEC-003:** Phase 1 is a **single-tenant** internal deployment. Territories and account ownership are authorization scopes, not tenants. Prompt 2 MUST NOT add speculative `tenant_id` columns. A future multi-tenant conversion requires a new ADR and migration. Consent and suppression tables follow the same single-tenant rule.

## Backup and audit

Define encrypted backups, retention, recovery point/time objectives, restore tests, and audit export. Production release is blocked until restore has been rehearsed. See [Testing Master Plan](../12-testing/TESTING_MASTER_PLAN.md).

## Prompt 2 implementation notes

Prompt 2 implements the canonical Phase 1 foundation tables in `packages/database/src/schema/*` and migrations under `packages/database/migrations`.

- `0000_parched_electro.sql` creates the Prompt 2 table set, enums, constraints, foreign keys, and indexes.
- `0001_integrity_guards.sql` adds database-level protection for hard-delete rejection, append-only audit/transition history, and immutable consent material fields.
- Organization/contact archive behavior is exposed through application services; direct hard deletion of canonical organization/contact rows is rejected.
- Consent corrections use supersession. Material permission/restriction/suppression fields are not rewritten in place.
- Operational-state multi-write flows are transaction-compatible through `DatabaseClient.withTransaction` and transaction-scoped repository executors.

## Prompt 3 implementation notes

Prompt 3 implements variables, evidence, and provenance tables in `packages/database/src/schema/evidence.ts`, `packages/database/src/schema/variables.ts`, and migration `0002_lyrical_daimon_hellstrom.sql`.

- Added tables: `sources`, `evidence_records`, `confidence_assessments`, `research_observations`, `variable_definitions`, `variable_definition_versions`, `variable_values`, `variable_value_evidence`, and `permission_evidence_links`.
- Evidence records are subject-scoped to exactly one organization or contact. Material evidence fields are immutable after insert.
- Variable definitions are versioned. Active version material fields are immutable; publishing a replacement version may only retire the prior active version.
- Variable values preserve status semantics for `known`, `unknown`, `not_applicable`, `withheld`, `contradicted`, and `stale`.
- Current value uniqueness is enforced for one current non-contradicted value per subject and variable definition.
- Confidence assessments store component values and allow `aggregate_score` to remain null until an approved aggregation policy exists.
- `permission_evidence_links` adds structured evidence provenance for consent rows without changing consent precedence.
- Prompt 3 seeds 56 variable definitions from the current Variable Dictionary.
