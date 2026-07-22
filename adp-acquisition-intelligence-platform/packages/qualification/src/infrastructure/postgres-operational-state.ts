import { operationalStateTransitions, organizations, type RepositoryExecutor } from '@adp/database';
import { and, eq, sql } from 'drizzle-orm';

import type { OperationalDimension } from '../domain/operational-state.js';
import type {
  OperationalStateTransition,
  OperationalStateTransitionRepository,
  OrganizationState,
  OrganizationStateWriter,
} from '../domain/ports.js';

type Db = RepositoryExecutor;

function one<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function mapOrganizationState(row: typeof organizations.$inferSelect): OrganizationState {
  return {
    id: row.id,
    prospectStage: row.prospectStage,
    researchStatus: row.researchStatus,
    outreachStatus: row.outreachStatus,
    dataFreshnessStatus: row.dataFreshnessStatus,
    recordStatus: row.recordStatus,
    recordVersion: row.recordVersion,
  };
}

function mapTransition(
  row: typeof operationalStateTransitions.$inferSelect,
): OperationalStateTransition {
  return {
    ...row,
    subjectType: 'organization',
    dimension: row.dimension as OperationalDimension,
    fromValue: row.fromValue as OperationalStateTransition['fromValue'],
    toValue: row.toValue as OperationalStateTransition['toValue'],
    validationResult:
      row.validationResult !== null &&
      typeof row.validationResult === 'object' &&
      !Array.isArray(row.validationResult)
        ? (row.validationResult as Record<string, unknown>)
        : {},
  };
}

export class PostgresOrganizationStateWriter implements OrganizationStateWriter {
  constructor(private readonly db: Db) {}

  async findOrganizationState(organizationId: string): Promise<OrganizationState | null> {
    const rows = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    const row = one(rows);
    return row === null ? null : mapOrganizationState(row);
  }

  async updateOrganizationStateIfVersion(input: {
    organizationId: string;
    dimension: OperationalDimension;
    toValue: Parameters<OrganizationStateWriter['updateOrganizationStateIfVersion']>[0]['toValue'];
    expectedRecordVersion: number;
  }): Promise<OrganizationState | null> {
    switch (input.dimension) {
      case 'prospect_stage':
        return this.updateProspectStage(input);
      case 'research_status':
        return this.updateResearchStatus(input);
      case 'outreach_status':
        return this.updateOutreachStatus(input);
      case 'data_freshness_status':
        return this.updateDataFreshnessStatus(input);
    }
  }

  private async updateProspectStage(
    input: Parameters<OrganizationStateWriter['updateOrganizationStateIfVersion']>[0],
  ): Promise<OrganizationState | null> {
    const rows = await this.db
      .update(organizations)
      .set({
        prospectStage: input.toValue as (typeof organizations.prospectStage.enumValues)[number],
        recordVersion: sql`${organizations.recordVersion} + 1`,
        updatedAt: sql`now()`,
      })
      .where(this.versionWhere(input.organizationId, input.expectedRecordVersion))
      .returning();
    const row = one(rows);
    return row === null ? null : mapOrganizationState(row);
  }

  private async updateResearchStatus(
    input: Parameters<OrganizationStateWriter['updateOrganizationStateIfVersion']>[0],
  ): Promise<OrganizationState | null> {
    const rows = await this.db
      .update(organizations)
      .set({
        researchStatus: input.toValue as (typeof organizations.researchStatus.enumValues)[number],
        recordVersion: sql`${organizations.recordVersion} + 1`,
        updatedAt: sql`now()`,
      })
      .where(this.versionWhere(input.organizationId, input.expectedRecordVersion))
      .returning();
    const row = one(rows);
    return row === null ? null : mapOrganizationState(row);
  }

  private async updateOutreachStatus(
    input: Parameters<OrganizationStateWriter['updateOrganizationStateIfVersion']>[0],
  ): Promise<OrganizationState | null> {
    const rows = await this.db
      .update(organizations)
      .set({
        outreachStatus: input.toValue as (typeof organizations.outreachStatus.enumValues)[number],
        recordVersion: sql`${organizations.recordVersion} + 1`,
        updatedAt: sql`now()`,
      })
      .where(this.versionWhere(input.organizationId, input.expectedRecordVersion))
      .returning();
    const row = one(rows);
    return row === null ? null : mapOrganizationState(row);
  }

  private async updateDataFreshnessStatus(
    input: Parameters<OrganizationStateWriter['updateOrganizationStateIfVersion']>[0],
  ): Promise<OrganizationState | null> {
    const rows = await this.db
      .update(organizations)
      .set({
        dataFreshnessStatus:
          input.toValue as (typeof organizations.dataFreshnessStatus.enumValues)[number],
        recordVersion: sql`${organizations.recordVersion} + 1`,
        updatedAt: sql`now()`,
      })
      .where(this.versionWhere(input.organizationId, input.expectedRecordVersion))
      .returning();
    const row = one(rows);
    return row === null ? null : mapOrganizationState(row);
  }

  private versionWhere(organizationId: string, expectedRecordVersion: number) {
    return and(
      eq(organizations.id, organizationId),
      eq(organizations.recordVersion, expectedRecordVersion),
      eq(organizations.recordStatus, 'active'),
    );
  }
}

export class PostgresOperationalStateTransitionRepository implements OperationalStateTransitionRepository {
  constructor(private readonly db: Db) {}

  async findByCorrelationId(input: {
    subjectType: 'organization';
    subjectId: string;
    dimension: OperationalDimension;
    commandCorrelationId: string;
  }): Promise<OperationalStateTransition | null> {
    const rows = await this.db
      .select()
      .from(operationalStateTransitions)
      .where(
        and(
          eq(operationalStateTransitions.subjectType, input.subjectType),
          eq(operationalStateTransitions.subjectId, input.subjectId),
          eq(operationalStateTransitions.dimension, input.dimension),
          eq(operationalStateTransitions.commandCorrelationId, input.commandCorrelationId),
        ),
      )
      .limit(1);
    const row = one(rows);
    return row === null ? null : mapTransition(row);
  }

  async insert(
    input: Omit<OperationalStateTransition, 'id' | 'createdAt'>,
  ): Promise<OperationalStateTransition> {
    const rows = await this.db.insert(operationalStateTransitions).values(input).returning();
    return mapTransition(rows[0] as typeof operationalStateTransitions.$inferSelect);
  }
}
