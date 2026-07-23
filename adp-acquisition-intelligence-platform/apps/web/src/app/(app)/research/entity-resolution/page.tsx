import Link from 'next/link';

import { ResearchScreen } from '@/components/research-screen';
import { resolveEntitiesAction } from '@/lib/research-actions';
import { getResearchWorkflowSnapshot, getWebResearchRuntime } from '@/lib/research-runtime';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function EntityResolutionPage({ searchParams }: PageProps) {
  await getWebResearchRuntime();
  const snapshot = await getResearchWorkflowSnapshot();

  return (
    <ResearchScreen
      config={{
        screenId: 'UI-R03',
        title: 'Entity Resolution',
        description:
          'Resolve imported candidates to organizations. Auto-merge never occurs on name-only similarity.',
        requiredRoles: ['admin', 'sales', 'reviewer'],
      }}
      searchParams={await searchParams}
    >
      <div className="detail-panel" data-testid="entity-resolution">
        <p data-testid="candidate-count">Candidates: {snapshot.candidates.length}</p>
        <p data-testid="organization-count">Organizations: {snapshot.organizations.length}</p>

        {snapshot.candidates.length > 0 ? (
          <table className="data-table" data-testid="candidates-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Domain</th>
                <th>Status</th>
                <th>Org link</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.candidates.map((c) => (
                <tr key={c.id}>
                  <td>{c.displayName ?? c.legalName ?? '—'}</td>
                  <td>{c.domain ?? '—'}</td>
                  <td>{c.status}</td>
                  <td>{c.organizationId?.slice(0, 8) ?? 'unlinked'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No candidates. Import a universe first.</p>
        )}

        <form action={resolveEntitiesAction}>
          <button type="submit" data-testid="resolve-entities">
            Resolve Candidate Organizations
          </button>
        </form>

        <ul data-testid="organizations-list">
          {snapshot.organizations.map((o) => (
            <li key={o.organizationId}>
              {o.displayName} ({o.domain ?? 'no-domain'})
            </li>
          ))}
        </ul>

        <p>
          <Link href="/research/priorities">Continue to priorities →</Link>
        </p>
      </div>
    </ResearchScreen>
  );
}
