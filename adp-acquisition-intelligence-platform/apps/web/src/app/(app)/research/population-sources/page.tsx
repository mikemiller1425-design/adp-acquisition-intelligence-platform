import { ResearchScreen } from '@/components/research-screen';
import { getResearchWorkflowSnapshot, getWebResearchRuntime } from '@/lib/research-runtime';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PopulationSourcesPage({ searchParams }: PageProps) {
  await getWebResearchRuntime();
  const snapshot = await getResearchWorkflowSnapshot();

  return (
    <ResearchScreen
      config={{
        screenId: 'UI-R01',
        title: 'Population Sources',
        description: 'Registered population source systems for universe ingestion (fixture pilot).',
        requiredRoles: ['admin', 'sales', 'reviewer', 'viewer'],
      }}
      searchParams={await searchParams}
    >
      <div className="detail-panel" data-testid="population-sources">
        <table className="data-table">
          <thead>
            <tr>
              <th>Source key</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>fixture_csv</td>
              <td>csv</td>
              <td>enabled</td>
            </tr>
          </tbody>
        </table>
        <p data-testid="population-source-import-count">
          Imports recorded: {snapshot.imports.length}
        </p>
      </div>
    </ResearchScreen>
  );
}
