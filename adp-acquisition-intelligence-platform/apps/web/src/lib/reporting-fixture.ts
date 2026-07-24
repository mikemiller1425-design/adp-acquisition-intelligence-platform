import type {
  DashboardFilters,
  DashboardKey,
  DashboardQueryResult,
  Pagination,
  ReportingAuthorizationScope,
  SavedViewRecord,
  TableQueryResult,
  TableSort,
  TableViewKey,
} from '@adp/reporting';

const FIXTURE_ROWS: Record<TableViewKey, Record<string, unknown>[]> = {
  table_prospect_master: [
    {
      id: 'org-001',
      displayName: 'Northline Advisory Group',
      prospectStage: 'qualified',
      researchStatus: 'gaps_open',
      outreachStatus: 'active',
      dataFreshnessStatus: 'stale',
    },
    {
      id: 'org-002',
      displayName: 'Summit Wealth Partners',
      prospectStage: 'discovery',
      researchStatus: 'sufficient_for_purpose',
      outreachStatus: 'ready',
      dataFreshnessStatus: 'current',
    },
    {
      id: 'org-003',
      displayName: 'Harbor Capital Advisors',
      prospectStage: 'outreach',
      researchStatus: 'gaps_open',
      outreachStatus: 'blocked_restriction',
      dataFreshnessStatus: 'mixed',
    },
  ],
  table_collection_research: [
    {
      id: 'org-001',
      displayName: 'Northline Advisory Group',
      researchStatus: 'gaps_open',
      dataFreshnessStatus: 'stale',
    },
    {
      id: 'org-003',
      displayName: 'Harbor Capital Advisors',
      researchStatus: 'gaps_open',
      dataFreshnessStatus: 'mixed',
    },
  ],
  table_scoring: [
    {
      id: 'score-001',
      organizationId: 'org-001',
      displayName: 'Northline Advisory Group',
      score: 78,
      tier: 'A',
      status: 'active',
    },
    {
      id: 'score-002',
      organizationId: 'org-002',
      displayName: 'Summit Wealth Partners',
      score: 64,
      tier: 'B',
      status: 'provisional',
    },
  ],
  table_discovery: [
    {
      id: 'disc-001',
      organizationId: 'org-002',
      displayName: 'Summit Wealth Partners',
      sessionStatus: 'scheduled',
      sessionDate: '2026-07-25',
    },
  ],
  table_outreach: [
    {
      id: 'out-001',
      organizationId: 'org-001',
      displayName: 'Northline Advisory Group',
      outreachStatus: 'active',
      channelPermission: 'allowed',
      currentStep: 'intro_email',
    },
    {
      id: 'out-002',
      organizationId: 'org-003',
      displayName: 'Harbor Capital Advisors',
      outreachStatus: 'blocked_restriction',
      channelPermission: 'restricted',
      currentStep: 'hold',
    },
  ],
  table_opportunities: [
    {
      id: 'opp-001',
      organizationId: 'org-002',
      displayName: 'Summit Wealth Partners',
      opportunityStage: 'discovery',
      prospectStage: 'discovery',
      valueBand: '1m_5m',
    },
  ],
};

const TABLE_COLUMNS: Record<TableViewKey, { key: string; label: string }[]> = {
  table_prospect_master: [
    { key: 'displayName', label: 'Organization' },
    { key: 'prospectStage', label: 'Prospect Stage' },
    { key: 'researchStatus', label: 'Research Status' },
    { key: 'outreachStatus', label: 'Outreach Status' },
    { key: 'dataFreshnessStatus', label: 'Data Freshness' },
  ],
  table_collection_research: [
    { key: 'displayName', label: 'Organization' },
    { key: 'researchStatus', label: 'Research Status' },
    { key: 'dataFreshnessStatus', label: 'Data Freshness' },
  ],
  table_scoring: [
    { key: 'displayName', label: 'Organization' },
    { key: 'score', label: 'Score' },
    { key: 'tier', label: 'Tier' },
    { key: 'status', label: 'Status' },
  ],
  table_discovery: [
    { key: 'displayName', label: 'Organization' },
    { key: 'sessionStatus', label: 'Session Status' },
    { key: 'sessionDate', label: 'Session Date' },
  ],
  table_outreach: [
    { key: 'displayName', label: 'Organization' },
    { key: 'outreachStatus', label: 'Outreach Status' },
    { key: 'channelPermission', label: 'Channel Permission' },
    { key: 'currentStep', label: 'Current Step' },
  ],
  table_opportunities: [
    { key: 'displayName', label: 'Organization' },
    { key: 'opportunityStage', label: 'Opportunity Stage' },
    { key: 'prospectStage', label: 'Prospect Stage' },
    { key: 'valueBand', label: 'Value Band' },
  ],
};

const D1_METRICS = [
  { key: 'total_organizations', count: 3 },
  { key: 'new_organizations', count: 1 },
  { key: 'research_gaps_open', count: 2 },
  { key: 'outreach_active', count: 1 },
  { key: 'outreach_blocked_restriction', count: 1 },
  { key: 'stale_freshness', count: 2 },
] as const;

function matchesFilter(row: Record<string, unknown>, filters: DashboardFilters): boolean {
  const checks: [keyof DashboardFilters, string][] = [
    ['prospectStage', 'prospectStage'],
    ['researchStatus', 'researchStatus'],
    ['outreachStatus', 'outreachStatus'],
    ['dataFreshnessStatus', 'dataFreshnessStatus'],
    ['opportunityStage', 'opportunityStage'],
  ];

  for (const [filterKey, rowKey] of checks) {
    const expected = filters[filterKey];
    if (expected === undefined) continue;
    const values = Array.isArray(expected) ? expected : [expected];
    const actual = String(row[rowKey] ?? '');
    if (!values.includes(actual)) return false;
  }

  return true;
}

function metricCount(key: string, count: number, drilldownKey: string) {
  return {
    key,
    count,
    numerator: null,
    denominator: null,
    rate: null,
    rateSuppressed: false,
    suppressionReason: null,
    drilldownKey,
    emptyReason: count === 0 ? 'no_data_in_fixture' : null,
  };
}

function dashboardMetrics(dashboardKey: DashboardKey, filters: DashboardFilters) {
  const prospectRows = FIXTURE_ROWS.table_prospect_master.filter((row) =>
    matchesFilter(row, filters),
  );

  switch (dashboardKey) {
    case 'D1':
      return D1_METRICS.map((metric) => {
        if (metric.key === 'total_organizations') {
          return metricCount(metric.key, prospectRows.length, 'table_prospect_master');
        }
        if (metric.key === 'research_gaps_open') {
          const count = prospectRows.filter((row) => row.researchStatus === 'gaps_open').length;
          return metricCount(metric.key, count, 'table_collection_research');
        }
        if (metric.key === 'outreach_active') {
          const count = prospectRows.filter((row) => row.outreachStatus === 'active').length;
          return metricCount(metric.key, count, 'table_outreach');
        }
        if (metric.key === 'outreach_blocked_restriction') {
          const count = prospectRows.filter(
            (row) => row.outreachStatus === 'blocked_restriction',
          ).length;
          return metricCount(metric.key, count, 'table_outreach');
        }
        if (metric.key === 'stale_freshness') {
          const count = prospectRows.filter((row) =>
            ['stale', 'mixed'].includes(String(row.dataFreshnessStatus)),
          ).length;
          return metricCount(metric.key, count, 'table_collection_research');
        }
        return metricCount(metric.key, metric.count, 'table_prospect_master');
      });
    case 'D2':
      return [metricCount('prospect_count', prospectRows.length, 'table_prospect_master')];
    case 'D3':
      return [
        metricCount(
          'research_queue_count',
          FIXTURE_ROWS.table_collection_research.filter((row) => matchesFilter(row, filters))
            .length,
          'table_collection_research',
        ),
        metricCount('population_raw_candidates', 25, 'table_collection_research'),
        metricCount('claims_awaiting_review', 4, 'table_collection_research'),
        metricCount('collection_runs_active', 1, 'table_collection_research'),
      ];
    case 'D4':
      return [
        metricCount(
          'scored_organizations',
          FIXTURE_ROWS.table_scoring.filter((row) => matchesFilter(row, filters)).length,
          'table_scoring',
        ),
      ];
    case 'D5':
      return [
        metricCount(
          'discovery_sessions',
          FIXTURE_ROWS.table_discovery.filter((row) => matchesFilter(row, filters)).length,
          'table_discovery',
        ),
      ];
    case 'D6':
      return [
        metricCount(
          'outreach_recipients',
          FIXTURE_ROWS.table_outreach.filter((row) => matchesFilter(row, filters)).length,
          'table_outreach',
        ),
      ];
    case 'D7':
      return [
        metricCount(
          'open_opportunities',
          FIXTURE_ROWS.table_opportunities.filter((row) => matchesFilter(row, filters)).length,
          'table_opportunities',
        ),
      ];
    case 'D8':
      return [
        metricCount('performance_population', prospectRows.length, 'table_opportunities'),
        metricCount('outreach_blocked_rate_numerator', 1, 'table_outreach'),
      ];
  }
}

const savedViewsStore = new Map<string, SavedViewRecord>();

export class FixtureReportingProvider {
  async queryDashboard(command: {
    dashboardKey: DashboardKey;
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
  }): Promise<DashboardQueryResult> {
    void command.scope;
    return {
      dashboardKey: command.dashboardKey,
      asOf: new Date().toISOString(),
      timezone: 'America/New_York',
      metrics: dashboardMetrics(command.dashboardKey, command.filters),
      appliedFilters: command.filters,
    };
  }

  async queryTable(command: {
    viewKey: TableViewKey;
    filters: DashboardFilters;
    sort: TableSort | null;
    pagination: Pagination;
    scope: ReportingAuthorizationScope;
  }): Promise<TableQueryResult> {
    void command.scope;
    void command.sort;

    const filtered = FIXTURE_ROWS[command.viewKey].filter((row) =>
      matchesFilter(row, command.filters),
    );
    const rows = filtered.slice(
      command.pagination.offset,
      command.pagination.offset + command.pagination.limit,
    );

    return {
      viewKey: command.viewKey,
      columns: TABLE_COLUMNS[command.viewKey],
      rows,
      total: filtered.length,
      asOf: new Date().toISOString(),
      emptyReason: filtered.length === 0 ? `no_rows_match_${command.viewKey}` : null,
    };
  }

  async listSavedViews(
    ownerUserId: string,
    dashboardKey?: string,
  ): Promise<readonly SavedViewRecord[]> {
    return [...savedViewsStore.values()].filter(
      (view) =>
        view.ownerUserId === ownerUserId &&
        (dashboardKey === undefined || view.dashboardKey === dashboardKey),
    );
  }

  async restoreSavedView(
    id: string,
    scope: ReportingAuthorizationScope,
  ): Promise<SavedViewRecord | null> {
    const view = savedViewsStore.get(id) ?? null;
    if (view === null) return null;
    if (view.ownerUserId !== scope.userId && !scope.roles.includes('admin')) return null;
    return view;
  }

  seedSavedView(view: SavedViewRecord): void {
    savedViewsStore.set(view.id, view);
  }
}

export const fixtureReportingProvider = new FixtureReportingProvider();

// Demo saved view for UI restore control
fixtureReportingProvider.seedSavedView({
  id: 'sv-demo-gaps',
  ownerUserId: 'demo-user-001',
  dashboardKey: 'D2',
  viewKey: 'table_prospect_master',
  name: 'Open research gaps',
  filters: { researchStatus: 'gaps_open' },
  columns: ['displayName', 'researchStatus', 'outreachStatus'],
  sort: { field: 'displayName', direction: 'asc' },
  isDefault: false,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
});
