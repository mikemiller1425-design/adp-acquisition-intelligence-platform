# Outreach Model (Prompt 8)

## Purpose

Outreach tracks human-approved campaign enrollment, message drafting, approval, manual send recording, responses, and sequence progression under consent gates. Phase 1 does **not** send externally.

## Blueprint naming map

| Blueprint / catalog name | Implemented table |
|---|---|
| `campaigns` (+ versions) | `outreach_campaigns`, `outreach_campaign_versions` |
| `message_templates` (+ versions) | `message_templates`, `message_template_versions` |
| `sequences` (+ versions/steps) | `outreach_sequences`, `outreach_sequence_versions`, `outreach_sequence_steps` |
| `outreach_recipients` | `outreach_recipients` |
| enrollments | `campaign_enrollments` |
| drafts / approvals | `message_drafts`, `message_approvals` |
| activities / responses | `outreach_activities`, `outreach_responses`, `response_classifications` |
| next actions / history | `outreach_next_actions`, `outreach_sequence_history` |
| readiness | `outreach_readiness_assessments` |

## Lifecycle separation

- Prospect stage (`discovery_completed` → `outreach_ready` → `outreach_active`) via `OperationalStateService`
- Organization `outreach_status` (`ready` → `active` → `paused` / `waiting_response` / `completed`) via `OperationalStateService`
- Enrollment status (`pending` → `active` → `paused` / `completed` / `exited` / `blocked`)
- Draft status (`draft` → `pending_approval` → `approved` / `rejected` → `sent`)
- Activities retain immutable rendered-content snapshots and permission evaluation JSON

## Consent and permission rules

1. `unknown`, `restricted`, and `opted_out` permission states block enroll, approve, and mark-sent.
2. Permission evaluation snapshots are stored on enrollments, drafts, approvals, activities, and readiness assessments.
3. Unsubscribe classifications record opt-out through the consent suppression port and pause/exit enrollments.
4. Template rendering only substitutes provided context keys; missing keys fail validation.

## Configuration

Phase 1 library: `config/outreach/phase1-library.v1.yaml` seeded by `packages/database/seeds/outreach.ts`.

## Events

Audit/outbox events use `outreach.*` names with `aggregateType = organization`.
