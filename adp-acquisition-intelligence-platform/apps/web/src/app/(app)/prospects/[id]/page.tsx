import Link from 'next/link';

import { DeniedState, EmptyState, ErrorState, LoadingState } from '@/components/page-states';
import { ScreenHeader } from '@/components/screen-header';
import { getWebSession, roleCanAccess } from '@/lib/auth';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DEMO_ORGS: Record<string, Record<string, string>> = {
  'org-001': {
    displayName: 'Northline Advisory Group',
    prospectStage: 'qualified',
    researchStatus: 'gaps_open',
    outreachStatus: 'active',
    dataFreshnessStatus: 'stale',
    primaryMotion: 'acquisition',
    channelPermission: 'allowed',
  },
  'org-002': {
    displayName: 'Summit Wealth Partners',
    prospectStage: 'discovery',
    researchStatus: 'sufficient_for_purpose',
    outreachStatus: 'ready',
    dataFreshnessStatus: 'current',
    primaryMotion: 'wholesale',
    channelPermission: 'allowed',
  },
  'org-003': {
    displayName: 'Harbor Capital Advisors',
    prospectStage: 'outreach',
    researchStatus: 'gaps_open',
    outreachStatus: 'blocked_restriction',
    dataFreshnessStatus: 'mixed',
    primaryMotion: 'cas',
    channelPermission: 'restricted',
  },
};

export default async function ProspectDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const session = getWebSession();
  const requiredRoles = ['admin', 'sales', 'reviewer', 'viewer'] as const;

  if (!roleCanAccess(session.roles, requiredRoles)) {
    return (
      <>
        <ScreenHeader
          screenId="UI-04"
          title="Organization 360"
          description="Inspect parallel states, scores, consent, and activity."
        />
        <DeniedState />
      </>
    );
  }

  const state = typeof query.state === 'string' ? query.state : undefined;
  if (state === 'loading')
    return (
      <>
        <ScreenHeader screenId="UI-04" title="Organization 360" description="" />
        <LoadingState />
      </>
    );
  if (state === 'denied')
    return (
      <>
        <ScreenHeader screenId="UI-04" title="Organization 360" description="" />
        <DeniedState />
      </>
    );
  if (state === 'error')
    return (
      <>
        <ScreenHeader screenId="UI-04" title="Organization 360" description="" />
        <ErrorState retryHref={`/prospects/${id}`} />
      </>
    );

  const org = DEMO_ORGS[id];
  if (!org || state === 'empty') {
    return (
      <>
        <ScreenHeader
          screenId="UI-04"
          title="Organization 360"
          description="Inspect parallel states, scores, consent, and activity."
        />
        <EmptyState context="organization" />
      </>
    );
  }

  const channelBlocked = org.channelPermission !== 'allowed';

  return (
    <>
      <ScreenHeader
        screenId="UI-04"
        title={org.displayName ?? id}
        description="Organization 360 with parallel operational dimensions and consent-aware channel actions."
      />
      <dl className="detail-grid">
        <div>
          <dt>Prospect stage</dt>
          <dd>{org.prospectStage}</dd>
        </div>
        <div>
          <dt>Research status</dt>
          <dd>{org.researchStatus}</dd>
        </div>
        <div>
          <dt>Outreach status</dt>
          <dd>{org.outreachStatus}</dd>
        </div>
        <div>
          <dt>Data freshness</dt>
          <dd>{org.dataFreshnessStatus}</dd>
        </div>
        <div>
          <dt>Primary motion</dt>
          <dd>{org.primaryMotion}</dd>
        </div>
        <div>
          <dt>Channel permission</dt>
          <dd>{org.channelPermission}</dd>
        </div>
      </dl>
      <ul className="tab-list" aria-label="Organization 360 sections">
        <li>
          <Link href={`/prospects/${id}`}>Overview</Link>
        </li>
        <li>
          <span>Variables</span>
        </li>
        <li>
          <span>Evidence</span>
        </li>
        <li>
          <span>Scores</span>
        </li>
        <li>
          <span>Outreach</span>
        </li>
        <li>
          <span>Consent</span>
        </li>
      </ul>
      <div className="detail-panel">
        <p>Next action: Review research gaps and schedule discovery.</p>
        <button type="button" disabled={channelBlocked}>
          Record outreach activity
        </button>
        {channelBlocked ? (
          <p className="channel-disabled">
            Channel action disabled: effective permission is {org.channelPermission}. Server
            enforcement remains authoritative.
          </p>
        ) : null}
      </div>
    </>
  );
}
