import Link from 'next/link';

import { ResearchScreen } from '@/components/research-screen';
import { getResearchWorkflowSnapshot, getWebResearchRuntime } from '@/lib/research-runtime';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CollectionJobDetailPage({ params, searchParams }: PageProps) {
  await getWebResearchRuntime();
  const { id } = await params;
  const snapshot = await getResearchWorkflowSnapshot();
  const run = snapshot.collectionRuns.find((r) => r.id === id);

  return (
    <ResearchScreen
      config={{
        screenId: 'UI-R05b',
        title: 'Collection Run Detail',
        description: 'Inspect run status, attempts summary, and extraction yield.',
        requiredRoles: ['admin', 'sales', 'reviewer'],
      }}
      searchParams={await searchParams}
    >
      <div className="detail-panel" data-testid="collection-job-detail">
        {!run ? (
          <p data-testid="collection-run-missing">Run {id} not found in fixture runtime.</p>
        ) : (
          <dl className="detail-grid" data-testid="collection-run-detail">
            <div>
              <dt>Status</dt>
              <dd data-testid="collection-run-status">{run.status}</dd>
            </div>
            <div>
              <dt>Completed pages</dt>
              <dd>{run.completedCount}</dd>
            </div>
            <div>
              <dt>Blocked</dt>
              <dd>{run.blockedCount}</dd>
            </div>
            <div>
              <dt>Claims proposed</dt>
              <dd data-testid="collection-claims-proposed">
                {String(
                  (run.summary as { claimsProposed?: number }).claimsProposed ??
                    snapshot.claims.length,
                )}
              </dd>
            </div>
          </dl>
        )}
        <p>
          <Link href="/research/extraction-review">Review extracted claims →</Link>
        </p>
        <p>
          <Link href="/research/collection-jobs">← All collection jobs</Link>
        </p>
      </div>
    </ResearchScreen>
  );
}
