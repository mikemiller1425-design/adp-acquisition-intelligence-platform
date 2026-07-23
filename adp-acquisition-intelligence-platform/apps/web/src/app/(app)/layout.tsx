import type { ReactNode } from 'react';

import { AppShellWrapper } from '@/components/app-shell-wrapper';
import { getAppEnvironment, getWebSession, isProductionEnvironment } from '@/lib/auth';
import { getNavItemsForRoles } from '@/lib/nav';

import './app.css';

export default function AppLayout({ children }: { children: ReactNode }) {
  const session = getWebSession();
  const navItems = getNavItemsForRoles(session.roles);

  return (
    <AppShellWrapper
      session={{ displayName: session.displayName, timezone: session.timezone }}
      environment={getAppEnvironment()}
      showEnvBadge={!isProductionEnvironment()}
      navItems={navItems}
    >
      {children}
    </AppShellWrapper>
  );
}
