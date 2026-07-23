import { describe, expect, it } from 'vitest';

import { parseTablePageParams, serializeTablePageParams } from '@/lib/filter-url';

describe('filter URL parsing', () => {
  it('parses parallel dimension filters from search params', () => {
    const params = parseTablePageParams({
      prospect_stage: 'qualified',
      research_status: 'gaps_open',
      outreach_status: 'active',
      freshness: 'stale',
      opportunity_stage: 'discovery',
      page: '2',
      limit: '50',
      sort: 'displayName',
      sort_dir: 'desc',
      saved_view: 'sv-1',
    });

    expect(params.filters.prospectStage).toBe('qualified');
    expect(params.filters.researchStatus).toBe('gaps_open');
    expect(params.filters.outreachStatus).toBe('active');
    expect(params.filters.dataFreshnessStatus).toBe('stale');
    expect(params.filters.opportunityStage).toBe('discovery');
    expect(params.page).toBe(2);
    expect(params.limit).toBe(50);
    expect(params.sortField).toBe('displayName');
    expect(params.sortDirection).toBe('desc');
    expect(params.savedViewId).toBe('sv-1');
  });

  it('serializes filters back to URL search params', () => {
    const query = serializeTablePageParams({
      filters: {
        researchStatus: 'gaps_open',
        outreachStatus: 'active',
      },
      page: 3,
      sortField: 'displayName',
      sortDirection: 'asc',
    });

    expect(query).toContain('research_status=gaps_open');
    expect(query).toContain('outreach_status=active');
    expect(query).toContain('page=3');
    expect(query).toContain('sort=displayName');
    expect(query).toContain('sort_dir=asc');
  });

  it('recognizes presentation state query param', () => {
    expect(parseTablePageParams({ state: 'denied' }).presentation).toBe('denied');
    expect(parseTablePageParams({ state: 'invalid' }).presentation).toBeNull();
  });
});
