import { describe, expect, it } from 'vitest';

import { roleCanAccess } from '@/lib/auth';
import { getNavItemsForRoles, NAV_ITEMS } from '@/lib/nav';

describe('role-aware navigation', () => {
  it('exposes all catalog routes in nav config', () => {
    expect(NAV_ITEMS.length).toBeGreaterThanOrEqual(15);
    expect(NAV_ITEMS.some((item) => item.screenId === 'UI-01')).toBe(true);
    expect(NAV_ITEMS.some((item) => item.screenId === 'UI-27')).toBe(true);
  });

  it('filters admin-only links for sales users', () => {
    const items = getNavItemsForRoles(['sales']);
    expect(items.some((item) => item.href === '/admin/variables')).toBe(false);
    expect(items.some((item) => item.href === '/prospects')).toBe(true);
    expect(items.some((item) => item.href === '/outreach')).toBe(true);
  });

  it('allows admin access to administration screens', () => {
    expect(roleCanAccess(['admin'], ['admin'])).toBe(true);
    const items = getNavItemsForRoles(['admin']);
    expect(items.some((item) => item.href === '/admin/consent')).toBe(true);
  });

  it('hides reviewer-only screens from viewers', () => {
    const items = getNavItemsForRoles(['viewer']);
    expect(items.some((item) => item.href === '/audit')).toBe(false);
    expect(items.some((item) => item.href === '/dashboard')).toBe(true);
  });
});
