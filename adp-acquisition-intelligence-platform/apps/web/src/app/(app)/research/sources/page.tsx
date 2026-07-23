import { ResearchScreen } from '@/components/research-screen';
import { getWebResearchRuntime } from '@/lib/research-runtime';
import { getFixtureApprovedSource } from '@adp/research';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ApprovedSourcesPage({ searchParams }: PageProps) {
  const runtime = await getWebResearchRuntime();
  const seeded = getFixtureApprovedSource();
  const fromDb = await runtime.uow.approvedSources.getByKey(seeded.sourceKey);
  const sources = [fromDb ?? seeded];

  return (
    <ResearchScreen
      config={{
        screenId: 'UI-R08',
        title: 'Approved Sources',
        description:
          'Approved-source registry. Fixture adapters use not_required_for_fixture — that is not human legal/privacy/security approval.',
        requiredRoles: ['admin', 'reviewer'],
      }}
      searchParams={await searchParams}
    >
      <div className="detail-panel" data-testid="approved-sources">
        <table className="data-table" data-testid="approved-sources-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Adapter</th>
              <th>Lifecycle</th>
              <th>Legal</th>
              <th>Privacy</th>
              <th>Security</th>
              <th>Kill switch</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.sourceKey} data-testid={`source-${s.sourceKey}`}>
                <td>{s.sourceKey}</td>
                <td>{s.adapterType}</td>
                <td>{s.lifecycle}</td>
                <td>{s.legalReviewStatus}</td>
                <td>{s.privacyReviewStatus}</td>
                <td>{s.securityReviewStatus}</td>
                <td>{s.killSwitchActive ? 'on' : 'off'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p data-testid="fixture-approval-note">
          Fixture exemption statuses must never be treated as owner production approvals (RB-014+).
        </p>
      </div>
    </ResearchScreen>
  );
}
