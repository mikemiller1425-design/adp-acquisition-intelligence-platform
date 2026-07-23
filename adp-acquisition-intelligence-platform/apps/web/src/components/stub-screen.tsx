import type { ReactNode } from 'react';

import { DeniedState, EmptyState, ErrorState, LoadingState } from '@/components/page-states';
import { ScreenHeader } from '@/components/screen-header';
import { getWebSession, roleCanAccess } from '@/lib/auth';
import type { ReportingRole } from '@adp/reporting';

export type StubScreenConfig = {
  screenId: string;
  title: string;
  description: string;
  requiredRoles: readonly ReportingRole[];
  primaryActions?: readonly string[];
};

type StubScreenProps = {
  config: StubScreenConfig;
  searchParams?: Record<string, string | string[] | undefined>;
  children?: ReactNode;
};

export function StubScreen({ config, searchParams = {}, children }: StubScreenProps) {
  const session = getWebSession();
  const state = typeof searchParams.state === 'string' ? searchParams.state : undefined;

  if (!roleCanAccess(session.roles, config.requiredRoles)) {
    return (
      <>
        <ScreenHeader
          screenId={config.screenId}
          title={config.title}
          description={config.description}
        />
        <DeniedState />
      </>
    );
  }

  if (state === 'loading') {
    return (
      <>
        <ScreenHeader
          screenId={config.screenId}
          title={config.title}
          description={config.description}
        />
        <LoadingState context={config.title.toLowerCase()} />
      </>
    );
  }

  if (state === 'denied') {
    return (
      <>
        <ScreenHeader
          screenId={config.screenId}
          title={config.title}
          description={config.description}
        />
        <DeniedState />
      </>
    );
  }

  if (state === 'error') {
    return (
      <>
        <ScreenHeader
          screenId={config.screenId}
          title={config.title}
          description={config.description}
        />
        <ErrorState context={config.title.toLowerCase()} retryHref="?" />
      </>
    );
  }

  if (state === 'empty') {
    return (
      <>
        <ScreenHeader
          screenId={config.screenId}
          title={config.title}
          description={config.description}
        />
        <EmptyState context={config.title.toLowerCase()} />
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        screenId={config.screenId}
        title={config.title}
        description={config.description}
      />
      {config.primaryActions && config.primaryActions.length > 0 ? (
        <ul className="stub-actions">
          {config.primaryActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      ) : null}
      {children}
    </>
  );
}
