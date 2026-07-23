# Prompt 12 Performance Notes

**Status:** Honest assessment vs [Testing Master Plan](../12-testing/TESTING_MASTER_PLAN.md) targets  
**Baseline:** `86bcab1` (Prompt 11)  
**Exit contract:** QAR-003 — **partial** (fixture-scale only)

## Published targets (TESTING_MASTER_PLAN)

| Target | Specification |
|---|---|
| Representative volume | 100k organizations, 300k contacts, 10m variable/evidence/history rows (recommended before Prompt 10) |
| Read latency | p95 < 2s for indexed prospect filters, org 360, score table, dashboard aggregates |
| Import | 10k-row CSV validation/parsing baseline |
| Jobs | Progress visible; do not exhaust web workers |
| Large export | Async with backpressure |

## What was measured (Prompt 12 regression)

### Collection CSV 10k (measured)

**Test:** `packages/collection/src/__tests__/collection.performance.test.ts`

| Metric | Result | Threshold |
|---|---|---|
| Rows parsed | 10,001 | — |
| Duration | ~761 ms (latest `pnpm validate` run) | < 5,000 ms |
| Heap delta | ~13.4 MB | < 64 MB |

Logged as JSON: `{"test":"collection_csv_10k","rows":10001,"durationMs":761,"heapDeltaMb":13.41}`

This satisfies the **10k-row import/parser** baseline at **fixture scale**, not production data shape diversity.

### Scoring batch replay smoke

**Test:** `packages/scoring/src/__tests__/scoring.unit.test.ts` — deterministic batch replay hook for future baselines. No production-volume timing claims.

### Reporting / dashboards

- Fixture provider default in web (`ADP_REPORTING_PROVIDER=fixture`).
- Postgres reporting provider implemented (`packages/reporting/src/infrastructure/postgres-reporting.ts`) with bounded integration tests for pagination — **no 100k-org query-plan or p95 measurement run**.

### Database migrations

- Full schema apply on empty DB (188+ objects) completes within integration test timeouts — not a user-facing latency benchmark.

## What was NOT measured

| Item | Status |
|---|---|
| 100k organization prospect filter p95 | **Not tested** — no fixture at this volume |
| 300k contacts / 10m history rows | **Not tested** |
| Dashboard aggregate p95 under load | **Not tested** at target volume |
| Large async export end-to-end timing | Lifecycle tested; not load-tested |
| Score recalculation queue at scale | Job contract tested; not volume-tested |
| Web worker exhaustion under concurrent exports | **Not tested** |

## Honest conclusion

Phase 1 **fixture-scale** performance is validated for CSV parsing (10k rows) and bounded unit/integration workloads. **Target-volume baselines (100k org) are not claimed** and QAR-003 must remain partial until representative volume tests are executed and signed by engineering owner.

## Recommended next steps (post–Phase 1 implementation, pre-production)

1. Generate or import 100k-org representative fixture (or anonymized production subset).
2. Run indexed filter benchmarks on `organizations` + parallel-dimension indexes.
3. Measure dashboard SQL via `postgres-reporting` with `EXPLAIN (ANALYZE, BUFFERS)`.
4. Record p95 in exit contract with environment, commit, and query identifiers.
5. Load-test async export worker with row threshold breach.

## References

- [TESTING_MASTER_PLAN § Performance baselines](../12-testing/TESTING_MASTER_PLAN.md)
- [PHASE_1_TECHNICAL_ARCHITECTURE § Reliability and performance](../04-architecture/PHASE_1_TECHNICAL_ARCHITECTURE.md)
- [Prompt 10 Reporting Model — performance deferral](../10-dashboards/REPORTING_MODEL.md)
