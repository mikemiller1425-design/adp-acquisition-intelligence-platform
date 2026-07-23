import {
  auditEvents,
  disqualificationReasons,
  outboxEvents,
  qualificationConditions,
  qualificationDecisions,
  qualificationRecommendationOverrides,
  qualificationReviews,
  qualificationReviewScores,
  tasks,
  type RepositoryExecutor,
} from '@adp/database';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type {
  DisqualificationReason,
  DisqualificationReasonRepository,
  QualificationAuditPort,
  QualificationCondition,
  QualificationConditionRepository,
  QualificationDecision,
  QualificationDecisionRepository,
  QualificationOutboxPort,
  QualificationReview,
  QualificationReviewRepository,
  QualificationScoreLink,
  QualificationTaskPort,
  RecommendationOverrideRepository,
} from '../domain/qualification-ports.js';
import type { QualificationOutcome } from '../domain/qualification.js';

type Db = RepositoryExecutor;

function one<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

export class PostgresQualificationReviewRepository implements QualificationReviewRepository {
  constructor(private readonly db: Db) {}

  async create(input: Parameters<QualificationReviewRepository['create']>[0]) {
    const row = first(
      await this.db
        .insert(qualificationReviews)
        .values({
          organizationId: input.organizationId,
          requestedByUserId: input.requestedByUserId,
          assignedToUserId: input.assignedToUserId ?? null,
          computedRecommendation: input.computedRecommendation ?? null,
          requiredGaps: [...(input.requiredGaps ?? [])],
          consentIndicators: input.consentIndicators ?? {},
          commandCorrelationId: input.commandCorrelationId ?? null,
        })
        .returning(),
    );
    return mapReview(row);
  }

  async findById(id: string): Promise<QualificationReview | null> {
    const row = one(
      await this.db
        .select()
        .from(qualificationReviews)
        .where(eq(qualificationReviews.id, id))
        .limit(1),
    );
    return row === null ? null : mapReview(row);
  }

  async start(input: Parameters<QualificationReviewRepository['start']>[0]) {
    const row = one(
      await this.db
        .update(qualificationReviews)
        .set({
          status: 'in_review',
          assignedToUserId: input.assignedToUserId,
          startedAt: sql`now()`,
          recordVersion: sql`${qualificationReviews.recordVersion} + 1`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(qualificationReviews.id, input.reviewId),
            eq(qualificationReviews.status, 'pending'),
            eq(qualificationReviews.recordVersion, input.expectedRecordVersion),
          ),
        )
        .returning(),
    );
    return row === null ? null : mapReview(row);
  }

  async markDecided(input: Parameters<QualificationReviewRepository['markDecided']>[0]) {
    const recommendationOverridden =
      input.reviewerRecommendation !== undefined && input.reviewerRecommendation !== null;
    const row = one(
      await this.db
        .update(qualificationReviews)
        .set({
          status: 'decided',
          decidedAt: sql`now()`,
          reviewerRecommendation: input.reviewerRecommendation ?? null,
          recommendationOverridden,
          overrideReasonCode: input.overrideReasonCode ?? null,
          overrideReasonNote: input.overrideReasonNote ?? null,
          reviewSummary: input.reviewSummary ?? {},
          recordVersion: sql`${qualificationReviews.recordVersion} + 1`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(qualificationReviews.id, input.reviewId),
            eq(qualificationReviews.status, 'in_review'),
            eq(qualificationReviews.recordVersion, input.expectedRecordVersion),
          ),
        )
        .returning(),
    );
    return row === null ? null : mapReview(row);
  }

  async listQueue(input: Parameters<QualificationReviewRepository['listQueue']>[0]) {
    const statuses = input.statuses ?? (['pending', 'in_review'] as const);
    const filters = [inArray(qualificationReviews.status, [...statuses])];
    if (input.assignedToUserId !== undefined) {
      filters.push(
        input.assignedToUserId === null
          ? isNull(qualificationReviews.assignedToUserId)
          : eq(qualificationReviews.assignedToUserId, input.assignedToUserId),
      );
    }
    const rows = await this.db
      .select()
      .from(qualificationReviews)
      .where(and(...filters))
      .orderBy(desc(qualificationReviews.createdAt))
      .limit(input.limit);
    return rows.map(mapReview);
  }

  async linkScores(input: Parameters<QualificationReviewRepository['linkScores']>[0]) {
    if (input.scores.length === 0) return [];
    const rows = await this.db
      .insert(qualificationReviewScores)
      .values(
        input.scores.map((score) => ({
          reviewId: input.reviewId,
          scoreResultId: score.scoreResultId,
          purpose: score.purpose ?? 'qualification',
          isPrimary: score.isPrimary ?? false,
          computedRecommendationSnapshot: score.computedRecommendationSnapshot ?? null,
        })),
      )
      .returning();
    return rows.map(mapScoreLink);
  }

  async listScores(reviewId: string): Promise<QualificationScoreLink[]> {
    const rows = await this.db
      .select()
      .from(qualificationReviewScores)
      .where(eq(qualificationReviewScores.reviewId, reviewId))
      .orderBy(desc(qualificationReviewScores.createdAt));
    return rows.map(mapScoreLink);
  }
}

export class PostgresQualificationDecisionRepository implements QualificationDecisionRepository {
  constructor(private readonly db: Db) {}

  async insert(input: Omit<QualificationDecision, 'id' | 'createdAt'>) {
    const row = first(await this.db.insert(qualificationDecisions).values(input).returning());
    return mapDecision(row);
  }

  async latestForReview(reviewId: string): Promise<QualificationDecision | null> {
    const row = one(
      await this.db
        .select()
        .from(qualificationDecisions)
        .where(eq(qualificationDecisions.reviewId, reviewId))
        .orderBy(desc(qualificationDecisions.createdAt))
        .limit(1),
    );
    return row === null ? null : mapDecision(row);
  }
}

export class PostgresQualificationConditionRepository implements QualificationConditionRepository {
  constructor(private readonly db: Db) {}

  async createMany(input: Parameters<QualificationConditionRepository['createMany']>[0]) {
    if (input.conditions.length === 0) return [];
    const rows = await this.db
      .insert(qualificationConditions)
      .values(
        input.conditions.map((condition) => ({
          reviewId: input.reviewId,
          organizationId: input.organizationId,
          type: condition.type,
          key: condition.key,
          title: condition.title,
          description: condition.description ?? null,
          ownerUserId: condition.ownerUserId,
          dueDate: condition.dueDate,
          taskId: condition.taskId ?? null,
          createdByUserId: input.createdByUserId,
          metadata: condition.metadata ?? {},
        })),
      )
      .returning();
    return rows.map(mapCondition);
  }

  async findById(conditionId: string): Promise<QualificationCondition | null> {
    const row = one(
      await this.db
        .select()
        .from(qualificationConditions)
        .where(eq(qualificationConditions.id, conditionId))
        .limit(1),
    );
    return row === null ? null : mapCondition(row);
  }

  async listForReview(reviewId: string): Promise<QualificationCondition[]> {
    const rows = await this.db
      .select()
      .from(qualificationConditions)
      .where(eq(qualificationConditions.reviewId, reviewId))
      .orderBy(desc(qualificationConditions.createdAt));
    return rows.map(mapCondition);
  }

  async listOpenBlockingForOrganization(organizationId: string): Promise<QualificationCondition[]> {
    const rows = await this.db
      .select()
      .from(qualificationConditions)
      .where(
        and(
          eq(qualificationConditions.organizationId, organizationId),
          eq(qualificationConditions.type, 'blocking'),
          eq(qualificationConditions.status, 'pending'),
        ),
      );
    return rows.map(mapCondition);
  }

  async resolve(input: Parameters<QualificationConditionRepository['resolve']>[0]) {
    const row = one(
      await this.db
        .update(qualificationConditions)
        .set({
          status: 'resolved',
          resolvedByUserId: input.actorUserId,
          resolvedAt: sql`now()`,
          resolutionNote: input.resolutionNote ?? null,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(qualificationConditions.id, input.conditionId),
            eq(qualificationConditions.status, 'pending'),
          ),
        )
        .returning(),
    );
    return row === null ? null : mapCondition(row);
  }

  async waive(input: Parameters<QualificationConditionRepository['waive']>[0]) {
    const row = one(
      await this.db
        .update(qualificationConditions)
        .set({
          status: 'waived',
          waivedByUserId: input.actorUserId,
          waivedAt: sql`now()`,
          waiverReasonCode: input.reasonCode,
          waiverReasonNote: input.reasonNote ?? null,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(qualificationConditions.id, input.conditionId),
            eq(qualificationConditions.status, 'pending'),
          ),
        )
        .returning(),
    );
    return row === null ? null : mapCondition(row);
  }
}

export class PostgresDisqualificationReasonRepository implements DisqualificationReasonRepository {
  constructor(private readonly db: Db) {}

  async findActiveByKey(key: string): Promise<DisqualificationReason | null> {
    const row = one(
      await this.db
        .select()
        .from(disqualificationReasons)
        .where(
          and(eq(disqualificationReasons.key, key), eq(disqualificationReasons.status, 'active')),
        )
        .orderBy(desc(disqualificationReasons.createdAt))
        .limit(1),
    );
    return row === null ? null : mapReason(row);
  }

  async listActive(): Promise<DisqualificationReason[]> {
    const rows = await this.db
      .select()
      .from(disqualificationReasons)
      .where(eq(disqualificationReasons.status, 'active'))
      .orderBy(disqualificationReasons.key);
    return rows.map(mapReason);
  }
}

export class PostgresRecommendationOverrideRepository implements RecommendationOverrideRepository {
  constructor(private readonly db: Db) {}

  async insert(input: Parameters<RecommendationOverrideRepository['insert']>[0]) {
    const row = first(
      await this.db
        .insert(qualificationRecommendationOverrides)
        .values({
          reviewId: input.reviewId,
          scoreResultId: input.scoreResultId ?? null,
          computedRecommendation: input.computedRecommendation,
          reviewerRecommendation: input.reviewerRecommendation,
          actorUserId: input.actorUserId,
          reasonCode: input.reasonCode,
          reasonNote: input.reasonNote ?? null,
        })
        .returning({ id: qualificationRecommendationOverrides.id }),
    );
    return { id: row.id };
  }
}

export class PostgresQualificationTaskPort implements QualificationTaskPort {
  constructor(private readonly db: Db) {}

  async createTask(input: Parameters<QualificationTaskPort['createTask']>[0]) {
    const row = first(
      await this.db
        .insert(tasks)
        .values({
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          organizationId: input.organizationId,
          title: input.title,
          description: input.description ?? null,
          dueAt: new Date(`${input.dueDate}T00:00:00.000Z`),
          assignedToUserId: input.assignedToUserId,
          createdByUserId: input.createdByUserId,
          metadata: input.metadata,
        })
        .returning({ id: tasks.id }),
    );
    return { id: row.id };
  }
}

export class PostgresQualificationAuditAdapter implements QualificationAuditPort {
  constructor(private readonly db: Db) {}

  async append(event: Parameters<QualificationAuditPort['append']>[0]): Promise<void> {
    await this.db.insert(auditEvents).values({
      actorType: event.actorUserId === null ? 'system' : 'user',
      actorUserId: event.actorUserId,
      action: event.action,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      organizationId: event.subjectId,
      commandCorrelationId: event.correlationId,
      metadata: event.metadata,
    });
  }
}

export class PostgresQualificationOutboxAdapter implements QualificationOutboxPort {
  constructor(private readonly db: Db) {}

  async insert(event: Parameters<QualificationOutboxPort['insert']>[0]): Promise<void> {
    await this.db.insert(outboxEvents).values({
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      idempotencyKey: event.idempotencyKey,
      payload: event.payload,
      metadata: event.metadata,
    });
  }
}

function mapReview(row: typeof qualificationReviews.$inferSelect): QualificationReview {
  return {
    ...row,
    computedRecommendation: objectOrNull(row.computedRecommendation),
    reviewerRecommendation: objectOrNull(row.reviewerRecommendation),
    requiredGaps: stringArray(row.requiredGaps),
    consentIndicators: objectOrEmpty(row.consentIndicators),
    reviewSummary: objectOrEmpty(row.reviewSummary),
  };
}

function mapScoreLink(row: typeof qualificationReviewScores.$inferSelect): QualificationScoreLink {
  return {
    ...row,
    computedRecommendationSnapshot: objectOrNull(row.computedRecommendationSnapshot),
  };
}

function mapCondition(row: typeof qualificationConditions.$inferSelect): QualificationCondition {
  return {
    ...row,
    metadata: objectOrEmpty(row.metadata),
  };
}

function mapDecision(row: typeof qualificationDecisions.$inferSelect): QualificationDecision {
  return {
    ...row,
    outcome: row.outcome as QualificationOutcome,
    decisionSnapshot: objectOrEmpty(row.decisionSnapshot),
  };
}

function mapReason(row: typeof disqualificationReasons.$inferSelect): DisqualificationReason {
  return {
    id: row.id,
    key: row.key,
    version: row.version,
    displayName: row.displayName,
    description: row.description,
    category: row.category,
    status: row.status,
    appliesToOutcomes: stringArray(row.appliesToOutcomes).filter(isQualificationOutcome),
  };
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return objectOrNull(value) ?? {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function isQualificationOutcome(value: string): value is QualificationOutcome {
  return [
    'qualified',
    'conditionally_qualified',
    'research_required',
    'nurture',
    'disqualified',
    'duplicate',
    'existing_relationship',
    'out_of_territory',
  ].includes(value);
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected at least one row');
  return row;
}
