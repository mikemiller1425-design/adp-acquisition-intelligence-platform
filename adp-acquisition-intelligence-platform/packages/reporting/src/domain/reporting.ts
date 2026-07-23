export const DASHBOARD_KEYS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'] as const;
export type DashboardKey = (typeof DASHBOARD_KEYS)[number];

export const TABLE_VIEW_KEYS = [
  'table_prospect_master',
  'table_collection_research',
  'table_scoring',
  'table_discovery',
  'table_outreach',
  'table_opportunities',
] as const;
export type TableViewKey = (typeof TABLE_VIEW_KEYS)[number];

export type ReportingRole = 'admin' | 'sales' | 'reviewer' | 'viewer';

export type ReportingAuthorizationScope = {
  userId: string;
  roles: readonly ReportingRole[];
  territoryIds: readonly string[];
  viewAllTerritories: boolean;
};

export type DashboardFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  ownerUserId?: string;
  territoryId?: string;
  firmType?: string;
  motion?: string;
  prospectStage?: string | readonly string[];
  researchStatus?: string | readonly string[];
  outreachStatus?: string | readonly string[];
  dataFreshnessStatus?: string | readonly string[];
  opportunityStage?: string | readonly string[];
};

export type TableSort = {
  field: string;
  direction: 'asc' | 'desc';
};

export type Pagination = {
  limit: number;
  offset: number;
};

export type MetricValue = {
  key: string;
  count: number | null;
  numerator: number | null;
  denominator: number | null;
  rate: number | null;
  rateSuppressed: boolean;
  suppressionReason: string | null;
  drilldownKey: string;
  emptyReason: string | null;
};

export type DashboardQueryResult = {
  dashboardKey: DashboardKey;
  asOf: string;
  timezone: string;
  metrics: MetricValue[];
  appliedFilters: DashboardFilters;
};

export type TableColumn = {
  key: string;
  label: string;
};

export type TableQueryResult = {
  viewKey: TableViewKey;
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  total: number;
  asOf: string;
  emptyReason: string | null;
};

export type SavedViewRecord = {
  id: string;
  ownerUserId: string;
  dashboardKey: string;
  viewKey: string | null;
  name: string;
  filters: DashboardFilters;
  columns: readonly string[];
  sort: TableSort | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ExportJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'expired';

export type ExportJobRecord = {
  id: string;
  requestedByUserId: string;
  dashboardKey: string;
  viewKey: string | null;
  status: ExportJobStatus;
  idempotencyKey: string;
  filters: DashboardFilters;
  columns: readonly string[];
  sort: TableSort | null;
  classificationNotice: string;
  artifactRef: string | null;
  rowCount: number | null;
  redactionSummary: Record<string, unknown>;
  errorMessage: string | null;
  expiresAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ExportDownloadMetadata = {
  jobId: string;
  generatedAt: string;
  requestedByUserId: string;
  classificationNotice: string;
  filters: DashboardFilters;
  columns: readonly string[];
  rowCount: number | null;
  redactionSummary: Record<string, unknown>;
  artifactRef: string | null;
  expiresAt: string;
};

export type ChannelPermissionState =
  'allowed' | 'unknown' | 'restricted' | 'opted_out' | 'not_applicable';

export type RedactedField = {
  field: string;
  action: 'masked' | 'omitted';
  reason: string;
  permissionState: ChannelPermissionState;
};

export const DEFAULT_TINY_COHORT_THRESHOLD = 5;
export const DEFAULT_SYNC_EXPORT_ROW_THRESHOLD = 500;
export const DEFAULT_EXPORT_EXPIRY_DAYS = 7;
export const DEFAULT_CLASSIFICATION_NOTICE =
  'Internal use only. Channel fields may be redacted per consent policy.';

export function applyRateSuppression(
  numerator: number,
  denominator: number,
  threshold = DEFAULT_TINY_COHORT_THRESHOLD,
): { rate: number | null; suppressed: boolean; reason: string | null } {
  if (denominator === 0) {
    return { rate: null, suppressed: true, reason: 'denominator_zero' };
  }
  if (denominator < threshold) {
    return { rate: null, suppressed: true, reason: 'tiny_cohort' };
  }
  return { rate: numerator / denominator, suppressed: false, reason: null };
}

export function redactChannelValue(
  value: string | null | undefined,
  permissionState: ChannelPermissionState,
  field: string,
): { value: string | null; redaction: RedactedField | null } {
  if (value === null || value === undefined || value === '') {
    return { value: null, redaction: null };
  }

  if (permissionState === 'allowed' || permissionState === 'not_applicable') {
    return { value, redaction: null };
  }

  const reason =
    permissionState === 'restricted'
      ? 'channel_restricted'
      : permissionState === 'opted_out'
        ? 'channel_opted_out'
        : 'channel_permission_unknown';

  return {
    value: null,
    redaction: {
      field,
      action: 'omitted',
      reason,
      permissionState,
    },
  };
}

export function actorCanManageViews(
  scope: ReportingAuthorizationScope,
  ownerUserId: string,
): boolean {
  if (scope.userId === ownerUserId) return true;
  return scope.roles.includes('admin');
}

export function resolveTableViewKey(dashboardKey: DashboardKey): TableViewKey {
  switch (dashboardKey) {
    case 'D1':
    case 'D2':
      return 'table_prospect_master';
    case 'D3':
      return 'table_collection_research';
    case 'D4':
      return 'table_scoring';
    case 'D5':
      return 'table_discovery';
    case 'D6':
      return 'table_outreach';
    case 'D7':
    case 'D8':
      return 'table_opportunities';
  }
}
