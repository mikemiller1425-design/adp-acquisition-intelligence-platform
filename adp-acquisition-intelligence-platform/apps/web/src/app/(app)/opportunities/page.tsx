import { ReportingTablePage } from '@/components/reporting-table-page';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function OpportunitiesPage({ searchParams }: PageProps) {
  return (
    <ReportingTablePage
      screenId="UI-20"
      title="Opportunities"
      description="Advance opportunity stage, flag risk, and record outcomes."
      viewKey="table_opportunities"
      dashboardKey="D7"
      requiredRoles={['admin', 'sales']}
      searchParams={await searchParams}
    />
  );
}
