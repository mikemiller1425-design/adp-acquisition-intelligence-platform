import {
  accountAssignments,
  auditEvents,
  campaignEnrollments,
  contactChannelPermissions,
  contacts,
  discoverySessions,
  exportJobs,
  opportunities,
  organizations,
  outreachActivities,
  outreachRecipients,
  outreachResponses,
  outboxEvents,
  rawCandidates,
  extractedClaims,
  collectionRuns,
  responseClassifications,
  savedViews,
  scoreResults,
  type RepositoryExecutor,
} from '@adp/database';
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, notInArray, sql } from 'drizzle-orm';

import {
  applyRateSuppression,
  type DashboardFilters,
  type DashboardKey,
  type ExportJobRecord,
  type MetricValue,
  type Pagination,
  type ReportingAuthorizationScope,
  type SavedViewRecord,
  type TableSort,
  type TableViewKey,
} from '../domain/reporting.js';
import type {
  DashboardQueryRepository,
  ExportArtifactPort,
  ExportJobRepository,
  ReportingAuditPort,
  ReportingOutboxPort,
  SavedViewRepository,
} from '../domain/ports.js';

type Db = RepositoryExecutor;

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected database row');
  return row;
}

function one<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function asStringArray(value: string | readonly string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return [value];
  return [...value];
}

function mapSavedView(row: typeof savedViews.$inferSelect): SavedViewRecord {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    dashboardKey: row.dashboardKey,
    viewKey: row.viewKey,
    name: row.name,
    filters: row.filters as DashboardFilters,
    columns: row.columns as string[],
    sort: (row.sort as TableSort | null) ?? null,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapExportJob(row: typeof exportJobs.$inferSelect): ExportJobRecord {
  return {
    id: row.id,
    requestedByUserId: row.requestedByUserId,
    dashboardKey: row.dashboardKey,
    viewKey: row.viewKey,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    filters: row.filters as DashboardFilters,
    columns: row.columns as string[],
    sort: (row.sort as TableSort | null) ?? null,
    classificationNotice: row.classificationNotice,
    artifactRef: row.artifactRef,
    rowCount: row.rowCount,
    redactionSummary: row.redactionSummary as Record<string, unknown>,
    errorMessage: row.errorMessage,
    expiresAt: row.expiresAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildOrganizationConditions(
  filters: DashboardFilters,
  scope: ReportingAuthorizationScope,
): ReturnType<typeof and>[] {
  const conditions: ReturnType<typeof and>[] = [eq(organizations.recordStatus, 'active')];

  if (!scope.viewAllTerritories) {
    conditions.push(
      sql`exists (
        select 1
        from ${accountAssignments} aa
        where aa.organization_id = ${organizations.id}
          and aa.effective_to is null
          and aa.territory_id in (${sql.join(
            scope.territoryIds.map((id) => sql`${id}`),
            sql`, `,
          )})
      )`,
    );
  }

  if (filters.ownerUserId) {
    conditions.push(
      sql`exists (
        select 1
        from ${accountAssignments} aa
        where aa.organization_id = ${organizations.id}
          and aa.effective_to is null
          and aa.user_id = ${filters.ownerUserId}
          and aa.assignment_role = 'owner'
      )`,
    );
  }

  if (filters.territoryId) {
    conditions.push(
      sql`exists (
        select 1
        from ${accountAssignments} aa
        where aa.organization_id = ${organizations.id}
          and aa.effective_to is null
          and aa.territory_id = ${filters.territoryId}
      )`,
    );
  }

  if (filters.firmType) {
    conditions.push(eq(organizations.firmType, filters.firmType));
  }

  const prospectStages = asStringArray(filters.prospectStage);
  if (prospectStages) {
    conditions.push(inArray(organizations.prospectStage, prospectStages as never));
  }

  const researchStatuses = asStringArray(filters.researchStatus);
  if (researchStatuses) {
    conditions.push(inArray(organizations.researchStatus, researchStatuses as never));
  }

  const outreachStatuses = asStringArray(filters.outreachStatus);
  if (outreachStatuses) {
    conditions.push(inArray(organizations.outreachStatus, outreachStatuses as never));
  }

  const freshnessStatuses = asStringArray(filters.dataFreshnessStatus);
  if (freshnessStatuses) {
    conditions.push(inArray(organizations.dataFreshnessStatus, freshnessStatuses as never));
  }

  if (filters.dateFrom) {
    conditions.push(gte(organizations.createdAt, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(organizations.createdAt, filters.dateTo));
  }

  return conditions;
}

function metricCount(
  key: string,
  value: number,
  drilldownKey: string,
  emptyReason: string | null = null,
): MetricValue {
  return {
    key,
    count: value,
    numerator: value,
    denominator: null,
    rate: null,
    rateSuppressed: false,
    suppressionReason: null,
    drilldownKey,
    emptyReason: value === 0 ? emptyReason : null,
  };
}

function metricRate(
  key: string,
  numerator: number,
  denominator: number,
  drilldownKey: string,
  threshold: number,
): MetricValue {
  const suppression = applyRateSuppression(numerator, denominator, threshold);
  return {
    key,
    count: null,
    numerator,
    denominator,
    rate: suppression.rate,
    rateSuppressed: suppression.suppressed,
    suppressionReason: suppression.reason,
    drilldownKey,
    emptyReason: denominator === 0 ? 'no_denominator_cohort' : null,
  };
}

export class PostgresDashboardQueryRepository implements DashboardQueryRepository {
  constructor(private readonly db: Db) {}

  async queryDashboard(command: {
    dashboardKey: DashboardKey;
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
    tinyCohortThreshold: number;
  }) {
    const asOf = new Date().toISOString();
    const metrics = await this.computeMetrics(command);

    return {
      dashboardKey: command.dashboardKey,
      asOf,
      timezone: 'America/New_York',
      metrics,
      appliedFilters: command.filters,
    };
  }

  async queryTable(command: {
    viewKey: TableViewKey;
    filters: DashboardFilters;
    sort: TableSort | null;
    pagination: Pagination;
    scope: ReportingAuthorizationScope;
  }) {
    switch (command.viewKey) {
      case 'table_prospect_master':
        return this.queryProspectMaster(command);
      case 'table_collection_research':
        return this.queryCollectionResearch(command);
      case 'table_scoring':
        return this.queryScoringTable(command);
      case 'table_discovery':
        return this.queryDiscoveryTable(command);
      case 'table_outreach':
        return this.queryOutreachTable(command);
      case 'table_opportunities':
        return this.queryOpportunitiesTable(command);
    }
  }

  async estimateTableRows(command: {
    viewKey: TableViewKey;
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
  }) {
    const result = await this.queryTable({
      ...command,
      sort: null,
      pagination: { limit: 1, offset: 0 },
    });
    return result.total;
  }

  private async computeMetrics(command: {
    dashboardKey: DashboardKey;
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
    tinyCohortThreshold: number;
  }): Promise<MetricValue[]> {
    switch (command.dashboardKey) {
      case 'D1':
        return this.metricsD1(command);
      case 'D2':
        return this.metricsD2(command);
      case 'D3':
        return this.metricsD3(command);
      case 'D4':
        return this.metricsD4(command);
      case 'D5':
        return this.metricsD5(command);
      case 'D6':
        return this.metricsD6(command);
      case 'D7':
        return this.metricsD7(command);
      case 'D8':
        return this.metricsD8(command);
    }
  }

  private orgWhere(filters: DashboardFilters, scope: ReportingAuthorizationScope) {
    const conditions = buildOrganizationConditions(filters, scope);
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private async countOrganizations(filters: DashboardFilters, scope: ReportingAuthorizationScope) {
    const row = first(
      await this.db
        .select({ value: count() })
        .from(organizations)
        .where(this.orgWhere(filters, scope)),
    );
    return row.value;
  }

  private async metricsD1(command: {
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
    tinyCohortThreshold: number;
  }) {
    const base = command.filters;
    const [total, gapsOpen, outreachActive, outreachBlocked, staleFreshness] = await Promise.all([
      this.countOrganizations(base, command.scope),
      this.countOrganizations({ ...base, researchStatus: 'gaps_open' }, command.scope),
      this.countOrganizations({ ...base, outreachStatus: 'active' }, command.scope),
      this.countOrganizations({ ...base, outreachStatus: 'blocked_restriction' }, command.scope),
      this.countOrganizations({ ...base, dataFreshnessStatus: ['stale', 'mixed'] }, command.scope),
    ]);

    const newFilters = { ...base };
    const newCount = await this.countOrganizations(newFilters, command.scope);

    return [
      metricCount(
        'total_organizations',
        total,
        'table_prospect_master',
        'no_organizations_in_scope',
      ),
      metricCount('new_organizations', newCount, 'table_prospect_master'),
      metricCount('research_gaps_open', gapsOpen, 'table_collection_research'),
      metricCount('outreach_active', outreachActive, 'table_outreach'),
      metricCount('outreach_blocked_restriction', outreachBlocked, 'table_outreach'),
      metricCount('stale_freshness', staleFreshness, 'table_collection_research'),
    ];
  }

  private async metricsD2(command: {
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
  }) {
    const total = await this.countOrganizations(command.filters, command.scope);
    return [metricCount('prospect_count', total, 'table_prospect_master')];
  }

  private async metricsD3(command: {
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
  }) {
    const total = await this.countOrganizations(
      { ...command.filters, researchStatus: ['gaps_open', 'blocked_conflict'] },
      command.scope,
    );
    const candidates = first(await this.db.select({ value: count() }).from(rawCandidates)).value;
    const awaiting = first(
      await this.db
        .select({ value: count() })
        .from(extractedClaims)
        .where(eq(extractedClaims.reviewStatus, 'proposed')),
    ).value;
    const activeRuns = first(
      await this.db
        .select({ value: count() })
        .from(collectionRuns)
        .where(inArray(collectionRuns.status, ['queued', 'running'])),
    ).value;
    return [
      metricCount('research_queue_count', total, 'table_collection_research'),
      metricCount('population_raw_candidates', candidates, 'table_collection_research'),
      metricCount('claims_awaiting_review', awaiting, 'table_collection_research'),
      metricCount('collection_runs_active', activeRuns, 'table_collection_research'),
    ];
  }

  private async metricsD4(command: {
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
    tinyCohortThreshold: number;
  }) {
    const orgWhere = this.orgWhere(command.filters, command.scope);
    const scored = first(
      await this.db
        .select({ value: count() })
        .from(scoreResults)
        .innerJoin(organizations, eq(scoreResults.organizationId, organizations.id))
        .where(orgWhere),
    ).value;
    const provisional = first(
      await this.db
        .select({ value: count() })
        .from(scoreResults)
        .innerJoin(organizations, eq(scoreResults.organizationId, organizations.id))
        .where(and(orgWhere, eq(scoreResults.status, 'provisional'))),
    ).value;

    return [
      metricCount('scored_organizations', scored, 'table_scoring'),
      metricRate(
        'provisional_score_rate',
        provisional,
        scored,
        'table_scoring',
        command.tinyCohortThreshold,
      ),
    ];
  }

  private async metricsD5(command: {
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
    tinyCohortThreshold: number;
  }) {
    const orgWhere = this.orgWhere(command.filters, command.scope);
    const weekStart = sql`date_trunc('week', now())`;
    const weekEnd = sql`date_trunc('week', now()) + interval '7 days'`;

    const scheduled = first(
      await this.db
        .select({ value: count() })
        .from(discoverySessions)
        .innerJoin(organizations, eq(discoverySessions.organizationId, organizations.id))
        .where(
          and(
            orgWhere,
            notInArray(discoverySessions.status, ['cancelled', 'draft']),
            sql`${discoverySessions.scheduledStartAt} >= ${weekStart}`,
            sql`${discoverySessions.scheduledStartAt} < ${weekEnd}`,
          ),
        ),
    ).value;

    const completed = first(
      await this.db
        .select({ value: count() })
        .from(discoverySessions)
        .innerJoin(organizations, eq(discoverySessions.organizationId, organizations.id))
        .where(and(orgWhere, eq(discoverySessions.status, 'completed'))),
    ).value;
    const denominator = first(
      await this.db
        .select({ value: count() })
        .from(discoverySessions)
        .innerJoin(organizations, eq(discoverySessions.organizationId, organizations.id))
        .where(
          and(
            orgWhere,
            inArray(discoverySessions.status, [
              'scheduled',
              'completed',
              'in_progress',
              'reviewed',
            ]),
          ),
        ),
    ).value;

    return [
      metricCount('scheduled_this_week', scheduled, 'table_discovery'),
      metricRate(
        'discovery_completion_rate',
        completed,
        denominator,
        'table_discovery',
        command.tinyCohortThreshold,
      ),
    ];
  }

  private async metricsD6(command: {
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
    tinyCohortThreshold: number;
  }) {
    const orgWhere = this.orgWhere(command.filters, command.scope);

    const eligible = first(
      await this.db
        .select({ value: count() })
        .from(outreachRecipients)
        .innerJoin(campaignEnrollments, eq(outreachRecipients.enrollmentId, campaignEnrollments.id))
        .innerJoin(organizations, eq(campaignEnrollments.organizationId, organizations.id))
        .innerJoin(contacts, eq(outreachRecipients.contactId, contacts.id))
        .innerJoin(
          contactChannelPermissions,
          and(
            eq(contactChannelPermissions.contactId, contacts.id),
            eq(contactChannelPermissions.channel, outreachRecipients.channel),
            isNull(contactChannelPermissions.revokedAt),
            isNull(contactChannelPermissions.supersededById),
          ),
        )
        .where(and(orgWhere, eq(contactChannelPermissions.state, 'allowed'))),
    ).value;

    const contacted = first(
      await this.db
        .select({ value: count() })
        .from(outreachActivities)
        .innerJoin(campaignEnrollments, eq(outreachActivities.enrollmentId, campaignEnrollments.id))
        .innerJoin(organizations, eq(campaignEnrollments.organizationId, organizations.id))
        .where(and(orgWhere, eq(outreachActivities.activityType, 'marked_sent'))),
    ).value;

    const responded = first(
      await this.db
        .select({ value: count() })
        .from(responseClassifications)
        .innerJoin(outreachResponses, eq(responseClassifications.responseId, outreachResponses.id))
        .innerJoin(outreachActivities, eq(outreachResponses.activityId, outreachActivities.id))
        .innerJoin(campaignEnrollments, eq(outreachActivities.enrollmentId, campaignEnrollments.id))
        .innerJoin(organizations, eq(campaignEnrollments.organizationId, organizations.id))
        .where(and(orgWhere, eq(outreachActivities.activityType, 'marked_sent'))),
    ).value;

    return [
      metricCount('eligible_recipients', eligible, 'table_outreach'),
      metricCount('contacted', contacted, 'table_outreach'),
      metricRate(
        'response_rate',
        responded,
        contacted,
        'table_outreach',
        command.tinyCohortThreshold,
      ),
    ];
  }

  private async metricsD7(command: {
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
  }) {
    const orgWhere = this.orgWhere(command.filters, command.scope);
    const openPipeline = first(
      await this.db
        .select({ value: count() })
        .from(opportunities)
        .innerJoin(organizations, eq(opportunities.organizationId, organizations.id))
        .where(
          and(
            orgWhere,
            notInArray(opportunities.opportunityStage, ['won', 'lost']),
            eq(opportunities.recordStatus, 'active'),
          ),
        ),
    ).value;
    const won = first(
      await this.db
        .select({ value: count() })
        .from(opportunities)
        .innerJoin(organizations, eq(opportunities.organizationId, organizations.id))
        .where(and(orgWhere, eq(opportunities.opportunityStage, 'won'))),
    ).value;

    return [
      metricCount('open_pipeline_count', openPipeline, 'table_opportunities'),
      metricCount('won_count', won, 'table_opportunities'),
    ];
  }

  private async metricsD8(command: {
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
    tinyCohortThreshold: number;
  }) {
    const orgWhere = this.orgWhere(command.filters, command.scope);
    const contacted = first(
      await this.db
        .select({ value: count() })
        .from(outreachActivities)
        .innerJoin(campaignEnrollments, eq(outreachActivities.enrollmentId, campaignEnrollments.id))
        .innerJoin(organizations, eq(campaignEnrollments.organizationId, organizations.id))
        .where(and(orgWhere, eq(outreachActivities.activityType, 'marked_sent'))),
    ).value;
    const eligible = first(
      await this.db
        .select({ value: count() })
        .from(organizations)
        .where(
          and(
            orgWhere,
            inArray(organizations.outreachStatus, [
              'ready',
              'active',
              'waiting_response',
              'completed',
            ]),
          ),
        ),
    ).value;
    const withOpportunity = first(
      await this.db
        .select({ value: count() })
        .from(opportunities)
        .innerJoin(organizations, eq(opportunities.organizationId, organizations.id))
        .where(and(orgWhere, eq(opportunities.recordStatus, 'active'))),
    ).value;
    const qualified = first(
      await this.db
        .select({ value: count() })
        .from(organizations)
        .where(
          and(
            orgWhere,
            inArray(organizations.prospectStage, ['qualified', 'outreach_active', 'opportunity']),
          ),
        ),
    ).value;
    const blocked = first(
      await this.db
        .select({ value: count() })
        .from(outreachActivities)
        .innerJoin(campaignEnrollments, eq(outreachActivities.enrollmentId, campaignEnrollments.id))
        .innerJoin(organizations, eq(campaignEnrollments.organizationId, organizations.id))
        .where(and(orgWhere, eq(outreachActivities.activityType, 'permission_blocked'))),
    ).value;
    const attempted = first(
      await this.db
        .select({ value: count() })
        .from(outreachActivities)
        .innerJoin(campaignEnrollments, eq(outreachActivities.enrollmentId, campaignEnrollments.id))
        .innerJoin(organizations, eq(campaignEnrollments.organizationId, organizations.id))
        .where(
          and(
            orgWhere,
            inArray(outreachActivities.activityType, ['marked_sent', 'permission_blocked']),
          ),
        ),
    ).value;

    return [
      metricRate(
        'contact_rate',
        contacted,
        eligible,
        'table_outreach',
        command.tinyCohortThreshold,
      ),
      metricRate(
        'opportunity_creation_rate',
        withOpportunity,
        qualified,
        'table_opportunities',
        command.tinyCohortThreshold,
      ),
      metricRate(
        'outreach_blocked_by_permission_rate',
        blocked,
        attempted,
        'table_outreach',
        command.tinyCohortThreshold,
      ),
    ];
  }

  private async queryProspectMaster(command: {
    filters: DashboardFilters;
    sort: TableSort | null;
    pagination: Pagination;
    scope: ReportingAuthorizationScope;
  }) {
    const whereClause = this.orgWhere(command.filters, command.scope);
    const total = first(
      await this.db.select({ value: count() }).from(organizations).where(whereClause),
    ).value;

    const order =
      command.sort?.field === 'display_name'
        ? command.sort.direction === 'asc'
          ? asc(organizations.displayName)
          : desc(organizations.displayName)
        : desc(organizations.updatedAt);

    const rows = await this.db
      .select({
        id: organizations.id,
        displayName: organizations.displayName,
        firmType: organizations.firmType,
        prospectStage: organizations.prospectStage,
        researchStatus: organizations.researchStatus,
        outreachStatus: organizations.outreachStatus,
        dataFreshnessStatus: organizations.dataFreshnessStatus,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
      })
      .from(organizations)
      .where(whereClause)
      .orderBy(order)
      .limit(command.pagination.limit)
      .offset(command.pagination.offset);

    return {
      viewKey: 'table_prospect_master' as const,
      columns: [
        { key: 'displayName', label: 'Organization' },
        { key: 'prospectStage', label: 'Prospect Stage' },
        { key: 'researchStatus', label: 'Research Status' },
        { key: 'outreachStatus', label: 'Outreach Status' },
        { key: 'dataFreshnessStatus', label: 'Data Freshness' },
      ],
      rows: rows as Record<string, unknown>[],
      total,
      asOf: new Date().toISOString(),
      emptyReason: total === 0 ? 'no_prospects_match_filters' : null,
    };
  }

  private async queryCollectionResearch(command: {
    filters: DashboardFilters;
    sort: TableSort | null;
    pagination: Pagination;
    scope: ReportingAuthorizationScope;
  }) {
    const whereClause = this.orgWhere(command.filters, command.scope);
    const total = first(
      await this.db.select({ value: count() }).from(organizations).where(whereClause),
    ).value;
    const rows = await this.db
      .select({
        id: organizations.id,
        displayName: organizations.displayName,
        researchStatus: organizations.researchStatus,
        dataFreshnessStatus: organizations.dataFreshnessStatus,
        updatedAt: organizations.updatedAt,
      })
      .from(organizations)
      .where(whereClause)
      .orderBy(desc(organizations.updatedAt))
      .limit(command.pagination.limit)
      .offset(command.pagination.offset);

    return {
      viewKey: 'table_collection_research' as const,
      columns: [
        { key: 'displayName', label: 'Organization' },
        { key: 'researchStatus', label: 'Research Status' },
        { key: 'dataFreshnessStatus', label: 'Data Freshness' },
      ],
      rows: rows as Record<string, unknown>[],
      total,
      asOf: new Date().toISOString(),
      emptyReason: total === 0 ? 'no_research_rows_match_filters' : null,
    };
  }

  private async queryScoringTable(command: {
    filters: DashboardFilters;
    sort: TableSort | null;
    pagination: Pagination;
    scope: ReportingAuthorizationScope;
  }) {
    const orgWhere = this.orgWhere(command.filters, command.scope);
    const total = first(
      await this.db
        .select({ value: count() })
        .from(scoreResults)
        .innerJoin(organizations, eq(scoreResults.organizationId, organizations.id))
        .where(orgWhere),
    ).value;

    const rows = await this.db
      .select({
        id: scoreResults.id,
        organizationId: organizations.id,
        displayName: organizations.displayName,
        score: scoreResults.score,
        tier: scoreResults.tier,
        status: scoreResults.status,
        calculatedAt: scoreResults.calculatedAt,
      })
      .from(scoreResults)
      .innerJoin(organizations, eq(scoreResults.organizationId, organizations.id))
      .where(orgWhere)
      .orderBy(desc(scoreResults.calculatedAt))
      .limit(command.pagination.limit)
      .offset(command.pagination.offset);

    return {
      viewKey: 'table_scoring' as const,
      columns: [
        { key: 'displayName', label: 'Organization' },
        { key: 'score', label: 'Score' },
        { key: 'tier', label: 'Tier' },
        { key: 'status', label: 'Status' },
      ],
      rows: rows as Record<string, unknown>[],
      total,
      asOf: new Date().toISOString(),
      emptyReason: total === 0 ? 'no_scores_match_filters' : null,
    };
  }

  private async queryDiscoveryTable(command: {
    filters: DashboardFilters;
    sort: TableSort | null;
    pagination: Pagination;
    scope: ReportingAuthorizationScope;
  }) {
    const orgWhere = this.orgWhere(command.filters, command.scope);
    const total = first(
      await this.db
        .select({ value: count() })
        .from(discoverySessions)
        .innerJoin(organizations, eq(discoverySessions.organizationId, organizations.id))
        .where(orgWhere),
    ).value;

    const rows = await this.db
      .select({
        id: discoverySessions.id,
        organizationId: organizations.id,
        displayName: organizations.displayName,
        status: discoverySessions.status,
        scheduledStartAt: discoverySessions.scheduledStartAt,
        completedAt: discoverySessions.completedAt,
      })
      .from(discoverySessions)
      .innerJoin(organizations, eq(discoverySessions.organizationId, organizations.id))
      .where(orgWhere)
      .orderBy(desc(discoverySessions.scheduledStartAt))
      .limit(command.pagination.limit)
      .offset(command.pagination.offset);

    return {
      viewKey: 'table_discovery' as const,
      columns: [
        { key: 'displayName', label: 'Prospect' },
        { key: 'status', label: 'Session Status' },
        { key: 'scheduledStartAt', label: 'Scheduled' },
      ],
      rows: rows as Record<string, unknown>[],
      total,
      asOf: new Date().toISOString(),
      emptyReason: total === 0 ? 'no_discovery_sessions_match_filters' : null,
    };
  }

  private async queryOutreachTable(command: {
    filters: DashboardFilters;
    sort: TableSort | null;
    pagination: Pagination;
    scope: ReportingAuthorizationScope;
  }) {
    const orgWhere = this.orgWhere(command.filters, command.scope);
    const total = first(
      await this.db
        .select({ value: count() })
        .from(campaignEnrollments)
        .innerJoin(organizations, eq(campaignEnrollments.organizationId, organizations.id))
        .where(orgWhere),
    ).value;

    const rows = await this.db
      .select({
        id: campaignEnrollments.id,
        organizationId: organizations.id,
        displayName: organizations.displayName,
        contactId: contacts.id,
        contactName: contacts.displayName,
        email: contacts.email,
        phone: contacts.phone,
        channel: outreachRecipients.channel,
        outreachStatus: organizations.outreachStatus,
        status: campaignEnrollments.status,
      })
      .from(campaignEnrollments)
      .innerJoin(organizations, eq(campaignEnrollments.organizationId, organizations.id))
      .innerJoin(contacts, eq(campaignEnrollments.contactId, contacts.id))
      .innerJoin(outreachRecipients, eq(outreachRecipients.enrollmentId, campaignEnrollments.id))
      .where(orgWhere)
      .orderBy(desc(campaignEnrollments.updatedAt))
      .limit(command.pagination.limit)
      .offset(command.pagination.offset);

    return {
      viewKey: 'table_outreach' as const,
      columns: [
        { key: 'displayName', label: 'Prospect' },
        { key: 'contactName', label: 'Contact' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'channel', label: 'Channel' },
        { key: 'outreachStatus', label: 'Outreach Status' },
      ],
      rows: rows as Record<string, unknown>[],
      total,
      asOf: new Date().toISOString(),
      emptyReason: total === 0 ? 'no_outreach_rows_match_filters' : null,
    };
  }

  private async queryOpportunitiesTable(command: {
    filters: DashboardFilters;
    scope: ReportingAuthorizationScope;
    sort: TableSort | null;
    pagination: Pagination;
  }) {
    const orgWhere = this.orgWhere(command.filters, command.scope);
    const opportunityStages = asStringArray(command.filters.opportunityStage);
    const opportunityConditions = [
      orgWhere,
      eq(opportunities.recordStatus, 'active'),
      ...(opportunityStages
        ? [inArray(opportunities.opportunityStage, opportunityStages as never)]
        : []),
      ...(command.filters.motion ? [eq(opportunities.primaryMotion, command.filters.motion)] : []),
    ].filter(Boolean);

    const whereClause = and(...opportunityConditions);
    const total = first(
      await this.db
        .select({ value: count() })
        .from(opportunities)
        .innerJoin(organizations, eq(opportunities.organizationId, organizations.id))
        .where(whereClause),
    ).value;

    const rows = await this.db
      .select({
        id: opportunities.id,
        organizationId: organizations.id,
        organizationName: organizations.displayName,
        name: opportunities.name,
        primaryMotion: opportunities.primaryMotion,
        opportunityStage: opportunities.opportunityStage,
        prospectStage: organizations.prospectStage,
        ownerUserId: opportunities.ownerUserId,
        updatedAt: opportunities.updatedAt,
      })
      .from(opportunities)
      .innerJoin(organizations, eq(opportunities.organizationId, organizations.id))
      .where(whereClause)
      .orderBy(desc(opportunities.updatedAt))
      .limit(command.pagination.limit)
      .offset(command.pagination.offset);

    return {
      viewKey: 'table_opportunities' as const,
      columns: [
        { key: 'organizationName', label: 'Organization' },
        { key: 'name', label: 'Opportunity' },
        { key: 'opportunityStage', label: 'Opportunity Stage' },
        { key: 'prospectStage', label: 'Prospect Stage' },
        { key: 'primaryMotion', label: 'Motion' },
      ],
      rows: rows as Record<string, unknown>[],
      total,
      asOf: new Date().toISOString(),
      emptyReason: total === 0 ? 'no_opportunities_match_filters' : null,
    };
  }
}

export class PostgresSavedViewRepository implements SavedViewRepository {
  constructor(private readonly db: Db) {}

  async create(command: {
    ownerUserId: string;
    dashboardKey: string;
    viewKey?: string | null;
    name: string;
    filters: DashboardFilters;
    columns: readonly string[];
    sort?: TableSort | null;
    isDefault?: boolean;
  }) {
    const row = first(
      await this.db
        .insert(savedViews)
        .values({
          ownerUserId: command.ownerUserId,
          dashboardKey: command.dashboardKey,
          viewKey: command.viewKey ?? null,
          name: command.name,
          filters: command.filters,
          columns: command.columns,
          sort: command.sort ?? null,
          isDefault: command.isDefault ?? false,
        })
        .returning(),
    );
    return mapSavedView(row);
  }

  async update(command: {
    id: string;
    ownerUserId: string;
    name?: string;
    filters?: DashboardFilters;
    columns?: readonly string[];
    sort?: TableSort | null;
    isDefault?: boolean;
  }) {
    const row = one(
      await this.db
        .update(savedViews)
        .set({
          ...(command.name !== undefined ? { name: command.name } : {}),
          ...(command.filters !== undefined ? { filters: command.filters } : {}),
          ...(command.columns !== undefined ? { columns: command.columns } : {}),
          ...(command.sort !== undefined ? { sort: command.sort } : {}),
          ...(command.isDefault !== undefined ? { isDefault: command.isDefault } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(savedViews.id, command.id), eq(savedViews.ownerUserId, command.ownerUserId)))
        .returning(),
    );
    if (row === null) throw new Error('Saved view not found');
    return mapSavedView(row);
  }

  async delete(command: { id: string; ownerUserId: string }) {
    await this.db
      .delete(savedViews)
      .where(and(eq(savedViews.id, command.id), eq(savedViews.ownerUserId, command.ownerUserId)));
  }

  async findById(id: string) {
    const row = one(await this.db.select().from(savedViews).where(eq(savedViews.id, id)).limit(1));
    return row === null ? null : mapSavedView(row);
  }

  async listByOwner(ownerUserId: string, dashboardKey?: string) {
    const rows = await this.db
      .select()
      .from(savedViews)
      .where(
        dashboardKey
          ? and(eq(savedViews.ownerUserId, ownerUserId), eq(savedViews.dashboardKey, dashboardKey))
          : eq(savedViews.ownerUserId, ownerUserId),
      )
      .orderBy(asc(savedViews.name));
    return rows.map(mapSavedView);
  }
}

export class PostgresExportJobRepository implements ExportJobRepository {
  constructor(private readonly db: Db) {}

  async create(command: {
    requestedByUserId: string;
    dashboardKey: string;
    viewKey?: string | null;
    idempotencyKey: string;
    filters: DashboardFilters;
    columns: readonly string[];
    sort?: TableSort | null;
    classificationNotice: string;
    expiresAt: Date;
  }) {
    const row = first(
      await this.db
        .insert(exportJobs)
        .values({
          requestedByUserId: command.requestedByUserId,
          dashboardKey: command.dashboardKey,
          viewKey: command.viewKey ?? null,
          idempotencyKey: command.idempotencyKey,
          filters: command.filters,
          columns: command.columns,
          sort: command.sort ?? null,
          classificationNotice: command.classificationNotice,
          expiresAt: command.expiresAt,
        })
        .returning(),
    );
    return mapExportJob(row);
  }

  async findById(id: string) {
    const row = one(await this.db.select().from(exportJobs).where(eq(exportJobs.id, id)).limit(1));
    return row === null ? null : mapExportJob(row);
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    const row = one(
      await this.db
        .select()
        .from(exportJobs)
        .where(eq(exportJobs.idempotencyKey, idempotencyKey))
        .limit(1),
    );
    return row === null ? null : mapExportJob(row);
  }

  async updateStatus(command: {
    id: string;
    status: ExportJobRecord['status'];
    artifactRef?: string | null;
    rowCount?: number | null;
    redactionSummary?: Record<string, unknown>;
    errorMessage?: string | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
  }) {
    const row = one(
      await this.db
        .update(exportJobs)
        .set({
          status: command.status,
          ...(command.artifactRef !== undefined ? { artifactRef: command.artifactRef } : {}),
          ...(command.rowCount !== undefined ? { rowCount: command.rowCount } : {}),
          ...(command.redactionSummary !== undefined
            ? { redactionSummary: command.redactionSummary }
            : {}),
          ...(command.errorMessage !== undefined ? { errorMessage: command.errorMessage } : {}),
          ...(command.startedAt !== undefined ? { startedAt: command.startedAt } : {}),
          ...(command.completedAt !== undefined ? { completedAt: command.completedAt } : {}),
          updatedAt: new Date(),
        })
        .where(eq(exportJobs.id, command.id))
        .returning(),
    );
    if (row === null) throw new Error('Export job not found');
    return mapExportJob(row);
  }

  async expireDue(referenceTime: Date) {
    const rows = await this.db
      .update(exportJobs)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(
        and(
          lte(exportJobs.expiresAt, referenceTime),
          inArray(exportJobs.status, ['pending', 'running', 'completed']),
        ),
      )
      .returning();
    return rows.map(mapExportJob);
  }
}

export class InMemoryExportArtifactAdapter implements ExportArtifactPort {
  private readonly store = new Map<string, string>();

  async writeCsv(command: {
    jobId: string;
    headers: readonly string[];
    rows: readonly Record<string, unknown>[];
  }) {
    const artifactRef = `private/exports/${command.jobId}.csv`;
    const lines = [
      command.headers.join(','),
      ...command.rows.map((row) =>
        command.headers.map((header) => JSON.stringify(row[header] ?? '')).join(','),
      ),
    ];
    this.store.set(artifactRef, lines.join('\n'));
    return { artifactRef };
  }

  async readMetadata(artifactRef: string) {
    return { exists: this.store.has(artifactRef) };
  }
}

export class PostgresReportingAuditAdapter implements ReportingAuditPort {
  constructor(private readonly db: Db) {}

  async append(event: Parameters<ReportingAuditPort['append']>[0]): Promise<void> {
    await this.db.insert(auditEvents).values({
      actorType: event.actorUserId === null ? 'system' : 'user',
      actorUserId: event.actorUserId,
      action: event.action,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      organizationId: event.organizationId ?? null,
      contactId: null,
      commandCorrelationId: event.correlationId ?? null,
      metadata: event.metadata ?? {},
    });
  }
}

export class PostgresReportingOutboxAdapter implements ReportingOutboxPort {
  constructor(private readonly db: Db) {}

  async insert(event: Parameters<ReportingOutboxPort['insert']>[0]): Promise<void> {
    await this.db.insert(outboxEvents).values({
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      idempotencyKey: event.idempotencyKey,
      payload: event.payload,
      metadata: event.metadata ?? {},
    });
  }
}
