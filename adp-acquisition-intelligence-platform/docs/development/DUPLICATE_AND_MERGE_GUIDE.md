# Duplicate and Merge Guide

**Status:** Prompt 4 implemented

## Duplicate matching

Duplicate matching is explainable and conservative. `findDuplicateCandidates` evaluates feature signals:

- Normalized domain
- External ID
- Legal/display name
- Name + address
- Name + phone
- Alias overlap
- Shared location
- Contact email/phone overlap

Results are tiered as `exact`, `likely`, `possible`, or filtered out as `none`. Each result carries feature weights, matched flags, an explanation, and the match policy version.

## Review dispositions

Duplicate reviews must be resolved before commit:

- `link_existing` — commit links the import row to an existing organization.
- `new_record` — commit creates a new organization despite the candidate.
- `skip` — row is marked `duplicate_blocked`.
- `needs_research` — row is blocked for manual research.

The system does not auto-merge organizations.

## Merge planning

`planOrganizationMerge` creates a preview plan with:

- Survivor organization ID.
- Duplicate organization IDs.
- Child reassignment counts by child type.
- Relationship/cycle conflicts.
- Idempotency key.

Self-merges and cycles are rejected. Existing-relationship conflicts are surfaced for reviewer decisioning.

## Merge application and reversal

`OrganizationMergeService` delegates actual child movement to `MergeWritePort`. The Postgres writer reassigns supported child tables to the survivor and archives absorbed organizations when constructed with a DB executor.

`MergeReversalService` first evaluates safety blockers:

- Merge not applied.
- Survivor touched after merge.
- Duplicate has non-archive changes.
- Moved children touched after merge.
- Reversal would orphan history/evidence.

DB-backed reverse movement requires persisted before/after snapshots and remains deferred to composition work. The service contract is ready for a concrete writer when that snapshot exists.

