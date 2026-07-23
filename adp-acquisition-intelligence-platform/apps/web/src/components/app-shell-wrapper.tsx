'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell, type AppShellSession } from '@/components/app-shell';
import type { NavItem } from '@/lib/nav';

type AppShellWrapperProps = {
  children: ReactNode;
  session: AppShellSession;
  environment: string;
  showEnvBadge: boolean;
  navItems: readonly NavItem[];
};

export function AppShellWrapper({
  children,
  session,
  environment,
  showEnvBadge,
  navItems,
}: AppShellWrapperProps) {
  const pathname = usePathname();
  return (
    <AppShell
      currentPath={pathname}
      session={session}
      environment={environment}
      showEnvBadge={showEnvBadge}
      navItems={navItems}
    >
      {children}
    </AppShell>
  );
}
