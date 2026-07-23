import { ReportingTablePage } from '@/components/reporting-table-page';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProspectsPage({ searchParams }: PageProps) {
  return (
    <ReportingTablePage
      screenId="UI-02"
      title="Prospect master"
      description="Filter by parallel operational dimensions, save views, and export."
      viewKey="table_prospect_master"
      dashboardKey="D2"
      requiredRoles={['admin', 'sales', 'reviewer', 'viewer']}
      searchParams={await searchParams}
      headerActions={<a href="/prospects/new">New prospect</a>}
    />
  );
}
