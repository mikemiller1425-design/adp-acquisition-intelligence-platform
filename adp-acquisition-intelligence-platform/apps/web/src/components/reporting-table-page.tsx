import type { DashboardKey, TableViewKey } from '@adp/reporting';
import type { ReactNode } from 'react';
import { Suspense } from 'react';

import { DataTable } from '@/components/data-table';
import { ParallelFilters } from '@/components/parallel-filters';
import { DeniedState, EmptyState, ErrorState, LoadingState } from '@/components/page-states';
import { PaginationControls } from '@/components/pagination-controls';
import { SavedViewRestore } from '@/components/saved-view-restore';
import { ScreenHeader } from '@/components/screen-header';
import { getWebSession, roleCanAccess, toReportingScope } from '@/lib/auth';
import { parseTablePageParams } from '@/lib/filter-url';
import { resolvePresentationFromData } from '@/lib/page-states';
import { listSavedViews, queryTable, restoreSavedView } from '@/lib/reporting-client';

type ReportingTablePageProps = {
  screenId: string;
  title: string;
  description: string;
  viewKey: TableViewKey;
  dashboardKey: DashboardKey;
  requiredRoles: readonly ('admin' | 'sales' | 'reviewer' | 'viewer')[];
  searchParams: Record<string, string | string[] | undefined>;
  headerActions?: ReactNode;
  hideHeader?: boolean;
};

export async function ReportingTablePage({
  screenId,
  title,
  description,
  viewKey,
  dashboardKey,
  requiredRoles,
  searchParams,
  headerActions,
  hideHeader = false,
}: ReportingTablePageProps) {
  const session = getWebSession();
  const params = parseTablePageParams(searchParams);

  const header = hideHeader ? null : (
    <ScreenHeader
      screenId={screenId}
      title={title}
      description={description}
      actions={headerActions}
    />
  );

  if (!roleCanAccess(session.roles, requiredRoles)) {
    return (
      <>
        {header}
        <DeniedState />
      </>
    );
  }

  if (params.presentation === 'loading') {
    return (
      <>
        {header}
        <LoadingState context={title.toLowerCase()} />
      </>
    );
  }

  if (params.presentation === 'denied') {
    return (
      <>
        {header}
        <DeniedState />
      </>
    );
  }

  if (params.presentation === 'error') {
    return (
      <>
        {header}
        <ErrorState context={title.toLowerCase()} retryHref="?" />
      </>
    );
  }

  const scope = toReportingScope(session);
  let filters = params.filters;

  if (params.savedViewId) {
    const restored = await restoreSavedView(params.savedViewId, scope);
    if (restored) {
      filters = restored.filters;
    }
  }

  const savedViews = await listSavedViews(session.userId, dashboardKey);

  let table;
  try {
    table = await queryTable({
      viewKey,
      filters,
      sort: params.sortField ? { field: params.sortField, direction: params.sortDirection } : null,
      pagination: {
        limit: params.limit,
        offset: (params.page - 1) * params.limit,
      },
      scope,
    });
  } catch {
    return (
      <>
        {header}
        <ErrorState context={title.toLowerCase()} retryHref="?" />
      </>
    );
  }

  if (params.presentation === 'empty' || (table.total === 0 && table.emptyReason)) {
    return (
      <>
        {header}
        <Suspense fallback={null}>
          <SavedViewRestore views={savedViews} />
          <ParallelFilters />
        </Suspense>
        <EmptyState context={title.toLowerCase()} />
      </>
    );
  }

  return (
    <>
      {header}
      <Suspense fallback={null}>
        <SavedViewRestore views={savedViews} />
        <ParallelFilters />
      </Suspense>
      <DataTable
        columns={table.columns}
        rows={table.rows}
        caption={`${title} table`}
        emptyMessage={table.emptyReason ?? 'No rows match filters.'}
      />
      <Suspense fallback={null}>
        <PaginationControls page={params.page} limit={params.limit} total={table.total} />
      </Suspense>
      <p className="table-meta">
        Data as of {new Date(table.asOf).toLocaleString(session.timezone)}
      </p>
    </>
  );
}

export function resolvePresentationForTable(
  searchParams: Record<string, string | string[] | undefined>,
  denied: boolean,
  isEmpty: boolean,
) {
  const params = parseTablePageParams(searchParams);
  return resolvePresentationFromData({
    explicit: params.presentation,
    denied,
    isEmpty,
  });
}
