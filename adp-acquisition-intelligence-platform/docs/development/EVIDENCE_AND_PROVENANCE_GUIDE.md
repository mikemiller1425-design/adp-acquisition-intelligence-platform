# Evidence and Provenance Guide

This guide explains how Prompt 3 evidence/provenance code is intended to be used by later application, API, worker, collection, discovery, scoring, and consent code.

## Package

Use `@adp/evidence` for evidence-domain behavior.

Public exports are defined in:

- `packages/evidence/src/index.ts`

Important modules:

- `domain/evidence.ts` — enums, subject refs, confidence component validation, effective-window validation, credential-field rejection.
- `domain/ports.ts` — repository, audit, outbox, authz, variable command, and consent-link ports.
- `application/source-service.ts` — source creation/update/disable behavior.
- `application/evidence-service.ts` — immutable evidence record creation, review, supersession, audit/outbox side effects.
- `application/research-observation-service.ts` — research claim lifecycle and accepted-observation-to-variable seam.
- `application/confidence-assessment-service.ts` — confidence component persistence without aggregate score.
- `application/staleness-evaluation-service.ts` — freshness/staleness evaluation from explicit freshness policy fields.
- `application/permission-evidence-link-service.ts` — permission-like consent subject to evidence link creation.
- `infrastructure/postgres-repositories.ts` — Postgres implementations of evidence ports.

## Tables

Evidence and provenance use:

- `sources`
- `evidence_records`
- `research_observations`
- `confidence_assessments`
- `variable_value_evidence`
- `permission_evidence_links`

See [Database Architecture](../05-data/DATABASE_ARCHITECTURE.md) for the complete schema context.

## Source records

Sources represent where information came from. They are not credentials.

Rules:

- Do not store API keys, OAuth tokens, passwords, cookies, private keys, sessions, bearer tokens, or refresh tokens in `retrieval_restrictions`.
- `SourceService` rejects credential-like metadata keys.
- Source locator deduplication is implemented at service/repository level and enforced by the `sources_locator_unique` partial index.
- Disable sources by status instead of deleting them.

## Evidence records

Use `EvidenceService.create` to record a claim with provenance.

Evidence records require:

- subject: exactly one organization or contact
- optional source
- non-blank claim
- structured payload
- evidence type
- observed time
- retrieval/effective/expiry times when available
- optional confidence components
- actor

Evidence material fields are immutable after insert:

- `claim`
- `structured_payload`
- `content_hash`
- `evidence_type`

To correct evidence, create or supersede with a new record. Do not rewrite the original claim.

## Evidence types

Supported evidence types:

- `verified_fact`
- `source_derived_fact`
- `user_entered_fact`
- `calculated`
- `ai_inference`
- `unknown`

AI inference must remain `ai_inference`. It is not equivalent to `verified_fact`.

## Review status

Evidence review statuses:

- `pending`
- `approved`
- `rejected`
- `needs_review`

Terminal review states require reviewer metadata at the database level. Review changes can emit audit/outbox side effects through configured ports.

## Confidence components

Prompt 3 stores components only:

- `sourceReliability`
- `specificity`
- `recency`
- `crossSourceAgreement`
- `extractionCertainty`

Each component must be null/undefined or a number between `0` and `1`.

Prompt 3 does not define aggregate weights. `ConfidenceAssessmentService` writes `aggregateScore: null` and returns an explanation that no approved aggregation formula exists.

Do not populate `aggregate_score` until an approved versioned policy and replay tests exist.

## Staleness evaluation

`StalenessEvaluationService` evaluates freshness from explicit freshness policy fields and observed/effective/expiry dates.

Rules:

- No freshness policy produces `no_policy`.
- Expiry dates can produce stale results.
- Prompt 3 does not infer freshness from source count or confidence alone.

## Research observations

Research observations capture claims that may or may not become variable values.

Lifecycle:

- `proposed`
- `accepted`
- `rejected`
- `contradicted`
- `superseded`

Acceptance requires:

- proposed definition version
- proposed typed value
- actor with observation acceptance capability

Acceptance confirms a variable value through `VariableValueCommandPort` and preserves a link to the evidence record when present.

Rejected and contradicted observations do not create variable values.

## Variable evidence links

Variable values link to evidence through `variable_value_evidence`.

Relationships:

- `supports`
- `contradicts`
- `verifies`
- `contextualizes`

Use `VariableValueService.confirm` with `evidenceRecordId` or `VariableValueService.linkEvidence` to create links. Duplicate links are ignored by the repository conflict handler.

## Consent evidence links

Permission-like consent rows can link to evidence through `permission_evidence_links`.

Supported subjects:

- `contact_channel_permission`
- `organization_communication_restriction`
- `suppression_entry`

This link is provenance only. It does not change consent precedence or turn unknown permission into allowed permission.

## Prompt boundary

This guide does not define:

- import parsing, dry-run, commit, or revert behavior
- scoring formulas or confidence aggregation weights
- discovery agenda or answer mapping behavior
- outreach sequences, sending, or UI queues
- dashboard/export behavior

Those are Prompt 4+ responsibilities.
