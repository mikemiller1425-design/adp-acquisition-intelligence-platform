# Reporting Model

**Version:** 1.0.0  
**Package:** `@adp/reporting`

## Overview

Prompt 10 delivers the permission-scoped reporting backend for dashboards D1–D8. Metric definitions are frozen in `config/reporting/metrics.v1.yaml`. Query, saved-view, and export services enforce territory scope server-side and treat parallel operational dimensions independently.

## Metric catalog

- **Source:** `config/reporting/metrics.v1.yaml` loaded by `MetricCatalogService`
- **Fields per metric:** subject, numerator, denominator, time basis, excluded states, timezone, refresh schedule, drilldown key
- **Tiny-cohort rule:** rates suppress percentages when denominator &lt; 5 (configurable)
- **Dashboards:** D1 executive overview, D2 prospect master, D3 collection/research, D4 scoring, D5 discovery, D6 outreach, D7 opportunities, D8 model performance

## Query contracts

### Dashboard aggregate query

```typescript
DashboardQueryService.queryDashboard({
  dashboardKey: 'D1',
  filters: {
    prospectStage: 'qualified',
    researchStatus: 'gaps_open',
    outreachStatus: 'active',
    dataFreshnessStatus: 'stale',
    opportunityStage: 'open',
  },
  scope: ReportingAuthorizationScope,
});
```

Returns `DashboardQueryResult` with `asOf`, metric counts/rates, drilldown keys, and explicit empty reasons (never fabricated zeros).

### Table query

```typescript
DashboardQueryService.queryTable({
  viewKey: 'table_prospect_master',
  filters,
  sort: { field: 'displayName', direction: 'asc' },
  pagination: { limit: 50, offset: 0 },
  scope,
});
```

Table views: `table_prospect_master`, `table_collection_research`, `table_scoring`, `table_discovery`, `table_outreach`, `table_opportunities`.

D7 pipeline rows compose with `@adp/opportunities` `PipelineQueryService` patterns on `opportunities` and `organizations` tables.

## Saved views

`SavedViewService` persists owner-scoped filters, columns, sort, dashboard/view key, and name in `saved_views`. `restore` returns exact query inputs; permission scope is re-evaluated on restore via `DashboardQueryService.restoreSavedViewQuery`.

## Exports

`ExportService` creates `export_jobs` with idempotency keys, classification notice, filter/column reproduction, and expiry.

| Mode | Trigger | Behavior |
|---|---|---|
| Sync | estimated rows ≤ 500 | completes inline, writes CSV artifact |
| Async | estimated rows &gt; 500 | `pending` job; `runExport` completes later |

Channel fields (`email`, `phone`, `linkedin`) are omitted with explicit reasons for `restricted`, `opted_out`, and `unknown` permission states.

## Authorization scope

```typescript
type ReportingAuthorizationScope = {
  userId: string;
  roles: readonly ('admin' | 'sales' | 'reviewer' | 'viewer')[];
  territoryIds: readonly string[];
  viewAllTerritories: boolean;
};
```

Non-admin scopes filter organizations through `account_assignments.territory_id`.

## Audit and outbox

Transactional events use `aggregateType` `organization` or `user` (valid `subjectTypeEnum` values):

- `reporting.dashboard_queried`
- `reporting.saved_view_created|updated|deleted`
- `reporting.export_requested|completed|failed|expired`
- `reporting.export_redaction_applied`

## Performance targets (Phase 1)

- Filtered table retrieval: &lt; 2s for fixture datasets (&lt; 100 organizations) with pagination
- Bounded integration tests document pagination behavior; production 100k-org claims deferred to Prompt 12

## Deferred to Prompt 11

- Dashboard UI screens and chart widgets
- URL-persisted filter UX
- Empty/loading/error UI states (DSH-005 UI portions)
