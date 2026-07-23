import { ReportingTablePage } from '@/components/reporting-table-page';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DiscoveryPage({ searchParams }: PageProps) {
  return (
    <ReportingTablePage
      screenId="UI-14"
      title="Discovery"
      description="Prepare, schedule, and open discovery sessions."
      viewKey="table_discovery"
      dashboardKey="D5"
      requiredRoles={['admin', 'sales']}
      searchParams={await searchParams}
    />
  );
}
