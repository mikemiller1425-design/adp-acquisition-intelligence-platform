import { ReportingTablePage } from '@/components/reporting-table-page';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function OutreachPage({ searchParams }: PageProps) {
  return (
    <ReportingTablePage
      screenId="UI-18"
      title="Outreach operations"
      description="Review drafts, record activity, and inspect channel permission rulings."
      viewKey="table_outreach"
      dashboardKey="D6"
      requiredRoles={['admin', 'sales']}
      searchParams={await searchParams}
      headerActions={<a href="/outreach/templates">Templates</a>}
    />
  );
}
