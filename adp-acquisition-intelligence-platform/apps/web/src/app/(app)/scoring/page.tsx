import { ReportingTablePage } from '@/components/reporting-table-page';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ScoringPage({ searchParams }: PageProps) {
  return (
    <ReportingTablePage
      screenId="UI-10"
      title="Scoring"
      description="Compare scores, confidence, completeness, and authorized recalculation."
      viewKey="table_scoring"
      dashboardKey="D4"
      requiredRoles={['admin', 'sales', 'reviewer']}
      searchParams={await searchParams}
    />
  );
}
