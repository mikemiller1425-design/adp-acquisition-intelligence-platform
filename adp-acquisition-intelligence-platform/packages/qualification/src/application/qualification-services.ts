import { AppError } from '@adp/platform';

import type { OperationalStateService } from './operational-state-service.js';
import { findReentryRoute, type ReentryReasonCode } from '../domain/reentry-policy.js';
import {
  actorHasRole,
  qualificationDecisionMatrix,
  ruleForOutcome,
  type QualificationActor,
  type QualificationConditionInput,
  type QualificationOutcome,
} from '../domain/qualification.js';
import type {
  DisqualificationReasonRepository,
  QualificationAuditPort,
  QualificationCondition,
  QualificationConditionRepository,
  QualificationDecision,
  QualificationDecisionRepository,
  QualificationGuardPort,
  QualificationOutboxPort,
  QualificationReview,
  QualificationReviewRepository,
  QualificationTaskPort,
  RecommendationOverrideRepository,
  TransitionPreview,
} from '../domain/qualification-ports.js';
import type { ProspectStage } from '../domain/operational-state.js';

export type DecideQualificationCommand = {
  reviewId: string;
  outcome: QualificationOutcome;
  expectedReviewVersion: number;
  expectedOrganizationRecordVersion: number;
  actor: QualificationActor;
  reasonCode: string;
  reasonNote?: string | null;
  commandCorrelationId?: string | null;
  disqualificationReasonKey?: string | null;
  conditions?: readonly QualificationConditionInput[];
  requiredGaps?: readonly string[];
  reviewerRecommendation?: Record<string, unknown> | null;
  overrideReasonCode?: string | null;
  overrideReasonNote?: string | null;
  reviewSummary?: Record<string, unknown>;
};

export class QualificationReviewService {
  constructor(
    private readonly reviews: QualificationReviewRepository,
    private readonly decisions: QualificationDecisionRepository,
    private readonly reasons: DisqualificationReasonRepository,
    private readonly conditions: QualificationConditionRepository,
    private readonly overrides: RecommendationOverrideRepository,
    private readonly transitions: QualificationTransitionCoordinator,
    private readonly tasks?: QualificationTaskPort,
    private readonly guards?: QualificationGuardPort,
    private readonly audit?: QualificationAuditPort,
    private readonly outbox?: QualificationOutboxPort,
  ) {}

  async request(command: {
    organizationId: string;
    actor: QualificationActor;
    assignedToUserId?: string | null;
    scoreResultIds?: readonly string[];
    computedRecommendation?: Record<string, unknown> | null;
    requiredGaps?: readonly string[];
    consentIndicators?: Record<string, unknown>;
    commandCorrelationId?: string | null;
  }): Promise<QualificationReview> {
    assertRole(command.actor, ['researcher', 'sales', 'reviewer', 'admin'], 'request review');
    await this.guards?.assertCanAccessOrganization({
      organizationId: command.organizationId,
      actor: command.actor,
    });

    const review = await this.reviews.create({
      organizationId: command.organizationId,
      requestedByUserId: command.actor.userId,
      assignedToUserId: command.assignedToUserId ?? null,
      computedRecommendation: command.computedRecommendation ?? null,
      requiredGaps: command.requiredGaps ?? [],
      consentIndicators: command.consentIndicators ?? {},
      commandCorrelationId: command.commandCorrelationId ?? null,
    });
    if (command.scoreResultIds !== undefined && command.scoreResultIds.length > 0) {
      await this.reviews.linkScores({
        reviewId: review.id,
        scores: command.scoreResultIds.map((scoreResultId, index) => ({
          scoreResultId,
          isPrimary: index === 0,
          computedRecommendationSnapshot: command.computedRecommendation ?? null,
        })),
      });
    }
    await this.publish({
      action: 'qualification.review_requested',
      organizationId: review.organizationId,
      actorUserId: command.actor.userId,
      correlationId: command.commandCorrelationId ?? null,
      payload: { reviewId: review.id },
    });
    return review;
  }

  async start(command: {
    reviewId: string;
    actor: QualificationActor;
    expectedRecordVersion: number;
  }): Promise<QualificationReview> {
    assertRole(command.actor, ['reviewer', 'admin'], 'start review');
    const review = await this.reviews.findById(command.reviewId);
    if (review === null) throw notFound('Qualification review not found', command.reviewId);
    await this.guards?.assertCanAccessOrganization({
      organizationId: review.organizationId,
      actor: command.actor,
    });
    const started = await this.reviews.start({
      reviewId: command.reviewId,
      assignedToUserId: command.actor.userId,
      expectedRecordVersion: command.expectedRecordVersion,
    });
    if (started === null) throw conflict('Qualification review version conflict', command.reviewId);
    await this.publish({
      action: 'qualification.review_started',
      organizationId: started.organizationId,
      actorUserId: command.actor.userId,
      correlationId: started.commandCorrelationId,
      payload: { reviewId: started.id },
    });
    return started;
  }

  async decide(command: DecideQualificationCommand): Promise<{
    review: QualificationReview;
    decision: QualificationDecision;
    conditions: QualificationCondition[];
  }> {
    const review = await this.reviews.findById(command.reviewId);
    if (review === null) throw notFound('Qualification review not found', command.reviewId);
    if (review.status !== 'in_review') {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Only in-review qualification reviews can be decided',
        details: { reviewId: review.id, status: review.status },
      });
    }
    const rule = ruleForOutcome(command.outcome);
    assertRole(command.actor, rule.allowedRoles, `decide ${command.outcome}`);
    await this.guards?.assertCanAccessOrganization({
      organizationId: review.organizationId,
      actor: command.actor,
    });
    if (rule.requiresAssignmentValidation) {
      await this.guards?.assertAssignmentAllowsQualification({
        organizationId: review.organizationId,
        actor: command.actor,
      });
    }
    if (rule.requiresTerritoryValidation) {
      await this.guards?.assertTerritoryAllowsQualification({
        organizationId: review.organizationId,
        actor: command.actor,
      });
    }
    const disqualificationReason = await this.resolveDisqualificationReason(command);
    const conditionInputs = this.conditionsForDecision(command, rule.createsBlockingTasks);
    const createdConditions = await this.createConditionsWithTasks({
      review,
      actor: command.actor,
      outcome: command.outcome,
      conditions: conditionInputs,
    });
    const latestDecision = await this.decisions.latestForReview(review.id);

    if (command.reviewerRecommendation !== undefined && command.reviewerRecommendation !== null) {
      if (!command.overrideReasonCode || command.overrideReasonCode.trim() === '') {
        throw new AppError({
          code: 'VALIDATION_FAILED',
          message: 'Recommendation override reason code is required',
        });
      }
      await this.overrides.insert({
        reviewId: review.id,
        computedRecommendation: review.computedRecommendation ?? {},
        reviewerRecommendation: command.reviewerRecommendation,
        actorUserId: command.actor.userId,
        reasonCode: command.overrideReasonCode,
        reasonNote: command.overrideReasonNote ?? null,
      });
      await this.publish({
        action: 'qualification.recommendation_overridden',
        organizationId: review.organizationId,
        actorUserId: command.actor.userId,
        correlationId: command.commandCorrelationId ?? null,
        payload: { reviewId: review.id },
      });
    }

    const decision = await this.decisions.insert({
      reviewId: review.id,
      organizationId: review.organizationId,
      outcome: command.outcome,
      disqualificationReasonId: disqualificationReason?.id ?? null,
      supersedesDecisionId: latestDecision?.id ?? null,
      actorUserId: command.actor.userId,
      reasonCode: nonBlank(command.reasonCode, 'Decision reason code is required'),
      reasonNote: command.reasonNote ?? null,
      decisionSnapshot: {
        rule,
        computedRecommendation: review.computedRecommendation,
        reviewerRecommendation: command.reviewerRecommendation ?? null,
        conditionIds: createdConditions.map((condition) => condition.id),
        requiredGaps: command.requiredGaps ?? review.requiredGaps,
        disqualificationReasonKey: disqualificationReason?.key ?? null,
      },
      commandCorrelationId: command.commandCorrelationId ?? null,
    });
    const decidedReview = await this.reviews.markDecided({
      reviewId: review.id,
      expectedRecordVersion: command.expectedReviewVersion,
      reviewerRecommendation: command.reviewerRecommendation ?? null,
      overrideReasonCode: command.overrideReasonCode ?? null,
      overrideReasonNote: command.overrideReasonNote ?? null,
      reviewSummary: command.reviewSummary ?? {},
    });
    if (decidedReview === null) throw conflict('Qualification review version conflict', review.id);

    await this.transitions.applyDecision({
      organizationId: review.organizationId,
      outcome: command.outcome,
      expectedOrganizationRecordVersion: command.expectedOrganizationRecordVersion,
      actor: { type: 'user', userId: command.actor.userId },
      reasonCode: command.reasonCode,
      reasonNote: command.reasonNote ?? null,
      commandCorrelationId: command.commandCorrelationId ?? null,
      relatedReviewId: review.id,
    });
    await this.publish({
      action: 'qualification.decision_recorded',
      organizationId: review.organizationId,
      actorUserId: command.actor.userId,
      correlationId: command.commandCorrelationId ?? null,
      payload: { reviewId: review.id, decisionId: decision.id, outcome: command.outcome },
    });
    return { review: decidedReview, decision, conditions: createdConditions };
  }

  private async resolveDisqualificationReason(command: DecideQualificationCommand) {
    const rule = ruleForOutcome(command.outcome);
    if (!rule.requiresDisqualificationReason) return null;
    if (
      command.disqualificationReasonKey === undefined ||
      command.disqualificationReasonKey === null
    ) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Disqualification reason key is required',
      });
    }
    const reason = await this.reasons.findActiveByKey(command.disqualificationReasonKey);
    if (reason === null)
      throw notFound('Disqualification reason not found', command.disqualificationReasonKey);
    return reason;
  }

  private conditionsForDecision(
    command: DecideQualificationCommand,
    createsBlockingTasks: boolean,
  ): readonly QualificationConditionInput[] {
    if (command.outcome === 'conditionally_qualified') {
      if (command.conditions === undefined || command.conditions.length === 0) {
        throw new AppError({
          code: 'VALIDATION_FAILED',
          message: 'Conditional qualification requires at least one blocking condition',
        });
      }
      return command.conditions;
    }
    if (command.outcome === 'research_required') {
      const gaps = command.requiredGaps ?? [];
      if (gaps.length === 0) {
        throw new AppError({
          code: 'VALIDATION_FAILED',
          message: 'Research-required decision needs at least one required gap',
        });
      }
      if (command.conditions !== undefined && command.conditions.length > 0)
        return command.conditions;
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Research-required decision needs gap tasks with owner and due date',
      });
    }
    if (createsBlockingTasks && command.conditions !== undefined) return command.conditions;
    return [];
  }

  private async createConditionsWithTasks(input: {
    review: QualificationReview;
    actor: QualificationActor;
    outcome: QualificationOutcome;
    conditions: readonly QualificationConditionInput[];
  }): Promise<QualificationCondition[]> {
    const conditionsWithTasks = [];
    for (const condition of input.conditions) {
      const task =
        condition.type === 'blocking'
          ? await this.tasks?.createTask({
              subjectType: 'organization',
              subjectId: input.review.organizationId,
              organizationId: input.review.organizationId,
              title: condition.title,
              description: condition.description ?? null,
              dueDate: condition.dueDate,
              assignedToUserId: condition.ownerUserId,
              createdByUserId: input.actor.userId,
              metadata: {
                source: 'qualification',
                reviewId: input.review.id,
                outcome: input.outcome,
                conditionKey: condition.key,
              },
            })
          : undefined;
      conditionsWithTasks.push({ ...condition, taskId: task?.id ?? null });
    }
    if (conditionsWithTasks.length === 0) return [];
    const created = await this.conditions.createMany({
      reviewId: input.review.id,
      organizationId: input.review.organizationId,
      createdByUserId: input.actor.userId,
      conditions: conditionsWithTasks,
    });
    await this.publish({
      action: 'qualification.condition_created',
      organizationId: input.review.organizationId,
      actorUserId: input.actor.userId,
      correlationId: input.review.commandCorrelationId,
      payload: {
        reviewId: input.review.id,
        conditionIds: created.map((condition) => condition.id),
      },
    });
    return created;
  }

  private async publish(input: {
    action: Parameters<QualificationAuditPort['append']>[0]['action'];
    organizationId: string;
    actorUserId: string | null;
    correlationId: string | null;
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.audit?.append({
      actorUserId: input.actorUserId,
      action: input.action,
      subjectType: 'organization',
      subjectId: input.organizationId,
      correlationId: input.correlationId,
      metadata: input.payload,
    });
    await this.outbox?.insert({
      aggregateType: 'organization',
      aggregateId: input.organizationId,
      eventType: input.action,
      idempotencyKey:
        input.correlationId === null
          ? `${input.action}:${input.organizationId}:${Date.now()}`
          : `${input.action}:${input.correlationId}`,
      payload: input.payload,
      metadata: {},
    });
  }
}

export class QualificationConditionService {
  constructor(
    private readonly conditions: QualificationConditionRepository,
    private readonly audit?: QualificationAuditPort,
    private readonly outbox?: QualificationOutboxPort,
  ) {}

  async resolve(command: {
    conditionId: string;
    actor: QualificationActor;
    resolutionNote?: string | null;
  }): Promise<QualificationCondition> {
    assertRole(command.actor, ['researcher', 'reviewer', 'admin'], 'resolve condition');
    const condition = await this.conditions.resolve({
      conditionId: command.conditionId,
      actorUserId: command.actor.userId,
      resolutionNote: command.resolutionNote ?? null,
    });
    if (condition === null)
      throw notFound('Qualification condition not found', command.conditionId);
    await this.publish('qualification.condition_resolved', condition, command.actor.userId);
    return condition;
  }

  async waive(command: {
    conditionId: string;
    actor: QualificationActor;
    reasonCode: string;
    reasonNote?: string | null;
  }): Promise<QualificationCondition> {
    assertRole(command.actor, ['reviewer', 'admin'], 'waive condition');
    const condition = await this.conditions.waive({
      conditionId: command.conditionId,
      actorUserId: command.actor.userId,
      reasonCode: nonBlank(command.reasonCode, 'Waiver reason code is required'),
      reasonNote: command.reasonNote ?? null,
    });
    if (condition === null)
      throw notFound('Qualification condition not found', command.conditionId);
    await this.publish('qualification.condition_waived', condition, command.actor.userId);
    return condition;
  }

  private async publish(
    action: 'qualification.condition_resolved' | 'qualification.condition_waived',
    condition: QualificationCondition,
    actorUserId: string | null,
  ): Promise<void> {
    await this.audit?.append({
      actorUserId,
      action,
      subjectType: 'organization',
      subjectId: condition.organizationId,
      correlationId: null,
      metadata: { conditionId: condition.id, reviewId: condition.reviewId },
    });
    await this.outbox?.insert({
      aggregateType: 'organization',
      aggregateId: condition.organizationId,
      eventType: action,
      idempotencyKey: `${action}:${condition.id}`,
      payload: { conditionId: condition.id, reviewId: condition.reviewId },
      metadata: {},
    });
  }
}

export class RecommendationOverrideService {
  constructor(private readonly overrides: RecommendationOverrideRepository) {}

  async override(command: {
    reviewId: string;
    scoreResultId?: string | null;
    computedRecommendation: Record<string, unknown>;
    reviewerRecommendation: Record<string, unknown>;
    actor: QualificationActor;
    reasonCode: string;
    reasonNote?: string | null;
  }): Promise<{ id: string }> {
    assertRole(command.actor, ['reviewer', 'admin'], 'override recommendation');
    return this.overrides.insert({
      reviewId: command.reviewId,
      scoreResultId: command.scoreResultId ?? null,
      computedRecommendation: command.computedRecommendation,
      reviewerRecommendation: command.reviewerRecommendation,
      actorUserId: command.actor.userId,
      reasonCode: nonBlank(command.reasonCode, 'Override reason code is required'),
      reasonNote: command.reasonNote ?? null,
    });
  }
}

export class DisqualificationReasonCatalogService {
  constructor(private readonly reasons: DisqualificationReasonRepository) {}

  async listActive() {
    return this.reasons.listActive();
  }

  async findActiveByKey(key: string) {
    return this.reasons.findActiveByKey(key);
  }
}

export class QualificationTransitionCoordinator {
  constructor(private readonly operationalState: OperationalStateService) {}

  async applyDecision(command: {
    organizationId: string;
    outcome: QualificationOutcome;
    expectedOrganizationRecordVersion: number;
    actor: { type: 'user'; userId: string | null };
    reasonCode: string;
    reasonNote?: string | null;
    commandCorrelationId?: string | null;
    relatedReviewId?: string | null;
  }) {
    const rule = ruleForOutcome(command.outcome);
    const result = await this.operationalState.transitionProspectStage({
      organizationId: command.organizationId,
      to: rule.targetProspectStage,
      expectedRecordVersion: command.expectedOrganizationRecordVersion,
      actor: command.actor,
      reasonCode: command.reasonCode,
      reasonNote: command.reasonNote ?? null,
      commandCorrelationId: command.commandCorrelationId ?? null,
      relatedReviewId: command.relatedReviewId ?? null,
    });
    return result;
  }
}

export class ReentryService {
  constructor(
    private readonly operationalState: OperationalStateService,
    private readonly guards?: QualificationGuardPort,
    private readonly tasks?: QualificationTaskPort,
    private readonly audit?: QualificationAuditPort,
    private readonly outbox?: QualificationOutboxPort,
  ) {}

  async preview(input: { from: ProspectStage; to: ProspectStage }): Promise<TransitionPreview> {
    const route = findReentryRoute(input.from, input.to);
    if (route === null) {
      return {
        from: input.from,
        to: input.to,
        allowed: false,
        deniedReason: 'Route is not allowed by REENTRY_POLICY',
      };
    }
    return { from: input.from, to: input.to, allowed: true };
  }

  async reenter(command: {
    organizationId: string;
    from: ProspectStage;
    to: ProspectStage;
    expectedOrganizationRecordVersion: number;
    actor: QualificationActor;
    reasonCode: ReentryReasonCode;
    reasonNote?: string | null;
    ownerUserId: string;
    dueDate: string;
    commandCorrelationId?: string | null;
    validationResultSnapshot?: Record<string, unknown>;
  }) {
    const route = findReentryRoute(command.from, command.to);
    if (route === null) {
      await this.publishDenied(command, 'Route is not allowed by REENTRY_POLICY');
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Re-entry route is not allowed',
        details: { from: command.from, to: command.to },
      });
    }
    assertRole(command.actor, route.roles, 're-enter routed prospect');
    if (!route.reasonCodes.includes(command.reasonCode)) {
      await this.publishDenied(command, 'Reason code is not allowed for route');
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Reason code is not allowed for this re-entry route',
        details: { reasonCode: command.reasonCode },
      });
    }
    await this.guards?.assertCanAccessOrganization({
      organizationId: command.organizationId,
      actor: command.actor,
    });
    if (route.requiresAssignmentValidation) {
      await this.guards?.assertAssignmentAllowsQualification({
        organizationId: command.organizationId,
        actor: command.actor,
      });
    }
    await this.tasks?.createTask({
      subjectType: 'organization',
      subjectId: command.organizationId,
      organizationId: command.organizationId,
      title: `Re-entry follow-up: ${command.to}`,
      description: command.reasonNote ?? null,
      dueDate: command.dueDate,
      assignedToUserId: command.ownerUserId,
      createdByUserId: command.actor.userId,
      metadata: {
        source: 'qualification_reentry',
        from: command.from,
        to: command.to,
        reasonCode: command.reasonCode,
      },
    });
    const result = await this.operationalState.transitionProspectStage({
      organizationId: command.organizationId,
      to: command.to,
      expectedRecordVersion: command.expectedOrganizationRecordVersion,
      actor: { type: 'user', userId: command.actor.userId },
      reasonCode: command.reasonCode,
      reasonNote: command.reasonNote ?? null,
      exceptionAuthorized: true,
      commandCorrelationId: command.commandCorrelationId ?? null,
    });
    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'qualification.reentry_requested',
      subjectType: 'organization',
      subjectId: command.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: { from: command.from, to: command.to, reasonCode: command.reasonCode },
    });
    await this.outbox?.insert({
      aggregateType: 'organization',
      aggregateId: command.organizationId,
      eventType: 'prospect.stage_transitioned',
      idempotencyKey:
        command.commandCorrelationId === undefined || command.commandCorrelationId === null
          ? `reentry:${command.organizationId}:${result.transition.id}`
          : `prospect.stage_transitioned:${command.commandCorrelationId}`,
      payload: { from: command.from, to: command.to, reasonCode: command.reasonCode },
      metadata: { transitionId: result.transition.id },
    });
    return result;
  }

  private async publishDenied(
    command: {
      organizationId: string;
      from: ProspectStage;
      to: ProspectStage;
      actor: QualificationActor;
      commandCorrelationId?: string | null;
    },
    deniedReason: string,
  ): Promise<void> {
    await this.outbox?.insert({
      aggregateType: 'organization',
      aggregateId: command.organizationId,
      eventType: 'prospect.transition_denied',
      idempotencyKey:
        command.commandCorrelationId ??
        `reentry-denied:${command.organizationId}:${command.from}:${command.to}`,
      payload: { from: command.from, to: command.to, deniedReason },
      metadata: { actorUserId: command.actor.userId },
    });
  }
}

export class ReviewWorkspaceQuery {
  constructor(
    private readonly reviews: QualificationReviewRepository,
    private readonly conditions: QualificationConditionRepository,
    private readonly decisions: QualificationDecisionRepository,
  ) {}

  async forReview(reviewId: string, actor: QualificationActor) {
    const review = await this.reviews.findById(reviewId);
    if (review === null) throw notFound('Qualification review not found', reviewId);
    const [scores, conditions, latestDecision] = await Promise.all([
      this.reviews.listScores(reviewId),
      this.conditions.listForReview(reviewId),
      this.decisions.latestForReview(reviewId),
    ]);
    return {
      review,
      scores,
      conditions,
      latestDecision,
      completeness: summarizeCompleteness(review.requiredGaps, conditions),
      gaps: review.requiredGaps,
      consentIndicators: review.consentIndicators,
      allowedDecisions: Object.values(qualificationDecisionMatrix)
        .filter((rule) => actorHasRole(actor, rule.allowedRoles))
        .map((rule) => rule.outcome),
    };
  }
}

function summarizeCompleteness(
  requiredGaps: readonly string[],
  conditions: readonly QualificationCondition[],
) {
  const openBlocking = conditions.filter(
    (condition) => condition.type === 'blocking' && condition.status === 'pending',
  );
  return {
    requiredGapCount: requiredGaps.length,
    openBlockingConditionCount: openBlocking.length,
    readyForDecision: requiredGaps.length === 0 || openBlocking.length === 0,
  };
}

function assertRole(
  actor: QualificationActor,
  allowedRoles: readonly QualificationActor['roles'][number][],
  action: string,
): void {
  if (!actorHasRole(actor, allowedRoles)) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: `Actor is not authorized to ${action}`,
      details: { roles: actor.roles, allowedRoles },
    });
  }
}

function nonBlank(value: string, message: string): string {
  if (value.trim() === '') throw new AppError({ code: 'VALIDATION_FAILED', message });
  return value;
}

function notFound(message: string, id: string): AppError {
  return new AppError({ code: 'NOT_FOUND', message, details: { id } });
}

function conflict(message: string, id: string): AppError {
  return new AppError({ code: 'CONFLICT', message, details: { id } });
}
