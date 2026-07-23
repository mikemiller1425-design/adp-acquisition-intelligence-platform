# Export Expiry Runbook

**Status:** Prompt 12 operational runbook  
**Implementation:** `ExportService` (`@adp/reporting`), migration `0009_prompt_10_reporting.sql`

## Policy

- Default export TTL: **7 days** (`DEFAULT_EXPORT_EXPIRY_DAYS` in `packages/reporting/src/domain/reporting.ts`)
- Job statuses: `pending` → `running` → `completed` | `failed` → `expired`
- Index: `export_jobs_expires_at_idx` for expiry sweeps
- Download revalidates authorization; expired jobs return explicit error (not silent empty file)

## Scheduled expiry sweep

Call `ExportService.expireDueExports(referenceTime)` from a worker/cron job:

```ts
const expired = await exportService.expireDueExports(new Date());
// emits reporting.export_expired audit/outbox events per job
```

Integration evidence: `packages/reporting/src/__tests__/reporting-workflow.integration.test.ts` — *creates async export jobs and expires them*.

## Operator procedures

### Check export status

Query `export_jobs` by `id` or `idempotency_key`. Fields: `status`, `expires_at`, `requested_by_user_id`, `dashboard_key`, `classification_notice`.

### Download before expiry

1. Confirm requester still has permission scope for the dashboard/view.
2. Use `ExportService` download path (revalidates `ReportingAuthorizationScope`).
3. Verify channel redaction metadata if contact fields present.

### Expired export

- Status `expired` — artifact may be deleted or inaccessible per `ExportArtifactPort` implementation.
- Operator action: submit a **new** export request with a fresh idempotency key; do not reuse expired job IDs for compliance traceability.

### Failed export

- Inspect `error_message` on job row.
- Retry with same idempotency key only if job never reached `completed` (idempotent return semantics).

## Security notes

- Exports reproduce active filters, columns, classification notice, and requesting user.
- Restricted/opted-out channel values are masked (`applyExportRedaction`); redactions recorded on job metadata.
- Cross-user export requests are rejected (`FORBIDDEN` when `scope.userId !== requestedByUserId`).

## Configuration

| Setting | Location | Default |
|---|---|---|
| Expiry days | `DEFAULT_EXPORT_EXPIRY_DAYS` | 7 |
| Sync row threshold | `DEFAULT_SYNC_EXPORT_ROW_THRESHOLD` | service constant |
| Retention hint | `.env.example` `RETENTION_EXPORT_HOURS` | 24 (ops planning; service uses days constant) |

Production TTL changes require security/privacy owner approval and contract evidence update.

## Verification

```bash
export DATABASE_URL=postgres://adp:adp@127.0.0.1:5433/adp_acquisition_test
pnpm --filter @adp/reporting test
```

## Related

- [Reporting Model](../10-dashboards/REPORTING_MODEL.md)
- [Consent Opt-Out Incident](CONSENT_OPT_OUT_INCIDENT.md) — channel redaction on export
