# Import Pipeline Guide

**Status:** Prompt 4 implemented

## Pipeline stages

1. **Upload** — `ImportUploadService` validates CSV filename/content/shape, scans bytes through `MalwareScanPort`, stores the private artifact through `ObjectStoragePort`, creates an import batch, and persists raw rows.
2. **Mapping** — `ImportMappingService` resolves source columns to the versioned field registry by key, label, or alias.
3. **Validation** — `ImportValidationService` maps raw rows, normalizes values, records blank semantics, and marks each row `valid` or `invalid`.
4. **Dry-run** — `ImportDryRunService` generates a preview report and duplicate review candidates without creating business entities.
5. **Duplicate review** — `DuplicateReviewService` records reviewer disposition: `new_record`, `link_existing`, `skip`, or `needs_research`.
6. **Commit** — `ImportCommitService` creates or links entities, records evidence and observations, proposes variable values, preserves/applies consent through a consent port, and emits audit/outbox events when composed.
7. **Report** — `ImportReportService` returns sanitized row/report data. Spreadsheet formula prefixes are escaped.
8. **Retry/reversal** — `ImportRetryService` resets failed rows; `ImportReversalService` archives batch-created organizations when eligibility allows.

## Required ordering

```text
uploaded
  -> mapping_required
  -> mapped
  -> validating
  -> preview_ready
  -> duplicate_review_required | ready_to_commit
  -> committing
  -> committed | partially_committed
  -> reverting
  -> reverted | partially_reverted
```

Services enforce status preconditions. Do not bypass dry-run before commit.

## Idempotency

- Upload idempotency is keyed by `idempotencyKey`.
- Dry-run avoids duplicating duplicate-review records for the same row/candidate pair.
- Commit returns the committed-row report when a batch is already committed.

## Ports to compose

- Storage/malware: `ObjectStoragePort`, `MalwareScanPort`
- Business writes: `CollectionOrganizationPort`
- Provenance/intelligence: `EvidenceProposalPort`, `ObservationProposalPort`, `VariableProposalPort`
- Consent: `ConsentImportPort`
- Reliability: `CollectionAuditPort`, `CollectionOutboxPort`, optional `TransactionPort`

API routes are deferred; route handlers should call these services directly rather than reimplementing pipeline rules.

