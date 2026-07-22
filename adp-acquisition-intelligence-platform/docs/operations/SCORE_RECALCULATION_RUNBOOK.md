# Score Recalculation Runbook

**Status:** Prompt 5 draft operations runbook  
**Production activation:** Blocked until approved active score definitions exist

This runbook covers the Prompt 5 recalculation job contract. It is for engineering validation and later operations planning; it does not activate production scoring.

## When recalculation is queued

`ScoreRecalculationService` accepts these event types:

- `variable_value.confirmed`
- `variable_value.superseded`
- `variable_value.contradicted`
- `variable_value.stale`
- `score_definition.published`

Events without a valid organization/contact subject are ignored. Events with a `scoreKey` recalculate that score only; events without a `scoreKey` recalculate the configured score list.

## Idempotency

The service stores jobs in `score_recalculation_jobs`.

- Idempotency key format: `score-recalc:<source event idempotency key>`.
- Duplicate keys return the original job and do not create another row.
- Integration tests verify duplicate create behavior.

## Worker handling

Register the handler with:

```ts
import { registerScoreRecalculationHandler } from '@adp/scoring';

registerScoreRecalculationHandler(jobRegistry, scoreRecalculationService);
```

The handler:

1. Reads `jobId`, subject, and optional `scoreKey` from the job payload.
2. Marks the job `running`.
3. Calculates scores with explicit draft mode in Prompt 5.
4. Persists immutable score results and input snapshots.
5. Marks the job `completed` with the latest result ID.
6. Marks the job `failed` with the error message when calculation fails, then rethrows.

## Manual validation procedure

Use this procedure in local/CI validation:

1. Export the test database URL.
2. Reset and migrate the test database.
3. Seed draft scoring definitions.
4. Trigger a variable-value event through the outbox/recalculation adapter.
5. Confirm a single pending job exists for a repeated idempotency key.
6. Execute the handler.
7. Verify:
   - job status is `completed`,
   - a score result was written,
   - an input snapshot was written,
   - score factors were written,
   - prior score results were not updated in place.

## Common failures

| Symptom | Likely cause | Response |
|---|---|---|
| No job created | Event type not in the recalculation allow-list or subject missing | Check event payload and subject identifiers. |
| Duplicate event did not create another job | Expected idempotency behavior | Reuse the existing job ID for tracing. |
| `Score definition not found` | Draft was not seeded or active definition is required without approval | Seed draft definitions for validation or wait for approved activation. |
| Job failed after marking running | Calculation or persistence error | Inspect `error_message`, score definition, and variable input payload. |
| Confidence is `null` | Policy is unapproved and strict mode was used | Expected until confidence policy approval; do not substitute a default. |

## Operating constraints

- Do not update score results, input snapshots, or factors in place; they are append-only.
- Do not backfill approved production results from draft definitions.
- Do not flip SCR-002 to complete from recalculation evidence alone.
- Do not start Prompt 6 workflows from draft scoring outputs.

