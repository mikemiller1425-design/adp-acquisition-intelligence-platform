import Link from 'next/link';

import { ResearchScreen } from '@/components/research-screen';
import { getResearchWorkflowSnapshot, getWebResearchRuntime } from '@/lib/research-runtime';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CoveragePage({ searchParams }: PageProps) {
  getWebResearchRuntime();
  const snapshot = await getResearchWorkflowSnapshot();
  const query = await searchParams;

  return (
    <ResearchScreen
      config={{
        screenId: 'UI-R07',
        title: 'Source Coverage & Research Dashboard',
        description:
          'Fixture pilot dashboard: population → collection → accepted evidence/variables → recalculation.',
        requiredRoles: ['admin', 'sales', 'reviewer', 'viewer'],
      }}
      searchParams={query}
    >
      <div className="detail-panel" data-testid="research-coverage-dashboard">
        {query.accepted === '1' ? (
          <p data-testid="claim-accepted-banner">
            Claim accepted — evidence, variable proposal, outbox, and recalculation requested.
          </p>
        ) : null}

        <dl className="detail-grid" data-testid="coverage-metrics">
          <div>
            <dt>Organizations</dt>
            <dd data-testid="dash-orgs">{snapshot.organizations.length}</dd>
          </div>
          <div>
            <dt>Candidates</dt>
            <dd data-testid="dash-candidates">{snapshot.candidates.length}</dd>
          </div>
          <div>
            <dt>Claims accepted</dt>
            <dd data-testid="dash-claims-accepted">{snapshot.metrics.claimsAccepted}</dd>
          </div>
          <div>
            <dt>Evidence/variable path</dt>
            <dd data-testid="dash-evidence-ready">
              {snapshot.metrics.claimsAccepted > 0 ? 'ready' : 'pending'}
            </dd>
          </div>
          <div>
            <dt>Score recalculations</dt>
            <dd data-testid="dash-score-recalcs">{snapshot.metrics.scoresRecalculated}</dd>
          </div>
          <div>
            <dt>Collection runs</dt>
            <dd data-testid="dash-collection-runs">{snapshot.collectionRuns.length}</dd>
          </div>
        </dl>

        <h2>Outbox (recent event types)</h2>
        <ul data-testid="outbox-events">
          {[...new Set(snapshot.outboxEventTypes)].map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>

        <p>
          <Link href="/research">← Research hub</Link>
        </p>
      </div>
    </ResearchScreen>
  );
}
