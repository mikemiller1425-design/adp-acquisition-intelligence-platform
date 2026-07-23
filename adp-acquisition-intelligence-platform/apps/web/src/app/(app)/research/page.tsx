import Link from 'next/link';

import { ResearchScreen } from '@/components/research-screen';
import { resetResearchFixtureAction } from '@/lib/research-actions';
import { getResearchWorkflowSnapshot, getWebResearchRuntime } from '@/lib/research-runtime';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const LINKS = [
  { href: '/research/population-sources', label: 'Population Sources' },
  { href: '/research/population-imports', label: 'Population Imports' },
  { href: '/research/entity-resolution', label: 'Entity Resolution' },
  { href: '/research/priorities', label: 'Research Priorities' },
  { href: '/research/collection-jobs', label: 'Collection Jobs' },
  { href: '/research/extraction-review', label: 'Extraction Review' },
  { href: '/research/coverage', label: 'Source Coverage / Dashboard' },
  { href: '/research/sources', label: 'Approved Sources' },
] as const;

export default async function ResearchHubPage({ searchParams }: PageProps) {
  getWebResearchRuntime();
  const snapshot = await getResearchWorkflowSnapshot();
  const query = await searchParams;

  return (
    <ResearchScreen
      config={{
        screenId: 'UI-08',
        title: 'Research',
        description:
          'Population, enrichment, prioritized collection, and extraction review. Collectors never confirm variables. Fixture-only retrieval — no live network.',
        requiredRoles: ['admin', 'sales', 'reviewer'],
      }}
      searchParams={query}
    >
      <div className="detail-panel" data-testid="research-hub">
        <dl className="detail-grid" data-testid="research-metrics">
          <div>
            <dt>Raw candidates</dt>
            <dd data-testid="metric-raw-candidates">{snapshot.metrics.rawCandidates}</dd>
          </div>
          <div>
            <dt>Claims awaiting</dt>
            <dd data-testid="metric-claims-awaiting">{snapshot.metrics.claimsAwaiting}</dd>
          </div>
          <div>
            <dt>Claims accepted</dt>
            <dd data-testid="metric-claims-accepted">{snapshot.metrics.claimsAccepted}</dd>
          </div>
          <div>
            <dt>Collection runs</dt>
            <dd data-testid="metric-collection-runs">{snapshot.metrics.collectionRunsTotal}</dd>
          </div>
          <div>
            <dt>Score recalcs</dt>
            <dd data-testid="metric-score-recalcs">{snapshot.metrics.scoresRecalculated}</dd>
          </div>
        </dl>

        <ul>
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
        </ul>

        <form action={resetResearchFixtureAction}>
          <button type="submit" data-testid="reset-fixture-runtime">
            Reset fixture runtime
          </button>
        </form>

        <p>
          <Link href="/research/intelligence">Open intelligence / research queue table</Link>
        </p>
      </div>
    </ResearchScreen>
  );
}
