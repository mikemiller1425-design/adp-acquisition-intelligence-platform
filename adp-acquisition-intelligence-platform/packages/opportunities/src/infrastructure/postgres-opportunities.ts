import {
  accountAssignments,
  auditEvents,
  contacts,
  operationalStateTransitions,
  opportunities,
  opportunityContacts,
  opportunityContextLinks,
  opportunityEligibilityAssessments,
  opportunityHistory,
  opportunityLossReasons,
  opportunityNextActions,
  opportunityOutcomes,
  opportunityProbabilities,
  opportunityRiskFlags,
  opportunityStageDefinitions,
  opportunityStageTransitions,
  opportunityValues,
  organizations,
  outboxEvents,
  type RepositoryExecutor,
} from '@adp/database';
import type { OperationalStateService } from '@adp/qualification';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type {
  ContactRoleRepository,
  ContextLinkRepository,
  EligibilityAssessmentRepository,
  HistoryRepository,
  LossReasonRepository,
  NextActionRepository,
  OperationalStateOpportunityPort,
  OpportunityAuditPort,
  OpportunityOutboxPort,
  OpportunityRepository,
  OrganizationContextPort,
  OutcomeRepository,
  PipelineFilter,
  PipelineQueryRepository,
  ProbabilityRepository,
  RiskFlagRepository,
  StageDefinitionRepository,
  StageTransitionRepository,
  ValueRepository,
} from '../domain/ports.js';
import type { OpportunityContactRole, OpportunityStage } from '../domain/opportunity.js';
import { isTerminalStage } from '../domain/opportunity.js';

type Db = RepositoryExecutor;

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected database row');
  return row;
}

function one<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function mapOpportunity(row: typeof opportunities.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    primaryMotion: row.primaryMotion,
    opportunityStage: row.opportunityStage,
    name: row.name,
    description: row.description,
    ownerUserId: row.ownerUserId,
    recordStatus: row.recordStatus,
    recordVersion: row.recordVersion,
    humanConfirmationAt: row.humanConfirmationAt,
    humanConfirmedByUserId: row.humanConfirmedByUserId,
  };
}

export class PostgresOrganizationContextAdapter implements OrganizationContextPort {
  constructor(private readonly db: Db) {}

  async findOrganizationContext(organizationId: string) {
    const org = one(
      await this.db
        .select({
          organizationId: organizations.id,
          prospectStage: organizations.prospectStage,
          recordStatus: organizations.recordStatus,
          existingRelationshipFlag: organizations.existingRelationshipFlag,
          recordVersion: organizations.recordVersion,
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1),
    );
    if (org === null) return null;

    const owner = one(
      await this.db
        .select({ userId: accountAssignments.userId })
        .from(accountAssignments)
        .where(
          and(
            eq(accountAssignments.organizationId, organizationId),
            eq(accountAssignments.assignmentRole, 'owner'),
            isNull(accountAssignments.effectiveTo),
          ),
        )
        .limit(1),
    );

    return { ...org, ownerUserId: owner?.userId ?? null };
  }
}

export class PostgresOpportunityRepository implements OpportunityRepository {
  constructor(private readonly db: Db) {}

  async findById(opportunityId: string) {
    const row = one(
      await this.db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, opportunityId))
        .limit(1),
    );
    return row === null ? null : mapOpportunity(row);
  }

  async findActiveByOrganizationAndMotion(organizationId: string, motion: string) {
    const row = one(
      await this.db
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.organizationId, organizationId),
            eq(opportunities.primaryMotion, motion),
            sql`${opportunities.opportunityStage} not in ('won', 'lost')`,
          ),
        )
        .limit(1),
    );
    return row === null ? null : mapOpportunity(row);
  }

  async insert(command: {
    organizationId: string;
    primaryMotion: string;
    name: string;
    description?: string | null;
    ownerUserId: string | null;
    humanConfirmedByUserId: string;
    createdByUserId: string;
  }) {
    const now = new Date();
    const row = first(
      await this.db
        .insert(opportunities)
        .values({
          organizationId: command.organizationId,
          primaryMotion: command.primaryMotion,
          name: command.name,
          description: command.description ?? null,
          ownerUserId: command.ownerUserId,
          humanConfirmationAt: now,
          humanConfirmedByUserId: command.humanConfirmedByUserId,
          createdByUserId: command.createdByUserId,
          updatedByUserId: command.createdByUserId,
        })
        .returning(),
    );
    return mapOpportunity(row);
  }

  async updateStageIfVersion(command: {
    opportunityId: string;
    toStage: OpportunityStage;
    expectedRecordVersion: number;
    updatedByUserId: string;
  }) {
    const row = one(
      await this.db
        .update(opportunities)
        .set({
          opportunityStage: command.toStage,
          recordVersion: sql`${opportunities.recordVersion} + 1`,
          updatedByUserId: command.updatedByUserId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(opportunities.id, command.opportunityId),
            eq(opportunities.recordVersion, command.expectedRecordVersion),
          ),
        )
        .returning(),
    );
    return row === null ? null : mapOpportunity(row);
  }
}

export class PostgresEligibilityAssessmentRepository implements EligibilityAssessmentRepository {
  constructor(private readonly db: Db) {}

  async saveAssessment(command: {
    organizationId: string;
    motion: string;
    eligible: boolean;
    reasons: readonly { code: string; message: string }[];
    assessedByUserId: string;
  }) {
    const row = first(
      await this.db
        .insert(opportunityEligibilityAssessments)
        .values({
          organizationId: command.organizationId,
          motion: command.motion,
          eligible: command.eligible,
          reasons: command.reasons,
          assessedByUserId: command.assessedByUserId,
        })
        .returning({ id: opportunityEligibilityAssessments.id }),
    );
    return row;
  }
}

export class PostgresStageDefinitionRepository implements StageDefinitionRepository {
  constructor(private readonly db: Db) {}

  async findActiveByStage(stageKey: OpportunityStage) {
    const row = one(
      await this.db
        .select()
        .from(opportunityStageDefinitions)
        .where(
          and(
            eq(opportunityStageDefinitions.stageKey, stageKey),
            eq(opportunityStageDefinitions.status, 'active'),
          ),
        )
        .orderBy(desc(opportunityStageDefinitions.publishedAt))
        .limit(1),
    );
    if (row === null) return null;
    return {
      stageKey: row.stageKey,
      version: row.version,
      displayName: row.displayName,
      defaultProbability: row.defaultProbability,
      maxAgeDays: row.maxAgeDays,
    };
  }

  async listActive() {
    const rows = await this.db
      .select()
      .from(opportunityStageDefinitions)
      .where(eq(opportunityStageDefinitions.status, 'active'))
      .orderBy(asc(opportunityStageDefinitions.stageKey));
    return rows.map((row) => ({
      stageKey: row.stageKey,
      version: row.version,
      displayName: row.displayName,
      defaultProbability: row.defaultProbability,
      maxAgeDays: row.maxAgeDays,
    }));
  }
}

export class PostgresStageTransitionRepository implements StageTransitionRepository {
  constructor(private readonly db: Db) {}

  async findByCorrelationId(command: { opportunityId: string; commandCorrelationId: string }) {
    const row = one(
      await this.db
        .select({
          id: opportunityStageTransitions.id,
          toStage: opportunityStageTransitions.toStage,
        })
        .from(opportunityStageTransitions)
        .where(
          and(
            eq(opportunityStageTransitions.opportunityId, command.opportunityId),
            eq(opportunityStageTransitions.commandCorrelationId, command.commandCorrelationId),
          ),
        )
        .limit(1),
    );
    return row;
  }

  async insert(command: {
    opportunityId: string;
    fromStage: OpportunityStage | null;
    toStage: OpportunityStage;
    actorUserId: string;
    reasonCode?: string | null;
    reasonNote?: string | null;
    commandCorrelationId?: string | null;
    validationResult: Record<string, unknown>;
    exceptionAuthorized?: boolean;
  }) {
    const row = first(
      await this.db
        .insert(opportunityStageTransitions)
        .values({
          opportunityId: command.opportunityId,
          fromStage: command.fromStage,
          toStage: command.toStage,
          actorUserId: command.actorUserId,
          actorType: 'user',
          reasonCode: command.reasonCode ?? null,
          reasonNote: command.reasonNote ?? null,
          commandCorrelationId: command.commandCorrelationId ?? null,
          validationResult: command.validationResult,
          exceptionAuthorized: command.exceptionAuthorized ?? false,
        })
        .returning({ id: opportunityStageTransitions.id }),
    );
    return row;
  }
}

export class PostgresOperationalStateOpportunityAdapter implements OperationalStateOpportunityPort {
  constructor(
    private readonly db: Db,
    private readonly operationalState: OperationalStateService,
  ) {}

  async transitionOpportunityStage(command: {
    opportunityId: string;
    fromValue: OpportunityStage;
    toValue: OpportunityStage;
    actorUserId: string;
    reasonCode?: string | null;
    reasonNote?: string | null;
    commandCorrelationId?: string | null;
    validationResult: Record<string, unknown>;
    exceptionAuthorized?: boolean;
  }) {
    const row = first(
      await this.db
        .insert(operationalStateTransitions)
        .values({
          subjectType: 'opportunity',
          subjectId: command.opportunityId,
          dimension: 'opportunity_stage',
          fromValue: command.fromValue,
          toValue: command.toValue,
          actorUserId: command.actorUserId,
          actorType: 'user',
          reasonCode: command.reasonCode ?? null,
          reasonNote: command.reasonNote ?? null,
          commandCorrelationId: command.commandCorrelationId ?? null,
          validationResult: command.validationResult,
          exceptionAuthorized: command.exceptionAuthorized ?? false,
        })
        .returning({ id: operationalStateTransitions.id }),
    );
    return row;
  }

  async transitionProspectToOpportunity(command: {
    organizationId: string;
    expectedRecordVersion: number;
    actorUserId: string;
    commandCorrelationId?: string | null;
  }) {
    await this.operationalState.transitionProspectStage({
      organizationId: command.organizationId,
      to: 'opportunity',
      expectedRecordVersion: command.expectedRecordVersion,
      actor: { type: 'user', userId: command.actorUserId },
      reasonCode: 'opportunity_created',
      commandCorrelationId: command.commandCorrelationId ?? null,
    });
  }
}

export class PostgresContactRoleRepository implements ContactRoleRepository {
  constructor(private readonly db: Db) {}

  async assignContact(command: {
    opportunityId: string;
    contactId: string;
    role: OpportunityContactRole;
    isPrimary: boolean;
    createdByUserId: string;
  }) {
    const row = first(
      await this.db
        .insert(opportunityContacts)
        .values({
          opportunityId: command.opportunityId,
          contactId: command.contactId,
          role: command.role,
          isPrimary: command.isPrimary,
          createdByUserId: command.createdByUserId,
        })
        .returning({ id: opportunityContacts.id }),
    );
    return row;
  }

  async listByOpportunity(opportunityId: string) {
    const rows = await this.db
      .select({
        id: opportunityContacts.id,
        contactId: opportunityContacts.contactId,
        role: opportunityContacts.role,
        isPrimary: opportunityContacts.isPrimary,
      })
      .from(opportunityContacts)
      .where(
        and(
          eq(opportunityContacts.opportunityId, opportunityId),
          isNull(opportunityContacts.effectiveTo),
        ),
      );
    return rows;
  }
}

export class PostgresValueRepository implements ValueRepository {
  constructor(private readonly db: Db) {}

  async closeCurrent(opportunityId: string) {
    await this.db
      .update(opportunityValues)
      .set({ effectiveTo: new Date() })
      .where(
        and(
          eq(opportunityValues.opportunityId, opportunityId),
          isNull(opportunityValues.effectiveTo),
        ),
      );
  }

  async insert(command: {
    opportunityId: string;
    amount: string | null;
    currency: string | null;
    valueBand?: string | null;
    source: string;
    setByUserId: string;
    reasonNote?: string | null;
  }) {
    const row = first(
      await this.db
        .insert(opportunityValues)
        .values({
          opportunityId: command.opportunityId,
          amount: command.amount,
          currency: command.currency,
          valueBand: command.valueBand ?? null,
          source: command.source,
          setByUserId: command.setByUserId,
          reasonNote: command.reasonNote ?? null,
        })
        .returning({ id: opportunityValues.id }),
    );
    return row;
  }

  async findCurrent(opportunityId: string) {
    const row = one(
      await this.db
        .select({
          amount: opportunityValues.amount,
          currency: opportunityValues.currency,
          valueBand: opportunityValues.valueBand,
        })
        .from(opportunityValues)
        .where(
          and(
            eq(opportunityValues.opportunityId, opportunityId),
            isNull(opportunityValues.effectiveTo),
          ),
        )
        .orderBy(desc(opportunityValues.effectiveFrom))
        .limit(1),
    );
    return row;
  }
}

export class PostgresProbabilityRepository implements ProbabilityRepository {
  constructor(private readonly db: Db) {}

  async closeCurrent(opportunityId: string) {
    await this.db
      .update(opportunityProbabilities)
      .set({ effectiveTo: new Date() })
      .where(
        and(
          eq(opportunityProbabilities.opportunityId, opportunityId),
          isNull(opportunityProbabilities.effectiveTo),
        ),
      );
  }

  async insert(command: {
    opportunityId: string;
    probability: string | null;
    source: 'manual' | 'stage_default';
    stageKey?: OpportunityStage | null;
    setByUserId: string;
    reasonNote?: string | null;
  }) {
    const row = first(
      await this.db
        .insert(opportunityProbabilities)
        .values({
          opportunityId: command.opportunityId,
          probability: command.probability,
          source: command.source,
          stageKey: command.stageKey ?? null,
          setByUserId: command.setByUserId,
          reasonNote: command.reasonNote ?? null,
        })
        .returning({ id: opportunityProbabilities.id }),
    );
    return row;
  }

  async findCurrent(opportunityId: string) {
    const row = one(
      await this.db
        .select({
          probability: opportunityProbabilities.probability,
          source: opportunityProbabilities.source,
        })
        .from(opportunityProbabilities)
        .where(
          and(
            eq(opportunityProbabilities.opportunityId, opportunityId),
            isNull(opportunityProbabilities.effectiveTo),
          ),
        )
        .orderBy(desc(opportunityProbabilities.effectiveFrom))
        .limit(1),
    );
    return row;
  }
}

export class PostgresNextActionRepository implements NextActionRepository {
  constructor(private readonly db: Db) {}

  async create(command: {
    opportunityId: string;
    title: string;
    description?: string | null;
    dueAt?: Date | null;
    assignedToUserId?: string | null;
    createdByUserId: string;
  }) {
    const row = first(
      await this.db
        .insert(opportunityNextActions)
        .values({
          opportunityId: command.opportunityId,
          title: command.title,
          description: command.description ?? null,
          dueAt: command.dueAt ?? null,
          assignedToUserId: command.assignedToUserId ?? null,
          createdByUserId: command.createdByUserId,
        })
        .returning({ id: opportunityNextActions.id }),
    );
    return row;
  }

  async complete(command: { actionId: string; completedByUserId: string }) {
    await this.db
      .update(opportunityNextActions)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(opportunityNextActions.id, command.actionId));
  }
}

export class PostgresRiskFlagRepository implements RiskFlagRepository {
  constructor(private readonly db: Db) {}

  async raise(command: {
    opportunityId: string;
    flagKey: string;
    severity: string;
    description: string;
    raisedByUserId: string;
  }) {
    const row = first(
      await this.db
        .insert(opportunityRiskFlags)
        .values({
          opportunityId: command.opportunityId,
          flagKey: command.flagKey,
          severity: command.severity,
          description: command.description,
          raisedByUserId: command.raisedByUserId,
        })
        .returning({ id: opportunityRiskFlags.id }),
    );
    return row;
  }

  async resolve(command: { flagId: string; resolvedByUserId: string }) {
    await this.db
      .update(opportunityRiskFlags)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedByUserId: command.resolvedByUserId,
        updatedAt: new Date(),
      })
      .where(eq(opportunityRiskFlags.id, command.flagId));
  }

  async countOpen(opportunityId: string) {
    const row = first(
      await this.db
        .select({ value: count() })
        .from(opportunityRiskFlags)
        .where(
          and(
            eq(opportunityRiskFlags.opportunityId, opportunityId),
            eq(opportunityRiskFlags.status, 'open'),
          ),
        ),
    );
    return row.value;
  }
}

export class PostgresLossReasonRepository implements LossReasonRepository {
  constructor(private readonly db: Db) {}

  async findActiveByKey(key: string) {
    const row = one(
      await this.db
        .select()
        .from(opportunityLossReasons)
        .where(
          and(eq(opportunityLossReasons.key, key), eq(opportunityLossReasons.status, 'active')),
        )
        .limit(1),
    );
    return row === null
      ? null
      : { id: row.id, key: row.key, displayName: row.displayName, status: row.status };
  }

  async findActiveById(id: string) {
    const row = one(
      await this.db
        .select()
        .from(opportunityLossReasons)
        .where(and(eq(opportunityLossReasons.id, id), eq(opportunityLossReasons.status, 'active')))
        .limit(1),
    );
    return row === null
      ? null
      : { id: row.id, key: row.key, displayName: row.displayName, status: row.status };
  }
}

export class PostgresOutcomeRepository implements OutcomeRepository {
  constructor(private readonly db: Db) {}

  async findCurrent(opportunityId: string) {
    const row = one(
      await this.db
        .select()
        .from(opportunityOutcomes)
        .where(
          and(
            eq(opportunityOutcomes.opportunityId, opportunityId),
            isNull(opportunityOutcomes.supersededAt),
          ),
        )
        .orderBy(desc(opportunityOutcomes.closedAt))
        .limit(1),
    );
    if (row === null) return null;
    return {
      id: row.id,
      opportunityId: row.opportunityId,
      outcomeType: row.outcomeType,
      lossReasonId: row.lossReasonId,
      priorStage: row.priorStage,
      closedAt: row.closedAt,
      supersededAt: row.supersededAt,
    };
  }

  async insert(command: {
    opportunityId: string;
    outcomeType: 'won' | 'lost' | 'nurture';
    lossReasonId?: string | null;
    priorStage: OpportunityStage;
    closedByUserId: string;
    notes?: string | null;
  }) {
    const row = first(
      await this.db
        .insert(opportunityOutcomes)
        .values({
          opportunityId: command.opportunityId,
          outcomeType: command.outcomeType,
          lossReasonId: command.lossReasonId ?? null,
          priorStage: command.priorStage,
          closedByUserId: command.closedByUserId,
          notes: command.notes ?? null,
        })
        .returning({ id: opportunityOutcomes.id }),
    );
    return row;
  }

  async supersede(command: { outcomeId: string; supersededByOutcomeId?: string | null }) {
    await this.db
      .update(opportunityOutcomes)
      .set({
        supersededAt: new Date(),
        supersededByOutcomeId: command.supersededByOutcomeId ?? null,
      })
      .where(eq(opportunityOutcomes.id, command.outcomeId));
  }
}

export class PostgresHistoryRepository implements HistoryRepository {
  constructor(private readonly db: Db) {}

  async append(command: {
    opportunityId: string;
    changeType: string;
    fieldName?: string | null;
    priorValue?: unknown;
    newValue?: unknown;
    actorUserId: string;
    commandCorrelationId?: string | null;
  }) {
    await this.db.insert(opportunityHistory).values({
      opportunityId: command.opportunityId,
      changeType: command.changeType,
      fieldName: command.fieldName ?? null,
      priorValue: command.priorValue ?? null,
      newValue: command.newValue ?? null,
      actorUserId: command.actorUserId,
      commandCorrelationId: command.commandCorrelationId ?? null,
    });
  }
}

export class PostgresContextLinkRepository implements ContextLinkRepository {
  constructor(private readonly db: Db) {}

  async link(command: {
    opportunityId: string;
    linkType: string;
    linkedSubjectType: 'organization' | 'opportunity' | 'contact' | 'user' | 'system';
    linkedSubjectId: string;
    metadata?: Record<string, unknown>;
  }) {
    const inserted = await this.db
      .insert(opportunityContextLinks)
      .values({
        opportunityId: command.opportunityId,
        linkType: command.linkType,
        linkedSubjectType: command.linkedSubjectType,
        linkedSubjectId: command.linkedSubjectId,
        metadata: command.metadata ?? {},
      })
      .onConflictDoNothing({
        target: [
          opportunityContextLinks.opportunityId,
          opportunityContextLinks.linkType,
          opportunityContextLinks.linkedSubjectId,
        ],
      })
      .returning({ id: opportunityContextLinks.id });

    if (inserted[0]) {
      return inserted[0];
    }

    const existing = one(
      await this.db
        .select({ id: opportunityContextLinks.id })
        .from(opportunityContextLinks)
        .where(
          and(
            eq(opportunityContextLinks.opportunityId, command.opportunityId),
            eq(opportunityContextLinks.linkType, command.linkType),
            eq(opportunityContextLinks.linkedSubjectId, command.linkedSubjectId),
          ),
        )
        .limit(1),
    );
    if (existing === null) {
      throw new Error('Failed to create or find opportunity context link');
    }
    return existing;
  }
}

export class PostgresPipelineQueryRepository implements PipelineQueryRepository {
  constructor(private readonly db: Db) {}

  async query(filter: PipelineFilter) {
    const conditions = [];
    if (filter.organizationId) {
      conditions.push(eq(opportunities.organizationId, filter.organizationId));
    }
    if (filter.ownerUserId) {
      conditions.push(eq(opportunities.ownerUserId, filter.ownerUserId));
    }
    if (filter.motion) {
      conditions.push(eq(opportunities.primaryMotion, filter.motion));
    }
    if (filter.stage) {
      const stages = Array.isArray(filter.stage) ? filter.stage : [filter.stage];
      conditions.push(inArray(opportunities.opportunityStage, stages));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRow = first(
      await this.db.select({ value: count() }).from(opportunities).where(whereClause),
    );

    const rows = await this.db
      .select({
        id: opportunities.id,
        organizationId: opportunities.organizationId,
        name: opportunities.name,
        primaryMotion: opportunities.primaryMotion,
        opportunityStage: opportunities.opportunityStage,
        ownerUserId: opportunities.ownerUserId,
        updatedAt: opportunities.updatedAt,
      })
      .from(opportunities)
      .where(whereClause)
      .orderBy(desc(opportunities.updatedAt))
      .limit(filter.limit)
      .offset(filter.offset);

    const enriched = await Promise.all(
      rows.map(async (row) => {
        const value = one(
          await this.db
            .select({
              amount: opportunityValues.amount,
              currency: opportunityValues.currency,
            })
            .from(opportunityValues)
            .where(
              and(
                eq(opportunityValues.opportunityId, row.id),
                isNull(opportunityValues.effectiveTo),
              ),
            )
            .orderBy(desc(opportunityValues.effectiveFrom))
            .limit(1),
        );
        const probability = one(
          await this.db
            .select({ probability: opportunityProbabilities.probability })
            .from(opportunityProbabilities)
            .where(
              and(
                eq(opportunityProbabilities.opportunityId, row.id),
                isNull(opportunityProbabilities.effectiveTo),
              ),
            )
            .orderBy(desc(opportunityProbabilities.effectiveFrom))
            .limit(1),
        );
        const openRiskFlagCount = first(
          await this.db
            .select({ value: count() })
            .from(opportunityRiskFlags)
            .where(
              and(
                eq(opportunityRiskFlags.opportunityId, row.id),
                eq(opportunityRiskFlags.status, 'open'),
              ),
            ),
        ).value;

        return {
          ...row,
          currentValueAmount: value?.amount ?? null,
          currentValueCurrency: value?.currency ?? null,
          currentProbability: probability?.probability ?? null,
          openRiskFlagCount,
        };
      }),
    );

    return { rows: enriched, total: totalRow.value };
  }
}

export class PostgresOpportunityAuditAdapter implements OpportunityAuditPort {
  constructor(private readonly db: Db) {}

  async append(command: {
    actorUserId: string;
    action: string;
    subjectType: 'organization' | 'opportunity';
    subjectId: string;
    organizationId?: string | null;
    correlationId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    await this.db.insert(auditEvents).values({
      actorType: 'user',
      actorUserId: command.actorUserId,
      action: command.action,
      subjectType: command.subjectType,
      subjectId: command.subjectId,
      organizationId: command.organizationId ?? null,
      commandCorrelationId: command.correlationId ?? null,
      metadata: command.metadata ?? {},
    });
  }
}

export class PostgresOpportunityOutboxAdapter implements OpportunityOutboxPort {
  constructor(private readonly db: Db) {}

  async insert(command: {
    aggregateType: 'organization' | 'opportunity';
    aggregateId: string;
    eventType: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) {
    await this.db
      .insert(outboxEvents)
      .values({
        aggregateType: command.aggregateType,
        aggregateId: command.aggregateId,
        eventType: command.eventType,
        idempotencyKey: command.idempotencyKey,
        payload: command.payload,
        metadata: command.metadata ?? {},
        status: 'pending',
      })
      .onConflictDoNothing({ target: outboxEvents.idempotencyKey });
  }
}

export async function assertContactBelongsToOrganization(
  db: Db,
  contactId: string,
  organizationId: string,
): Promise<boolean> {
  const row = one(
    await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, organizationId)))
      .limit(1),
  );
  return row !== null;
}

export { isTerminalStage };
