import type {
  DashboardFilters,
  DashboardKey,
  DashboardQueryResult,
  Pagination,
  ReportingAuthorizationScope,
  SavedViewRecord,
  TableQueryResult,
  TableSort,
  TableViewKey,
} from '@adp/reporting';

export interface ReportingProvider {
  queryDashboard(command: {
    dashboardKey: DashboardKey;
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
  }): Promise<DashboardQueryResult>;

  queryTable(command: {
    viewKey: TableViewKey;
    filters: DashboardFilters;
    sort: TableSort | null;
    pagination: Pagination;
    scope: ReportingAuthorizationScope;
  }): Promise<TableQueryResult>;

  listSavedViews(ownerUserId: string, dashboardKey?: string): Promise<readonly SavedViewRecord[]>;

  restoreSavedView(id: string, scope: ReportingAuthorizationScope): Promise<SavedViewRecord | null>;
}

export type ReportingClientMode = 'fixture' | 'postgres';
