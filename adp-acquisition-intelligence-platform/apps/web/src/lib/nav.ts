import type { ReportingRole } from '@adp/reporting';

import { roleCanAccess } from './auth';

export type NavItem = {
  id: string;
  label: string;
  href: string;
  screenId: string;
  roles: readonly ReportingRole[];
  section: 'overview' | 'operations' | 'admin' | 'compliance';
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    screenId: 'UI-01',
    roles: ['admin', 'sales', 'reviewer', 'viewer'],
    section: 'overview',
  },
  {
    id: 'prospects',
    label: 'Prospects',
    href: '/prospects',
    screenId: 'UI-02',
    roles: ['admin', 'sales', 'reviewer', 'viewer'],
    section: 'overview',
  },
  {
    id: 'imports',
    label: 'Imports',
    href: '/imports',
    screenId: 'UI-05',
    roles: ['admin', 'sales'],
    section: 'operations',
  },
  {
    id: 'duplicates',
    label: 'Duplicates',
    href: '/duplicates',
    screenId: 'UI-07',
    roles: ['admin', 'reviewer'],
    section: 'operations',
  },
  {
    id: 'research',
    label: 'Research',
    href: '/research',
    screenId: 'UI-08',
    roles: ['admin', 'sales', 'reviewer'],
    section: 'operations',
  },
  {
    id: 'research-population-sources',
    label: 'Population Sources',
    href: '/research/population-sources',
    screenId: 'UI-R01',
    roles: ['admin', 'sales'],
    section: 'operations',
  },
  {
    id: 'research-extraction-review',
    label: 'Extraction Review',
    href: '/research/extraction-review',
    screenId: 'UI-R07',
    roles: ['admin', 'reviewer'],
    section: 'operations',
  },
  {
    id: 'research-approved-sources',
    label: 'Approved Sources',
    href: '/research/sources',
    screenId: 'UI-R09',
    roles: ['admin'],
    section: 'operations',
  },
  {
    id: 'scoring',
    label: 'Scoring',
    href: '/scoring',
    screenId: 'UI-10',
    roles: ['admin', 'sales', 'reviewer'],
    section: 'operations',
  },
  {
    id: 'reviews',
    label: 'Reviews',
    href: '/reviews',
    screenId: 'UI-12',
    roles: ['admin', 'reviewer'],
    section: 'operations',
  },
  {
    id: 'discovery',
    label: 'Discovery',
    href: '/discovery',
    screenId: 'UI-14',
    roles: ['admin', 'sales'],
    section: 'operations',
  },
  {
    id: 'outreach',
    label: 'Outreach',
    href: '/outreach',
    screenId: 'UI-18',
    roles: ['admin', 'sales'],
    section: 'operations',
  },
  {
    id: 'opportunities',
    label: 'Opportunities',
    href: '/opportunities',
    screenId: 'UI-20',
    roles: ['admin', 'sales'],
    section: 'operations',
  },
  {
    id: 'performance',
    label: 'Performance',
    href: '/performance',
    screenId: 'UI-21',
    roles: ['admin', 'sales', 'reviewer'],
    section: 'overview',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    href: '/tasks',
    screenId: 'UI-22',
    roles: ['admin', 'sales', 'reviewer'],
    section: 'operations',
  },
  {
    id: 'audit',
    label: 'Audit',
    href: '/audit',
    screenId: 'UI-26',
    roles: ['admin', 'reviewer'],
    section: 'compliance',
  },
  {
    id: 'admin-variables',
    label: 'Variables',
    href: '/admin/variables',
    screenId: 'UI-23',
    roles: ['admin'],
    section: 'admin',
  },
  {
    id: 'admin-scoring',
    label: 'Score definitions',
    href: '/admin/scoring',
    screenId: 'UI-24',
    roles: ['admin'],
    section: 'admin',
  },
  {
    id: 'admin-access',
    label: 'Access',
    href: '/admin/access',
    screenId: 'UI-25',
    roles: ['admin'],
    section: 'admin',
  },
  {
    id: 'admin-consent',
    label: 'Consent',
    href: '/admin/consent',
    screenId: 'UI-27',
    roles: ['admin'],
    section: 'admin',
  },
] as const;

export function getNavItemsForRoles(roles: readonly ReportingRole[]): NavItem[] {
  return NAV_ITEMS.filter((item) => roleCanAccess(roles, item.roles));
}

export function getNavItemByHref(href: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.href === href || href.startsWith(`${item.href}/`));
}

export function groupNavItems(items: readonly NavItem[]): Record<NavItem['section'], NavItem[]> {
  const groups: Record<NavItem['section'], NavItem[]> = {
    overview: [],
    operations: [],
    admin: [],
    compliance: [],
  };
  for (const item of items) {
    groups[item.section].push(item);
  }
  return groups;
}
