import { ReportingTablePage } from '@/components/reporting-table-page';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ResearchPage({ searchParams }: PageProps) {
  return (
    <ReportingTablePage
      screenId="UI-08"
      title="Research queue"
      description="Prioritize gaps, filter research status and freshness, assign research."
      viewKey="table_collection_research"
      dashboardKey="D3"
      requiredRoles={['admin', 'sales', 'reviewer']}
      searchParams={await searchParams}
    />
  );
}
