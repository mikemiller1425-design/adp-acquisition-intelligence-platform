'use client';

import type { ReactNode } from 'react';

import styles from './app-shell.module.css';
import type { NavItem } from '@/lib/nav';
import { groupNavItems } from '@/lib/nav';

export type AppShellSession = {
  displayName: string;
  timezone: string;
};

type AppShellProps = {
  children: ReactNode;
  currentPath: string;
  session: AppShellSession;
  environment: string;
  showEnvBadge: boolean;
  navItems: readonly NavItem[];
};

export function AppShell({
  children,
  currentPath,
  session,
  environment,
  showEnvBadge,
  navItems,
}: AppShellProps) {
  const grouped = groupNavItems([...navItems]);

  const sections: { key: keyof typeof grouped; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'operations', label: 'Operations' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'admin', label: 'Administration' },
  ];

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandTitle}>ADP Acquisition Intelligence</span>
          {showEnvBadge ? (
            <span className={styles.envBadge} aria-label={`Environment: ${environment}`}>
              {environment}
            </span>
          ) : null}
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.timezone} title="Display timezone">
            TZ: {session.timezone}
          </span>
          <span
            className={styles.taskIndicator}
            title="Open tasks"
            aria-label="Open tasks placeholder"
          >
            Tasks: 0
          </span>
          <span className={styles.user}>{session.displayName}</span>
        </div>
      </header>
      <div className={styles.body}>
        <nav className={styles.nav} aria-label="Primary">
          {sections.map((section) =>
            grouped[section.key].length > 0 ? (
              <div key={section.key} className={styles.navSection}>
                <p className={styles.navSectionLabel}>{section.label}</p>
                <ul className={styles.navList}>
                  {grouped[section.key].map((item) => {
                    const active =
                      currentPath === item.href || currentPath.startsWith(`${item.href}/`);
                    return (
                      <li key={item.id}>
                        <a
                          href={item.href}
                          className={active ? styles.navLinkActive : styles.navLink}
                          aria-current={active ? 'page' : undefined}
                        >
                          {item.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null,
          )}
        </nav>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
