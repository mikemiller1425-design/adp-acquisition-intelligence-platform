import Link from 'next/link';

import { ResearchScreen } from '@/components/research-screen';
import { startCollectionRunAction } from '@/lib/research-actions';
import { getWebResearchRuntime } from '@/lib/research-runtime';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewCollectionJobPage({ searchParams }: PageProps) {
  await getWebResearchRuntime();

  return (
    <ResearchScreen
      config={{
        screenId: 'UI-R05a',
        title: 'New Collection Run',
        description: 'Queue a bounded fixture collection run against an approved source.',
        requiredRoles: ['admin', 'sales'],
      }}
      searchParams={await searchParams}
    >
      <div className="detail-panel" data-testid="new-collection-job">
        <form action={startCollectionRunAction} className="form-panel">
          <p>Source: organization_website_fixture (fixture adapter — no live network)</p>
          <button type="submit" data-testid="start-collection-run-new">
            Queue collection run
          </button>
        </form>
        <p>
          <Link href="/research/collection-jobs">← Back to collection jobs</Link>
        </p>
      </div>
    </ResearchScreen>
  );
}
