import { Suspense } from 'react';

import { MetricGrid } from '@/components/metric-grid';
import { ParallelFilters } from '@/components/parallel-filters';
import { ReportingTablePage } from '@/components/reporting-table-page';
import { ScreenHeader } from '@/components/screen-header';
import { getWebSession, toReportingScope } from '@/lib/auth';
import { parseTablePageParams } from '@/lib/filter-url';
import { queryDashboard } from '@/lib/reporting-client';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PerformancePage({ searchParams }: PageProps) {
  const params = parseTablePageParams(await searchParams);
  const session = getWebSession();
  const dashboard = await queryDashboard({
    dashboardKey: 'D8',
    filters: params.filters,
    scope: toReportingScope(session),
  });

  return (
    <>
      <ScreenHeader
        screenId="UI-21"
        title="Model performance"
        description="D8 funnel and conversion metrics from reporting contracts."
      />
      <Suspense fallback={null}>
        <ParallelFilters enabled={['prospectStage', 'researchStatus', 'outreachStatus']} />
      </Suspense>
      <MetricGrid metrics={dashboard.metrics} asOf={dashboard.asOf} timezone={dashboard.timezone} />
      <h2 className="section-heading">Cohort drilldown</h2>
      <ReportingTablePage
        screenId="UI-21"
        title="Performance cohort table"
        description="Opportunity-level performance drilldown."
        viewKey="table_opportunities"
        dashboardKey="D8"
        requiredRoles={['admin', 'sales', 'reviewer']}
        searchParams={await searchParams}
        hideHeader
      />
    </>
  );
}
