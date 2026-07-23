import { Suspense } from 'react';

import { MetricGrid } from '@/components/metric-grid';
import { ParallelFilters } from '@/components/parallel-filters';
import { DeniedState, EmptyState, ErrorState, LoadingState } from '@/components/page-states';
import { ScreenHeader } from '@/components/screen-header';
import { getWebSession, roleCanAccess, toReportingScope } from '@/lib/auth';
import { parseTablePageParams } from '@/lib/filter-url';
import { queryDashboard } from '@/lib/reporting-client';

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = getWebSession();
  const params = parseTablePageParams(await searchParams);
  const requiredRoles = ['admin', 'sales', 'reviewer', 'viewer'] as const;

  if (!roleCanAccess(session.roles, requiredRoles)) {
    return (
      <>
        <ScreenHeader
          screenId="UI-01"
          title="Executive overview"
          description="Operational health and funnel snapshot from reporting contracts."
        />
        <DeniedState />
      </>
    );
  }

  if (params.presentation === 'loading') {
    return (
      <>
        <ScreenHeader
          screenId="UI-01"
          title="Executive overview"
          description="Operational health and funnel snapshot."
        />
        <LoadingState context="dashboard" />
      </>
    );
  }

  if (params.presentation === 'denied') {
    return (
      <>
        <ScreenHeader
          screenId="UI-01"
          title="Executive overview"
          description="Operational health and funnel snapshot."
        />
        <DeniedState />
      </>
    );
  }

  if (params.presentation === 'error') {
    return (
      <>
        <ScreenHeader
          screenId="UI-01"
          title="Executive overview"
          description="Operational health and funnel snapshot."
        />
        <ErrorState context="dashboard" retryHref="/dashboard" />
      </>
    );
  }

  let dashboard;
  try {
    dashboard = await queryDashboard({
      dashboardKey: 'D1',
      filters: params.filters,
      scope: toReportingScope(session),
    });
  } catch {
    return (
      <>
        <ScreenHeader
          screenId="UI-01"
          title="Executive overview"
          description="Operational health and funnel snapshot."
        />
        <ErrorState context="dashboard" retryHref="/dashboard" />
      </>
    );
  }

  if (
    params.presentation === 'empty' ||
    dashboard.metrics.every((m) => m.count === 0 && m.rate === null)
  ) {
    return (
      <>
        <ScreenHeader
          screenId="UI-01"
          title="Executive overview"
          description="Operational health and funnel snapshot."
        />
        <Suspense fallback={null}>
          <ParallelFilters />
        </Suspense>
        <EmptyState context="dashboard metrics" />
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        screenId="UI-01"
        title="Executive overview"
        description="D1 widgets bound to @adp/reporting dashboard query contracts."
      />
      <Suspense fallback={null}>
        <ParallelFilters />
      </Suspense>
      <MetricGrid metrics={dashboard.metrics} asOf={dashboard.asOf} timezone={dashboard.timezone} />
    </>
  );
}
