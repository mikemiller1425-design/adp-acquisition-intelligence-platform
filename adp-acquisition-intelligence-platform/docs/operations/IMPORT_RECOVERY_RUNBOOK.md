# Import Recovery Runbook

**Status:** Prompt 4 implemented

## First response

1. Identify the `import_batch.id`, idempotency key, actor, and current batch status.
2. Preserve the private artifact reference and avoid deleting import rows.
3. Check audit/outbox events for the import commit idempotency key when those ports are composed.
4. Confirm the database is PostgreSQL 17 for Prompt 4 validation parity.

## Common states

| State | Operator action |
|---|---|
| `mapping_required` | Reapply the field mapping. |
| `validation_failed` | Correct mapping/source data and re-run validation. |
| `duplicate_review_required` | Resolve every duplicate review before commit. |
| `ready_to_commit` | Retry commit with the same idempotency key where possible. |
| `partially_committed` | Inspect failed rows, fix transient cause, use `ImportRetryService.resetFailedRows`, then commit again. |
| `committed` | Generate report; reversal requires eligibility check. |
| `reverted` | Do not re-revert; create a new import if data must be reintroduced. |

## Safe retry

- Upload retry with the same idempotency key returns the existing batch.
- Dry-run retry is safe and does not create duplicate review records for the same row/candidate pair.
- Commit retry after `committed` returns the committed-row report instead of recreating entities.

## Reversal

Use `ImportReversalService.preview` before reversal. Reversal is blocked when:

- Batch is not committed/partially committed.
- No batch-created entities exist.
- Imported entities were touched after import.
- External references are present.
- Consent preservation could be weakened.

Successful reversal archives batch-created organizations and marks affected rows reversed. Linked existing organizations are not archived.

## Escalation

Escalate to engineering when:

- Status transition errors indicate a service was bypassed.
- Duplicate reviews were externally modified.
- A merge reversal requires reconstructing before/after child movement.
- Audit/outbox events disagree with import batch status.

