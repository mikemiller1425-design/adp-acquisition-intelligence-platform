import type { DatabaseClient, RepositoryExecutor } from '@adp/database';
import {
  accountAssignments,
  auditEvents,
  createDatabaseClient,
  organizations,
  outboxEvents,
  territories,
  users,
} from '@adp/database';
import {
  acquireTestDatabaseLock,
  getTestDatabaseUrl,
  migrateTestDatabase,
  type TestDatabaseLock,
} from '@adp/database/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DashboardQueryService } from '../application/dashboard-query-service.js';
import { ExportService } from '../application/export-service.js';
import {
  FileMetricCatalogRepository,
  MetricCatalogService,
} from '../application/metric-catalog-service.js';
import { SavedViewService } from '../application/saved-view-service.js';
import type { ReportingAuthorizationScope } from '../domain/reporting.js';
import {
  InMemoryExportArtifactAdapter,
  PostgresDashboardQueryRepository,
  PostgresExportJobRepository,
  PostgresReportingAuditAdapter,
  PostgresReportingOutboxAdapter,
  PostgresSavedViewRepository,
} from '../infrastructure/postgres-reporting.js';

const testDatabaseUrl = getTestDatabaseUrl();

function scope(input: {
  userId: string;
  territoryIds: string[];
  viewAllTerritories?: boolean;
}): ReportingAuthorizationScope {
  return {
    userId: input.userId,
    roles: ['sales'],
    territoryIds: input.territoryIds,
    viewAllTerritories: input.viewAllTerritories ?? false,
  };
}

describe.sequential('Prompt 10 reporting workflow integration', () => {
  let lock: TestDatabaseLock;
  let client: DatabaseClient;
  let fixture: ReportingFixture;

  beforeAll(async () => {
    lock = await acquireTestDatabaseLock(testDatabaseUrl);
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    client = createDatabaseClient(testDatabaseUrl);
    fixture = await seedReportingFixture(client.db);
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await lock?.release();
  });

  it('denies cross-territory leakage for permission-scoped dashboard queries', async () => {
    const services = buildServices(client.db);
    const east = await services.dashboard.queryDashboard({
      dashboardKey: 'D1',
      filters: {},
      scope: scope({ userId: fixture.eastUserId, territoryIds: [fixture.eastTerritoryId] }),
    });
    const west = await services.dashboard.queryDashboard({
      dashboardKey: 'D1',
      filters: {},
      scope: scope({ userId: fixture.westUserId, territoryIds: [fixture.westTerritoryId] }),
    });

    const eastTotal = east.metrics.find((metric) => metric.key === 'total_organizations')?.count;
    const westTotal = west.metrics.find((metric) => metric.key === 'total_organizations')?.count;
    expect(eastTotal).toBe(1);
    expect(westTotal).toBe(1);
    expect(eastTotal).not.toBe(2);
  });

  it('reconciles D1 metrics to known fixture counts without fabricated zeros', async () => {
    const services = buildServices(client.db);
    const adminScope = scope({
      userId: fixture.adminUserId,
      territoryIds: [fixture.eastTerritoryId, fixture.westTerritoryId],
      viewAllTerritories: true,
    });
    const result = await services.dashboard.queryDashboard({
      dashboardKey: 'D1',
      filters: { researchStatus: 'gaps_open' },
      scope: adminScope,
    });

    const gaps = result.metrics.find((metric) => metric.key === 'research_gaps_open');
    expect(gaps?.count).toBe(1);
    expect(gaps?.emptyReason).toBeNull();
    expect(result.metrics.every((metric) => metric.count !== null || metric.rate !== null)).toBe(
      true,
    );
  });

  it('supports saved view CRUD and restore parity', async () => {
    const services = buildServices(client.db);
    const ownerScope = scope({
      userId: fixture.eastUserId,
      territoryIds: [fixture.eastTerritoryId],
    });
    const filters = { researchStatus: 'gaps_open' as const };

    const created = await services.savedViews.create({
      ownerUserId: fixture.eastUserId,
      dashboardKey: 'D1',
      name: 'East gaps',
      filters,
      columns: ['displayName', 'researchStatus'],
      sort: { field: 'displayName', direction: 'asc' },
      scope: ownerScope,
      correlationId: '11111111-1111-1111-1111-111111111101',
    });

    const restored = await services.savedViews.restore({
      id: created.id,
      scope: ownerScope,
    });
    expect(restored.filters).toEqual(filters);
    expect(restored.columns).toEqual(['displayName', 'researchStatus']);
    expect(restored.sort).toEqual({ field: 'displayName', direction: 'asc' });

    const replay = await services.dashboard.restoreSavedViewQuery({
      savedView: restored,
      scope: ownerScope,
      pagination: { limit: 25, offset: 0 },
    });
    expect(replay.restoredFilters).toEqual(filters);
    expect(replay.table.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('runs sync export lifecycle with channel redaction metadata', async () => {
    const services = buildServices(client.db);
    const ownerScope = scope({
      userId: fixture.eastUserId,
      territoryIds: [fixture.eastTerritoryId],
    });

    const requested = await services.exports.requestExport({
      requestedByUserId: fixture.eastUserId,
      dashboardKey: 'D2',
      filters: { researchStatus: 'gaps_open' },
      columns: ['displayName', 'researchStatus'],
      scope: ownerScope,
      idempotencyKey: 'export-sync-east-1',
      correlationId: '11111111-1111-1111-1111-111111111102',
    });

    expect(requested.synchronous).toBe(true);
    expect(requested.job.status).toBe('completed');
    expect(requested.job.rowCount).toBe(1);

    const metadata = await services.exports.getDownloadMetadata(requested.job.id);
    expect(metadata.classificationNotice.length).toBeGreaterThan(0);
    expect(metadata.filters).toEqual({ researchStatus: 'gaps_open' });
    expect(metadata.columns).toEqual(['displayName', 'researchStatus']);
  });

  it('creates async export jobs and expires them', async () => {
    const services = buildServices(client.db, 0);
    const ownerScope = scope({
      userId: fixture.adminUserId,
      territoryIds: [fixture.eastTerritoryId, fixture.westTerritoryId],
      viewAllTerritories: true,
    });

    const requested = await services.exports.requestExport({
      requestedByUserId: fixture.adminUserId,
      dashboardKey: 'D2',
      filters: {},
      columns: ['displayName'],
      scope: ownerScope,
      idempotencyKey: 'export-async-admin-1',
      correlationId: '11111111-1111-1111-1111-111111111103',
    });
    expect(requested.synchronous).toBe(false);
    expect(requested.job.status).toBe('pending');

    const completed = await services.exports.runExport({
      jobId: requested.job.id,
      scope: ownerScope,
      correlationId: '11111111-1111-1111-1111-111111111104',
    });
    expect(completed.status).toBe('completed');

    const expired = await services.exports.expireDueExports(
      new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
    );
    expect(expired.some((job) => job.id === requested.job.id)).toBe(true);
  });

  it('emits audit and outbox events for saved views and exports', async () => {
    const audits = await client.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'reporting.export_completed'));
    const outbox = await client.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.eventType, 'reporting.saved_view_created'));

    expect(audits.length).toBeGreaterThan(0);
    expect(outbox.length).toBeGreaterThan(0);
    expect(outbox.every((event) => event.aggregateType === 'user')).toBe(true);
  });
});

type ReportingFixture = {
  adminUserId: string;
  eastUserId: string;
  westUserId: string;
  eastTerritoryId: string;
  westTerritoryId: string;
  eastOrganizationId: string;
  westOrganizationId: string;
};

async function seedReportingFixture(db: RepositoryExecutor): Promise<ReportingFixture> {
  const admin = first(
    await db
      .insert(users)
      .values({
        externalSubjectId: 'auth0|reporting-admin',
        email: 'reporting-admin@example.com',
        displayName: 'Reporting Admin',
        status: 'active',
      })
      .returning({ id: users.id }),
  );
  const eastUser = first(
    await db
      .insert(users)
      .values({
        externalSubjectId: 'auth0|reporting-east',
        email: 'reporting-east@example.com',
        displayName: 'Reporting East',
        status: 'active',
      })
      .returning({ id: users.id }),
  );
  const westUser = first(
    await db
      .insert(users)
      .values({
        externalSubjectId: 'auth0|reporting-west',
        email: 'reporting-west@example.com',
        displayName: 'Reporting West',
        status: 'active',
      })
      .returning({ id: users.id }),
  );

  const eastTerritory = first(
    await db
      .insert(territories)
      .values({ code: 'reporting-east', name: 'Reporting East', status: 'active' })
      .returning({ id: territories.id }),
  );
  const westTerritory = first(
    await db
      .insert(territories)
      .values({ code: 'reporting-west', name: 'Reporting West', status: 'active' })
      .returning({ id: territories.id }),
  );

  const eastOrg = first(
    await db
      .insert(organizations)
      .values({
        displayName: 'East Reporting Advisors',
        normalizedName: 'east reporting advisors',
        normalizedDomain: 'east-reporting.example.com',
        researchStatus: 'gaps_open',
        outreachStatus: 'active',
        dataFreshnessStatus: 'stale',
      })
      .returning({ id: organizations.id }),
  );
  const westOrg = first(
    await db
      .insert(organizations)
      .values({
        displayName: 'West Reporting Advisors',
        normalizedName: 'west reporting advisors',
        normalizedDomain: 'west-reporting.example.com',
        researchStatus: 'sufficient_for_purpose',
        outreachStatus: 'ready',
      })
      .returning({ id: organizations.id }),
  );

  await db.insert(accountAssignments).values([
    {
      organizationId: eastOrg.id,
      userId: eastUser.id,
      territoryId: eastTerritory.id,
      assignmentRole: 'owner',
    },
    {
      organizationId: westOrg.id,
      userId: westUser.id,
      territoryId: westTerritory.id,
      assignmentRole: 'owner',
    },
  ]);

  return {
    adminUserId: admin.id,
    eastUserId: eastUser.id,
    westUserId: westUser.id,
    eastTerritoryId: eastTerritory.id,
    westTerritoryId: westTerritory.id,
    eastOrganizationId: eastOrg.id,
    westOrganizationId: westOrg.id,
  };
}

function buildServices(db: RepositoryExecutor, syncRowThreshold = 500) {
  const catalog = new MetricCatalogService(new FileMetricCatalogRepository());
  const queries = new PostgresDashboardQueryRepository(db);
  const audit = new PostgresReportingAuditAdapter(db);
  const outbox = new PostgresReportingOutboxAdapter(db);

  return {
    dashboard: new DashboardQueryService(catalog, queries, audit, outbox),
    savedViews: new SavedViewService(new PostgresSavedViewRepository(db), audit, outbox),
    exports: new ExportService(
      new PostgresExportJobRepository(db),
      queries,
      new InMemoryExportArtifactAdapter(),
      syncRowThreshold,
      7,
      audit,
      outbox,
    ),
  };
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected database row');
  return row;
}
