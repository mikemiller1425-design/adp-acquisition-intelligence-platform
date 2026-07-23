import { AppError } from '@adp/platform';

import { resolveTableViewKey } from '../domain/reporting.js';
import type {
  DashboardFilters,
  DashboardKey,
  Pagination,
  ReportingAuthorizationScope,
  TableSort,
  TableViewKey,
} from '../domain/reporting.js';
import type {
  DashboardQueryRepository,
  ReportingAuditPort,
  ReportingOutboxPort,
} from '../domain/ports.js';
import type { MetricCatalogService } from './metric-catalog-service.js';

export class DashboardQueryService {
  constructor(
    private readonly catalog: MetricCatalogService,
    private readonly queries: DashboardQueryRepository,
    private readonly audit?: ReportingAuditPort,
    private readonly outbox?: ReportingOutboxPort,
  ) {}

  async queryDashboard(command: {
    dashboardKey: DashboardKey;
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
    correlationId?: string | null;
  }) {
    const catalog = await this.catalog.loadCatalog();
    const result = await this.queries.queryDashboard({
      dashboardKey: command.dashboardKey,
      filters: command.filters,
      scope: command.scope,
      tinyCohortThreshold: catalog.tinyCohortThreshold,
    });

    await this.audit?.append({
      actorUserId: command.scope.userId,
      action: 'reporting.dashboard_queried',
      subjectType: 'user',
      subjectId: command.scope.userId,
      correlationId: command.correlationId ?? null,
      metadata: {
        dashboardKey: command.dashboardKey,
        metricCount: result.metrics.length,
        filterKeys: Object.keys(command.filters),
      },
    });
    await this.outbox?.insert({
      aggregateType: 'user',
      aggregateId: command.scope.userId,
      eventType: 'reporting.dashboard_queried',
      idempotencyKey:
        command.correlationId !== undefined && command.correlationId !== null
          ? `${command.correlationId}:reporting.dashboard_queried`
          : `${command.scope.userId}:${command.dashboardKey}:${result.asOf}`,
      payload: {
        dashboardKey: command.dashboardKey,
        asOf: result.asOf,
        metricCount: result.metrics.length,
      },
    });

    return result;
  }

  async queryTable(command: {
    viewKey: TableViewKey;
    filters: DashboardFilters;
    sort: TableSort | null;
    pagination: Pagination;
    scope: ReportingAuthorizationScope;
    correlationId?: string | null;
  }) {
    const result = await this.queries.queryTable(command);

    await this.audit?.append({
      actorUserId: command.scope.userId,
      action: 'reporting.table_queried',
      subjectType: 'user',
      subjectId: command.scope.userId,
      correlationId: command.correlationId ?? null,
      metadata: {
        viewKey: command.viewKey,
        total: result.total,
        limit: command.pagination.limit,
        offset: command.pagination.offset,
      },
    });

    return result;
  }

  async restoreSavedViewQuery(command: {
    savedView: {
      dashboardKey: string;
      viewKey: string | null;
      filters: DashboardFilters;
      columns: readonly string[];
      sort: TableSort | null;
    };
    scope: ReportingAuthorizationScope;
    pagination: Pagination;
    correlationId?: string | null;
  }) {
    const dashboardKey = command.savedView.dashboardKey as DashboardKey;
    if (!/^D[1-8]$/.test(dashboardKey)) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Saved view dashboard key is invalid',
        details: { dashboardKey: command.savedView.dashboardKey },
      });
    }

    const viewKey = (command.savedView.viewKey ??
      resolveTableViewKey(dashboardKey)) as TableViewKey;

    const [dashboard, table] = await Promise.all([
      this.queryDashboard({
        dashboardKey,
        filters: command.savedView.filters,
        scope: command.scope,
        correlationId: command.correlationId ?? null,
      }),
      this.queryTable({
        viewKey,
        filters: command.savedView.filters,
        sort: command.savedView.sort,
        pagination: command.pagination,
        scope: command.scope,
        correlationId: command.correlationId ?? null,
      }),
    ]);

    return {
      dashboard,
      table: {
        ...table,
        columns: command.savedView.columns.map((key) => ({
          key,
          label: key,
        })),
      },
      restoredFilters: command.savedView.filters,
      restoredColumns: command.savedView.columns,
      restoredSort: command.savedView.sort,
    };
  }
}
