import Link from 'next/link';

import { ResearchScreen } from '@/components/research-screen';
import { startCollectionRunAction } from '@/lib/research-actions';
import { getResearchWorkflowSnapshot, getWebResearchRuntime } from '@/lib/research-runtime';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CollectionJobsPage({ searchParams }: PageProps) {
  await getWebResearchRuntime();
  const snapshot = await getResearchWorkflowSnapshot();

  return (
    <ResearchScreen
      config={{
        screenId: 'UI-R05',
        title: 'Collection Jobs',
        description:
          'Targeted fixture collection runs. Live network retrieval is disabled in this pilot.',
        requiredRoles: ['admin', 'sales'],
      }}
      searchParams={await searchParams}
    >
      <div className="detail-panel" data-testid="collection-jobs">
        <form action={startCollectionRunAction}>
          <button type="submit" data-testid="start-collection-run">
            Start Collection Run (fixture)
          </button>
        </form>

        <p>
          <Link href="/research/collection-jobs/new">New collection job form →</Link>
        </p>

        {snapshot.collectionRuns.length === 0 ? (
          <p data-testid="collection-runs-empty">No collection runs yet.</p>
        ) : (
          <table className="data-table" data-testid="collection-runs-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
                <th>Targets</th>
                <th>Completed</th>
                <th>Blocked</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.collectionRuns.map((run) => (
                <tr key={run.id} data-testid={`collection-run-${run.id}`}>
                  <td>
                    <Link href={`/research/collection-jobs/${run.id}`}>{run.id.slice(0, 8)}</Link>
                  </td>
                  <td data-testid={`collection-status-${run.id}`}>{run.status}</td>
                  <td>{run.targetCount}</td>
                  <td>{run.completedCount}</td>
                  <td>{run.blockedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p>
          <Link href="/research/extraction-review">Continue to extraction review →</Link>
        </p>
      </div>
    </ResearchScreen>
  );
}
