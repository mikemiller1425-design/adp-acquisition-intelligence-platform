import Link from 'next/link';

import { ResearchScreen } from '@/components/research-screen';
import { calculatePrioritiesAction } from '@/lib/research-actions';
import { getResearchWorkflowSnapshot, getWebResearchRuntime } from '@/lib/research-runtime';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PrioritiesPage({ searchParams }: PageProps) {
  await getWebResearchRuntime();
  const snapshot = await getResearchWorkflowSnapshot();

  return (
    <ResearchScreen
      config={{
        screenId: 'UI-R04',
        title: 'Research Priorities',
        description: 'Rank organizations for targeted public-source collection.',
        requiredRoles: ['admin', 'sales', 'reviewer', 'viewer'],
      }}
      searchParams={await searchParams}
    >
      <div className="detail-panel" data-testid="research-priorities">
        <form action={calculatePrioritiesAction}>
          <button type="submit" data-testid="calculate-priorities">
            Calculate Research Priorities
          </button>
        </form>

        {snapshot.priorities.length === 0 ? (
          <p data-testid="priorities-empty">No priority assessments yet.</p>
        ) : (
          <table className="data-table" data-testid="priorities-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Tier</th>
                <th>Explanation</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.priorities.map((p) => (
                <tr key={p.organizationId}>
                  <td>{p.organizationId.slice(0, 8)}</td>
                  <td>{p.assessment.tier}</td>
                  <td>{p.assessment.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p>
          <Link href="/research/collection-jobs">Continue to collection →</Link>
        </p>
      </div>
    </ResearchScreen>
  );
}
