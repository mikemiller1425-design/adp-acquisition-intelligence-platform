import Link from 'next/link';

import { ResearchScreen } from '@/components/research-screen';
import { getWebResearchRuntime } from '@/lib/research-runtime';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ResearchRunsListPage({ searchParams }: PageProps) {
  const runtime = await getWebResearchRuntime();
  const runs = await runtime.researchRuns.listRuns();

  return (
    <ResearchScreen
      config={{
        screenId: 'UI-R12',
        title: 'Research Runs',
        description:
          'Bounded research-run orchestration. Fixture pilot by default; live egress remains gated off.',
        requiredRoles: ['admin', 'sales', 'reviewer'],
      }}
      searchParams={await searchParams}
    >
      <div className="detail-panel" data-testid="research-runs-list">
        <p>
          <Link href="/research/runs/new" data-testid="start-research-run-from-list">
            Start Research Run →
          </Link>
        </p>

        {runs.length === 0 ? (
          <p data-testid="research-runs-empty">No research runs yet.</p>
        ) : (
          <table className="data-table" data-testid="research-runs-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
                <th>Mode</th>
                <th>Targets</th>
                <th>Completed</th>
                <th>Blocked</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const name =
                  typeof run.configSnapshot.name === 'string'
                    ? run.configSnapshot.name
                    : run.id.slice(0, 8);
                return (
                  <tr key={run.id} data-testid={`research-run-row-${run.id}`}>
                    <td>
                      <Link
                        href={`/research/runs/${run.id}`}
                        data-testid={`research-run-link-${run.id}`}
                      >
                        {name}
                      </Link>
                    </td>
                    <td data-testid={`research-run-status-${run.id}`}>{run.status}</td>
                    <td>{run.mode}</td>
                    <td>{run.targetsTotal}</td>
                    <td>{run.targetsCompleted}</td>
                    <td>{run.targetsBlocked}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <p>
          <Link href="/research">← Research hub</Link>
        </p>
      </div>
    </ResearchScreen>
  );
}
