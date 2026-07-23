import type {
  DashboardFilters,
  DashboardKey,
  DashboardQueryResult,
  ExportDownloadMetadata,
  ExportJobRecord,
  MetricValue,
  Pagination,
  ReportingAuthorizationScope,
  SavedViewRecord,
  TableQueryResult,
  TableSort,
  TableViewKey,
} from './reporting.js';

export type MetricDefinition = {
  key: string;
  displayName: string;
  subject: string;
  numerator: string;
  denominator: string | null;
  timeBasis: string;
  excludedStates: readonly string[];
  drilldownKey: string;
};

export type DashboardMetricCatalog = {
  dashboardKey: DashboardKey;
  displayName: string;
  tableKey: TableViewKey | null;
  metrics: readonly MetricDefinition[];
};

export type MetricCatalogDocument = {
  version: string;
  timezone: string;
  tinyCohortThreshold: number;
  refreshScheduleMinutes: number;
  dashboards: Record<DashboardKey, DashboardMetricCatalog>;
};

export interface MetricCatalogRepository {
  load(): Promise<MetricCatalogDocument>;
}

export interface DashboardQueryRepository {
  queryDashboard(command: {
    dashboardKey: DashboardKey;
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
    tinyCohortThreshold: number;
  }): Promise<DashboardQueryResult>;

  queryTable(command: {
    viewKey: TableViewKey;
    filters: DashboardFilters;
    sort: TableSort | null;
    pagination: Pagination;
    scope: ReportingAuthorizationScope;
  }): Promise<TableQueryResult>;

  estimateTableRows(command: {
    viewKey: TableViewKey;
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
  }): Promise<number>;
}

export interface SavedViewRepository {
  create(command: {
    ownerUserId: string;
    dashboardKey: string;
    viewKey?: string | null;
    name: string;
    filters: DashboardFilters;
    columns: readonly string[];
    sort?: TableSort | null;
    isDefault?: boolean;
  }): Promise<SavedViewRecord>;

  update(command: {
    id: string;
    ownerUserId: string;
    name?: string;
    filters?: DashboardFilters;
    columns?: readonly string[];
    sort?: TableSort | null;
    isDefault?: boolean;
  }): Promise<SavedViewRecord>;

  delete(command: { id: string; ownerUserId: string }): Promise<void>;

  findById(id: string): Promise<SavedViewRecord | null>;

  listByOwner(ownerUserId: string, dashboardKey?: string): Promise<readonly SavedViewRecord[]>;
}

export interface ExportJobRepository {
  create(command: {
    requestedByUserId: string;
    dashboardKey: string;
    viewKey?: string | null;
    idempotencyKey: string;
    filters: DashboardFilters;
    columns: readonly string[];
    sort?: TableSort | null;
    classificationNotice: string;
    expiresAt: Date;
  }): Promise<ExportJobRecord>;

  findById(id: string): Promise<ExportJobRecord | null>;

  findByIdempotencyKey(idempotencyKey: string): Promise<ExportJobRecord | null>;

  updateStatus(command: {
    id: string;
    status: ExportJobRecord['status'];
    artifactRef?: string | null;
    rowCount?: number | null;
    redactionSummary?: Record<string, unknown>;
    errorMessage?: string | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
  }): Promise<ExportJobRecord>;

  expireDue(referenceTime: Date): Promise<readonly ExportJobRecord[]>;
}

export interface ExportArtifactPort {
  writeCsv(command: {
    jobId: string;
    headers: readonly string[];
    rows: readonly Record<string, unknown>[];
  }): Promise<{ artifactRef: string }>;

  readMetadata(artifactRef: string): Promise<{ exists: boolean }>;
}

export interface ReportingAuditPort {
  append(command: {
    actorUserId: string | null;
    action: string;
    subjectType: 'organization' | 'user' | 'system';
    subjectId: string;
    organizationId?: string | null;
    correlationId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface ReportingOutboxPort {
  insert(command: {
    aggregateType: 'organization' | 'user';
    aggregateId: string;
    eventType: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export type { DashboardQueryResult, ExportDownloadMetadata, MetricValue, SavedViewRecord };
