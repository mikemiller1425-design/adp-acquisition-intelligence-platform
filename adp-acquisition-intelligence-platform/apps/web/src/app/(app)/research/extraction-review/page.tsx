import Link from 'next/link';

import { ResearchScreen } from '@/components/research-screen';
import { acceptClaimAction, rejectClaimAction } from '@/lib/research-actions';
import { getResearchWorkflowSnapshot, getWebResearchRuntime } from '@/lib/research-runtime';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ExtractionReviewPage({ searchParams }: PageProps) {
  await getWebResearchRuntime();
  const snapshot = await getResearchWorkflowSnapshot();
  const proposed = snapshot.claims.filter((c) => c.reviewStatus === 'proposed');

  return (
    <ResearchScreen
      config={{
        screenId: 'UI-R06',
        title: 'Extraction Review',
        description:
          'Human review of proposed claims. Acceptance writes evidence, proposes variables, and requests score recalculation transactionally.',
        requiredRoles: ['admin', 'reviewer'],
      }}
      searchParams={await searchParams}
    >
      <div className="detail-panel" data-testid="extraction-review">
        <p data-testid="proposed-claim-count">Proposed claims: {proposed.length}</p>

        {proposed.length === 0 ? (
          <p data-testid="claims-empty">No claims awaiting review.</p>
        ) : (
          <ul data-testid="claims-list">
            {proposed.map((claim) => (
              <li key={claim.id} data-testid={`claim-${claim.id}`}>
                <strong>{claim.variableKey}</strong>
                <pre>{JSON.stringify(claim.proposedValue)}</pre>
                <p>{claim.originalExcerpt}</p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <form action={acceptClaimAction}>
                    <input type="hidden" name="claimId" value={claim.id} />
                    <button type="submit" data-testid={`accept-claim-${claim.id}`}>
                      Accept claim
                    </button>
                  </form>
                  <form action={rejectClaimAction}>
                    <input type="hidden" name="claimId" value={claim.id} />
                    <button type="submit" data-testid={`reject-claim-${claim.id}`}>
                      Reject
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p>
          <Link href="/research/coverage">View coverage / dashboard →</Link>
        </p>
      </div>
    </ResearchScreen>
  );
}
