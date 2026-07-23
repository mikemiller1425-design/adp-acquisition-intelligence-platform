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

import { fixtureReportingProvider } from './reporting-fixture';
import { getPostgresReportingProvider } from './reporting-postgres';
import type { ReportingClientMode, ReportingProvider } from './reporting-port';

export type { ReportingClientMode, ReportingProvider } from './reporting-port';

export function resolveReportingMode(): ReportingClientMode {
  const explicit = process.env.ADP_REPORTING_PROVIDER;
  if (explicit === 'postgres') return 'postgres';
  if (explicit === 'fixture') return 'fixture';
  return 'fixture';
}

export function getReportingProvider(): ReportingProvider {
  const mode = resolveReportingMode();
  if (mode === 'postgres') {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return fixtureReportingProvider;
    }
    return getPostgresReportingProvider(databaseUrl);
  }
  return fixtureReportingProvider;
}

export async function queryDashboard(command: {
  dashboardKey: DashboardKey;
  filters: DashboardFilters;
  scope: ReportingAuthorizationScope;
}): Promise<DashboardQueryResult> {
  return getReportingProvider().queryDashboard(command);
}

export async function queryTable(command: {
  viewKey: TableViewKey;
  filters: DashboardFilters;
  sort: TableSort | null;
  pagination: Pagination;
  scope: ReportingAuthorizationScope;
}): Promise<TableQueryResult> {
  return getReportingProvider().queryTable(command);
}

export async function listSavedViews(
  ownerUserId: string,
  dashboardKey?: string,
): Promise<readonly SavedViewRecord[]> {
  return getReportingProvider().listSavedViews(ownerUserId, dashboardKey);
}

export async function restoreSavedView(
  id: string,
  scope: ReportingAuthorizationScope,
): Promise<SavedViewRecord | null> {
  return getReportingProvider().restoreSavedView(id, scope);
}
