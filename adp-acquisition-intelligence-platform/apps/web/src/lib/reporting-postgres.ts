import { createDatabaseClient } from '@adp/database';
import {
  DashboardQueryService,
  FileMetricCatalogRepository,
  MetricCatalogService,
  PostgresDashboardQueryRepository,
  PostgresReportingAuditAdapter,
  PostgresReportingOutboxAdapter,
  PostgresSavedViewRepository,
  SavedViewService,
  type DashboardFilters,
  type DashboardKey,
  type DashboardQueryResult,
  type Pagination,
  type ReportingAuthorizationScope,
  type SavedViewRecord,
  type TableQueryResult,
  type TableSort,
  type TableViewKey,
} from '@adp/reporting';

import type { ReportingProvider } from './reporting-port';

type DbClient = ReturnType<typeof createDatabaseClient>;

let cached: { client: DbClient; provider: PostgresReportingProvider } | null = null;

class PostgresReportingProvider implements ReportingProvider {
  constructor(
    private readonly dashboard: DashboardQueryService,
    private readonly savedViews: SavedViewService,
  ) {}

  queryDashboard(command: {
    dashboardKey: DashboardKey;
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
  }): Promise<DashboardQueryResult> {
    return this.dashboard.queryDashboard(command);
  }

  queryTable(command: {
    viewKey: TableViewKey;
    filters: DashboardFilters;
    sort: TableSort | null;
    pagination: Pagination;
    scope: ReportingAuthorizationScope;
  }): Promise<TableQueryResult> {
    return this.dashboard.queryTable(command);
  }

  async listSavedViews(
    ownerUserId: string,
    dashboardKey?: string,
  ): Promise<readonly SavedViewRecord[]> {
    if (dashboardKey !== undefined) {
      return this.savedViews.list({ ownerUserId, dashboardKey });
    }
    return this.savedViews.list({ ownerUserId });
  }

  async restoreSavedView(
    id: string,
    scope: ReportingAuthorizationScope,
  ): Promise<SavedViewRecord | null> {
    const views = await this.listSavedViews(scope.userId);
    const view = views.find((item) => item.id === id) ?? null;
    if (view === null) return null;
    try {
      await this.savedViews.restore({ id, scope });
      return view;
    } catch {
      return null;
    }
  }
}

function buildProvider(databaseUrl: string): {
  client: DbClient;
  provider: PostgresReportingProvider;
} {
  const client = createDatabaseClient(databaseUrl);
  const catalog = new MetricCatalogService(new FileMetricCatalogRepository());
  const queries = new PostgresDashboardQueryRepository(client.db);
  const audit = new PostgresReportingAuditAdapter(client.db);
  const outbox = new PostgresReportingOutboxAdapter(client.db);
  const dashboard = new DashboardQueryService(catalog, queries, audit, outbox);
  const savedViews = new SavedViewService(
    new PostgresSavedViewRepository(client.db),
    audit,
    outbox,
  );

  return { client, provider: new PostgresReportingProvider(dashboard, savedViews) };
}

export function getPostgresReportingProvider(databaseUrl: string): ReportingProvider {
  if (cached) {
    return cached.provider;
  }

  const built = buildProvider(databaseUrl);
  cached = built;
  return built.provider;
}

export async function closePostgresReportingProvider(): Promise<void> {
  if (cached?.client) {
    await cached.client.close();
    cached = null;
  }
}
