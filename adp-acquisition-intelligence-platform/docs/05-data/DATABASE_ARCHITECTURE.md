# Database Architecture

**Version:** 1.0.0

## Conventions

PostgreSQL is the reference datastore. Tables use `uuid` primary keys; `created_at`, `updated_at`, and optional `archived_at`; UTC `timestamptz`; constrained enums or reference tables; and explicit foreign-key behavior. Human-facing identifiers are separate from primary keys. JSON is reserved for immutable snapshots, flexible evidence payloads, and configuration—not core relationships.

## Canonical tables

### Identity and assignments

- `users`, `roles`, `permissions`, `user_roles`, `role_permissions`
- `territories`, `account_assignments`

### Organizations and contacts

- `organizations` — legal/display/normalized names, domain, firm type, status, existing-relationship flag, record version.
- `organization_aliases`, `organization_locations`, `organization_roles`
- `contacts`, `contact_roles`
- `duplicate_candidates`, `merge_events`

Unique/partial indexes SHOULD cover normalized domain when present, active aliases, and current assignments. Duplicate candidates store features and decision, never an unexplained scalar alone.

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

### Outreach and opportunities

- `campaigns`, `sequences`, `sequence_versions`, `sequence_steps`
- `message_templates`, `message_template_versions`, `outreach_recipients`
- `outreach_activities`, `responses`, `response_classifications`
- `opportunities`, `stage_history`

Activities retain rendered-content hash or authorized snapshot, template version, channel, occurrence time, and human approval. Opt-out prevents later incompatible activity creation.

### Work, UI, and audit

- `tasks`, `notes`, `tags`, `taggings`, `saved_views`
- `audit_events`, `outbox_events`, `job_runs`, `export_jobs`

Audit events are append-only and partitionable by time. Before/after data is minimized and redacted; large payloads use hashes/references.

## Relationship summary

```text
organizations 1—N locations, contacts, observations, values, scores,
                  reviews, discovery_sessions, activities, opportunities
variable_definition_versions 1—N variable_values
score_definition_versions 1—N score_results 1—N score_factors
discovery_sessions 1—N answers 1—N answer_mappings → variable_values
sequences 1—N sequence_versions 1—N steps → outreach_activities → responses
opportunities 1—N stage_history
```

## Constraints and lifecycle

- Currency uses integer minor units plus ISO currency.
- Percent/probability ranges are database-constrained.
- Organization/contact archival is blocked or cascades to active-work cancellation by application policy; it does not erase evidence/history.
- Foreign keys default `RESTRICT`; join rows may cascade only when their parent is safely deletable.
- Hard deletion is limited to approved retention/privacy workflows and separately audited.
- Migrations are forward-only in production, transactional when supported, reviewed for locks, and tested against a production-shaped copy.

## Tenant and scope decision

Prompt 1 must record whether Phase 1 is single-tenant or multi-tenant. If multi-tenant, every business table includes `tenant_id`, composite uniqueness includes it, row-level access is tested, and background jobs carry tenant scope. This decision cannot be postponed beyond the first schema migration.

## Backup and audit

Define encrypted backups, retention, recovery point/time objectives, restore tests, and audit export. Production release is blocked until restore has been rehearsed. See [Testing Master Plan](../12-testing/TESTING_MASTER_PLAN.md).

