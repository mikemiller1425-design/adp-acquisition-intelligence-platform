import { describe, expect, it } from 'vitest';

import { toReportingScope } from '@/lib/auth';
import { queryDashboard, queryTable } from '@/lib/reporting-client';

describe('dashboard reporting smoke', () => {
  const scope = toReportingScope({
    userId: 'demo-user-001',
    displayName: 'Demo',
    roles: ['admin'],
    territoryIds: ['territory-east'],
    viewAllTerritories: true,
    timezone: 'America/New_York',
  });

  it('returns D1 metrics from fixture provider', async () => {
    const result = await queryDashboard({
      dashboardKey: 'D1',
      filters: {},
      scope,
    });

    expect(result.dashboardKey).toBe('D1');
    expect(result.metrics.length).toBeGreaterThan(0);
    expect(result.metrics.find((metric) => metric.key === 'total_organizations')?.count).toBe(3);
    expect(result.asOf).toBeTruthy();
  });

  it('returns prospect master table rows with parallel dimension columns', async () => {
    const result = await queryTable({
      viewKey: 'table_prospect_master',
      filters: { researchStatus: 'gaps_open' },
      sort: null,
      pagination: { limit: 25, offset: 0 },
      scope,
    });

    expect(result.viewKey).toBe('table_prospect_master');
    expect(result.columns.some((column) => column.key === 'researchStatus')).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it('returns empty reason instead of fabricated zeros when filtered to none', async () => {
    const result = await queryTable({
      viewKey: 'table_prospect_master',
      filters: { prospectStage: 'nonexistent-stage' },
      sort: null,
      pagination: { limit: 25, offset: 0 },
      scope,
    });

    expect(result.total).toBe(0);
    expect(result.emptyReason).toBeTruthy();
  });
});
