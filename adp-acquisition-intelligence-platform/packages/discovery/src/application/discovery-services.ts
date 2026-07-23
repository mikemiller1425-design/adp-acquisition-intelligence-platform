import { AppError } from '@adp/platform';

import {
  actorHasRole,
  canCompleteSession,
  recommendAfterMapping,
  type DiscoveryActor,
  type DiscoveryActorRole,
  type DiscoveryRecommendation,
} from '../domain/discovery.js';
import type {
  BlockingConditionPort,
  DiscoveryAgenda,
  DiscoveryAgendaItem,
  DiscoveryAgendaRepository,
  DiscoveryAnswer,
  DiscoveryAnswerRepository,
  DiscoveryAuditPort,
  DiscoveryFollowUpRepository,
  DiscoveryInterpretationRepository,
  DiscoveryMapping,
  DiscoveryMappingRepository,
  DiscoveryOutboxPort,
  DiscoveryQuestion,
  DiscoveryScoreSnapshotRepository,
  DiscoverySession,
  DiscoverySessionRepository,
  DiscoveryTemplateRepository,
  ProspectStageTransitionPort,
  ScoreDeltaPort,
  VariableConfirmationPort,
} from '../domain/ports.js';

function assertRole(
  actor: DiscoveryActor,
  allowed: readonly DiscoveryActorRole[],
  action: string,
): void {
  if (!actorHasRole(actor, allowed)) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: `Actor is not authorized to ${action}`,
      details: { roles: actor.roles, allowed },
    });
  }
}

function notFound(message: string, id: string): AppError {
  return new AppError({ code: 'NOT_FOUND', message, details: { id } });
}

function conflict(message: string, id: string): AppError {
  return new AppError({ code: 'CONFLICT', message, details: { id } });
}

function validation(message: string, details: Record<string, unknown>): AppError {
  return new AppError({ code: 'VALIDATION_FAILED', message, details });
}

export class AgendaService {
  constructor(
    private readonly templates: DiscoveryTemplateRepository,
    private readonly agendas: DiscoveryAgendaRepository,
    private readonly blocking: BlockingConditionPort,
    private readonly audit?: DiscoveryAuditPort,
    private readonly outbox?: DiscoveryOutboxPort,
  ) {}

  async generate(command: {
    organizationId: string;
    actor: DiscoveryActor;
    contactId?: string | null;
    motion?: string | null;
    organizationType?: string | null;
    contactType?: string | null;
    qualificationOutcome?: string | null;
    missingVariableKeys?: readonly string[];
    templateKey?: string | null;
    commandCorrelationId?: string | null;
  }): Promise<{ agenda: DiscoveryAgenda; items: DiscoveryAgendaItem[] }> {
    assertRole(command.actor, ['admin', 'researcher', 'sales', 'reviewer'], 'generate agenda');
    const openBlocking = await this.blocking.listOpenBlockingForOrganization(
      command.organizationId,
    );
    if (openBlocking.length > 0) {
      throw validation(
        'Open blocking qualification conditions prevent discovery agenda generation',
        {
          organizationId: command.organizationId,
          blockingConditionIds: openBlocking.map((row) => row.id),
        },
      );
    }

    const template =
      command.templateKey !== undefined && command.templateKey !== null
        ? await this.templates.findPublishedByKey(command.templateKey)
        : ((
            await this.templates.listPublished({
              motion: command.motion ?? null,
              organizationType: command.organizationType ?? null,
            })
          )[0] ?? null);
    if (template === null) {
      throw notFound('No published discovery template available', command.organizationId);
    }

    const questions = await this.templates.listPublishedQuestionsForTemplate(template.id);
    const missing = new Set(command.missingVariableKeys ?? []);
    const items = questions.map((entry, index) => {
      const tags = entry.question.tags.filter((tag): tag is string => typeof tag === 'string');
      const highImpactMissing =
        entry.question.highImpact &&
        tags.some((tag) => missing.has(tag) || missing.has(entry.question.key));
      return {
        questionId: entry.question.id,
        prompt: entry.question.prompt,
        reason: highImpactMissing
          ? 'Missing high-impact variable for scoring completeness'
          : (entry.rationale ?? 'Template question for selected motion/persona'),
        reasonCode: highImpactMissing ? 'missing_high_impact_variable' : 'template_question',
        variables: entry.question.variableDefinitionId
          ? [{ variableDefinitionId: entry.question.variableDefinitionId }]
          : [],
        scoresAffected: entry.question.scoreImpact,
        priority: entry.question.highImpact ? 0 : index + 1,
        required: entry.required || entry.question.requiredDefault,
        deferred: false,
        displayOrder: entry.displayOrder,
        metadata: { questionKey: entry.question.key, questionVersion: entry.question.version },
      };
    });

    const created = await this.agendas.create({
      organizationId: command.organizationId,
      contactId: command.contactId ?? null,
      templateId: template.id,
      motion: command.motion ?? template.motion,
      organizationType: command.organizationType ?? template.organizationType,
      contactType: command.contactType ?? template.contactType,
      qualificationOutcome: command.qualificationOutcome ?? null,
      context: {
        missingVariableKeys: [...(command.missingVariableKeys ?? [])],
        templateKey: template.key,
        templateVersion: template.version,
      },
      generatedByUserId: command.actor.userId,
      commandCorrelationId: command.commandCorrelationId ?? null,
      items,
    });

    await this.publish({
      action: 'discovery.agenda_generated',
      organizationId: command.organizationId,
      actorUserId: command.actor.userId,
      correlationId: command.commandCorrelationId ?? null,
      payload: { agendaId: created.agenda.id, templateId: template.id, itemCount: items.length },
    });
    return created;
  }

  private async publish(input: {
    action: 'discovery.agenda_generated';
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
      idempotencyKey: `${input.action}:${String(input.payload['agendaId'])}`,
      payload: input.payload,
      metadata: { correlationId: input.correlationId },
    });
  }
}

export class DiscoverySessionService {
  constructor(
    private readonly sessions: DiscoverySessionRepository,
    private readonly agendas: DiscoveryAgendaRepository,
    private readonly answers: DiscoveryAnswerRepository,
    private readonly mappings: DiscoveryMappingRepository,
    private readonly blocking: BlockingConditionPort,
    private readonly stages: ProspectStageTransitionPort,
    private readonly audit?: DiscoveryAuditPort,
    private readonly outbox?: DiscoveryOutboxPort,
  ) {}

  async create(command: {
    organizationId: string;
    actor: DiscoveryActor;
    agendaId: string;
    contactId?: string | null;
    commandCorrelationId?: string | null;
  }): Promise<DiscoverySession> {
    assertRole(command.actor, ['admin', 'researcher', 'sales', 'reviewer'], 'create session');
    const agenda = await this.agendas.findById(command.agendaId);
    if (agenda === null) throw notFound('Discovery agenda not found', command.agendaId);
    if (agenda.organizationId !== command.organizationId) {
      throw validation('Agenda organization mismatch', {
        agendaId: agenda.id,
        organizationId: command.organizationId,
      });
    }
    const session = await this.sessions.create({
      organizationId: command.organizationId,
      contactId: command.contactId ?? agenda.contactId,
      agendaId: agenda.id,
      templateId: agenda.templateId,
      ownerUserId: command.actor.userId,
      createdByUserId: command.actor.userId,
      commandCorrelationId: command.commandCorrelationId ?? null,
    });
    await this.publish({
      action: 'discovery.session_created',
      organizationId: command.organizationId,
      actorUserId: command.actor.userId,
      correlationId: command.commandCorrelationId ?? null,
      aggregateId: session.id,
      payload: { sessionId: session.id, agendaId: agenda.id },
    });
    return session;
  }

  async schedule(command: {
    sessionId: string;
    actor: DiscoveryActor;
    expectedSessionVersion: number;
    expectedOrganizationRecordVersion: number;
    scheduledStartAt: Date;
    scheduledEndAt?: Date | null;
    commandCorrelationId?: string | null;
  }): Promise<DiscoverySession> {
    assertRole(command.actor, ['admin', 'sales', 'reviewer'], 'schedule session');
    const session = await this.requireSession(command.sessionId);
    const openBlocking = await this.blocking.listOpenBlockingForOrganization(
      session.organizationId,
    );
    if (openBlocking.length > 0) {
      throw validation('Open blocking qualification conditions prevent discovery scheduling', {
        organizationId: session.organizationId,
        blockingConditionIds: openBlocking.map((row) => row.id),
      });
    }
    await this.stages.transitionToDiscoveryScheduled({
      organizationId: session.organizationId,
      expectedRecordVersion: command.expectedOrganizationRecordVersion,
      actor: command.actor,
      commandCorrelationId: command.commandCorrelationId ?? null,
    });
    const updated = await this.sessions.updateStatus({
      sessionId: session.id,
      expectedRecordVersion: command.expectedSessionVersion,
      status: 'scheduled',
      scheduledStartAt: command.scheduledStartAt,
      scheduledEndAt: command.scheduledEndAt ?? null,
    });
    if (updated === null) throw conflict('Discovery session version conflict', session.id);
    await this.publish({
      action: 'discovery.session_scheduled',
      organizationId: session.organizationId,
      actorUserId: command.actor.userId,
      correlationId: command.commandCorrelationId ?? null,
      aggregateId: updated.id,
      payload: { sessionId: updated.id, status: updated.status },
    });
    return updated;
  }

  async start(command: {
    sessionId: string;
    actor: DiscoveryActor;
    expectedSessionVersion: number;
  }): Promise<DiscoverySession> {
    assertRole(command.actor, ['admin', 'sales', 'reviewer', 'researcher'], 'start session');
    const session = await this.requireSession(command.sessionId);
    if (session.status !== 'scheduled' && session.status !== 'prepared') {
      throw validation('Only scheduled or prepared sessions can start', {
        sessionId: session.id,
        status: session.status,
      });
    }
    const updated = await this.sessions.updateStatus({
      sessionId: session.id,
      expectedRecordVersion: command.expectedSessionVersion,
      status: 'in_progress',
      startedAt: new Date(),
    });
    if (updated === null) throw conflict('Discovery session version conflict', session.id);
    await this.publish({
      action: 'discovery.session_started',
      organizationId: session.organizationId,
      actorUserId: command.actor.userId,
      correlationId: session.commandCorrelationId,
      aggregateId: updated.id,
      payload: { sessionId: updated.id },
    });
    return updated;
  }

  async complete(command: {
    sessionId: string;
    actor: DiscoveryActor;
    expectedSessionVersion: number;
    expectedOrganizationRecordVersion: number;
    summary?: Record<string, unknown>;
    commandCorrelationId?: string | null;
  }): Promise<{ session: DiscoverySession; recommendation: DiscoveryRecommendation }> {
    assertRole(command.actor, ['admin', 'sales', 'reviewer'], 'complete session');
    const session = await this.requireSession(command.sessionId);
    if (session.status !== 'in_progress' && session.status !== 'reviewed') {
      throw validation('Only in-progress or reviewed sessions can complete', {
        sessionId: session.id,
        status: session.status,
      });
    }
    const items = session.agendaId === null ? [] : await this.agendas.listItems(session.agendaId);
    const answers = await this.answers.listForSession(session.id);
    const mappings = await this.mappings.listForSession(session.id);
    const gate = canCompleteSession({
      requiredAgendaItemIds: items
        .filter((item) => item.required && !item.deferred)
        .map((i) => i.id),
      answeredAgendaItemIds: answers
        .filter((answer) => answer.agendaItemId !== null && answer.answerStatus === 'answered')
        .map((answer) => answer.agendaItemId as string),
      openProposedMappingCount: mappings.filter((mapping) => mapping.status === 'proposed').length,
    });
    if (!gate.ok) {
      throw validation('Discovery session cannot complete until required work is finished', {
        sessionId: session.id,
        reasons: gate.reasons,
      });
    }

    await this.stages.transitionToDiscoveryCompleted({
      organizationId: session.organizationId,
      expectedRecordVersion: command.expectedOrganizationRecordVersion,
      actor: command.actor,
      commandCorrelationId: command.commandCorrelationId ?? null,
    });
    const updated = await this.sessions.updateStatus({
      sessionId: session.id,
      expectedRecordVersion: command.expectedSessionVersion,
      status: 'completed',
      completedAt: new Date(),
      summary: command.summary ?? {},
    });
    if (updated === null) throw conflict('Discovery session version conflict', session.id);

    const openBlocking = await this.blocking.listOpenBlockingForOrganization(
      session.organizationId,
    );
    const recommendation = recommendAfterMapping({
      confirmedCount: mappings.filter((m) => m.status === 'confirmed').length,
      rejectedCount: mappings.filter((m) => m.status === 'rejected').length,
      openProposedCount: 0,
      scoreMovements: [],
      openBlockingConditions: openBlocking.length,
    });

    await this.publish({
      action: 'discovery.session_completed',
      organizationId: session.organizationId,
      actorUserId: command.actor.userId,
      correlationId: command.commandCorrelationId ?? null,
      aggregateId: updated.id,
      payload: { sessionId: updated.id, recommendation },
    });
    return { session: updated, recommendation };
  }

  private async requireSession(sessionId: string): Promise<DiscoverySession> {
    const session = await this.sessions.findById(sessionId);
    if (session === null) throw notFound('Discovery session not found', sessionId);
    return session;
  }

  private async publish(input: {
    action:
      | 'discovery.session_created'
      | 'discovery.session_scheduled'
      | 'discovery.session_started'
      | 'discovery.session_completed';
    organizationId: string;
    actorUserId: string | null;
    correlationId: string | null;
    aggregateId: string;
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
      idempotencyKey: `${input.action}:${input.aggregateId}:${String(input.payload['status'] ?? 'ok')}`,
      payload: {
        ...input.payload,
        organizationId: input.organizationId,
        sessionId: input.aggregateId,
      },
      metadata: { correlationId: input.correlationId },
    });
  }
}

export class DiscoveryAnswerService {
  constructor(
    private readonly sessions: DiscoverySessionRepository,
    private readonly answers: DiscoveryAnswerRepository,
    private readonly interpretations: DiscoveryInterpretationRepository,
    private readonly mappings: DiscoveryMappingRepository,
    private readonly audit?: DiscoveryAuditPort,
    private readonly outbox?: DiscoveryOutboxPort,
  ) {}

  async recordAnswer(command: {
    sessionId: string;
    actor: DiscoveryActor;
    agendaItemId?: string | null;
    questionId?: string | null;
    answerType: DiscoveryQuestion['answerType'];
    answerStatus: DiscoveryAnswer['answerStatus'];
    originalAnswer?: unknown;
    transcriptRef?: string | null;
    normalizedValue?: unknown;
    variableDefinitionId?: string | null;
    variableDefinitionVersionId?: string | null;
    proposeMapping?: boolean;
    confidence?: number | null;
    rationale?: string;
  }): Promise<{
    answer: DiscoveryAnswer;
    interpretationId: string | null;
    mapping: DiscoveryMapping | null;
  }> {
    assertRole(command.actor, ['admin', 'sales', 'reviewer', 'researcher'], 'record answer');
    const session = await this.sessions.findById(command.sessionId);
    if (session === null) throw notFound('Discovery session not found', command.sessionId);
    if (session.status !== 'in_progress' && session.status !== 'reviewed') {
      throw validation('Answers can only be recorded for in-progress or reviewed sessions', {
        sessionId: session.id,
        status: session.status,
      });
    }
    if (command.answerStatus === 'answered' && command.originalAnswer === undefined) {
      throw validation('Answered status requires originalAnswer payload', {
        sessionId: session.id,
      });
    }

    const answer = await this.answers.insert({
      sessionId: session.id,
      agendaItemId: command.agendaItemId ?? null,
      questionId: command.questionId ?? null,
      answerType: command.answerType,
      answerStatus: command.answerStatus,
      originalAnswer: command.originalAnswer,
      transcriptRef: command.transcriptRef ?? null,
      submittedByUserId: command.actor.userId,
    });

    await this.publish({
      action: 'discovery.answer_recorded',
      organizationId: session.organizationId,
      actorUserId: command.actor.userId,
      correlationId: session.commandCorrelationId,
      aggregateId: session.id,
      payload: { answerId: answer.id, answerStatus: answer.answerStatus },
    });

    let interpretationId: string | null = null;
    let mapping: DiscoveryMapping | null = null;
    if (command.normalizedValue !== undefined) {
      const interpretation = await this.interpretations.insert({
        answerId: answer.id,
        version: 1,
        normalizedValue: command.normalizedValue,
        variableDefinitionId: command.variableDefinitionId ?? null,
        variableDefinitionVersionId: command.variableDefinitionVersionId ?? null,
        confidence: command.confidence ?? null,
        rationale: command.rationale ?? 'Normalized from discovery answer',
        proposedByUserId: command.actor.userId,
      });
      interpretationId = interpretation.id;
      await this.publish({
        action: 'discovery.interpretation_proposed',
        organizationId: session.organizationId,
        actorUserId: command.actor.userId,
        correlationId: session.commandCorrelationId,
        aggregateId: session.id,
        payload: { answerId: answer.id, interpretationId: interpretation.id },
      });

      if (
        command.proposeMapping === true &&
        command.variableDefinitionId !== undefined &&
        command.variableDefinitionId !== null &&
        command.variableDefinitionVersionId !== undefined &&
        command.variableDefinitionVersionId !== null
      ) {
        mapping = await this.mappings.insert({
          sessionId: session.id,
          answerId: answer.id,
          interpretationId: interpretation.id,
          subjectType: 'organization',
          organizationId: session.organizationId,
          contactId: null,
          variableDefinitionId: command.variableDefinitionId,
          variableDefinitionVersionId: command.variableDefinitionVersionId,
          proposedTypedValue: command.normalizedValue,
        });
        await this.publish({
          action: 'discovery.mapping_proposed',
          organizationId: session.organizationId,
          actorUserId: command.actor.userId,
          correlationId: session.commandCorrelationId,
          aggregateId: session.id,
          payload: { mappingId: mapping.id, answerId: answer.id },
        });
      }
    }

    return { answer, interpretationId, mapping };
  }

  private async publish(input: {
    action:
      | 'discovery.answer_recorded'
      | 'discovery.interpretation_proposed'
      | 'discovery.mapping_proposed';
    organizationId: string;
    actorUserId: string | null;
    correlationId: string | null;
    aggregateId: string;
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
      idempotencyKey: `${input.action}:${String(input.payload['answerId'] ?? input.payload['mappingId'])}`,
      payload: {
        ...input.payload,
        organizationId: input.organizationId,
        sessionId: input.aggregateId,
      },
      metadata: { correlationId: input.correlationId },
    });
  }
}

export class AnswerMappingService {
  constructor(
    private readonly sessions: DiscoverySessionRepository,
    private readonly answers: DiscoveryAnswerRepository,
    private readonly mappings: DiscoveryMappingRepository,
    private readonly snapshots: DiscoveryScoreSnapshotRepository,
    private readonly followUps: DiscoveryFollowUpRepository,
    private readonly variables: VariableConfirmationPort,
    private readonly scores: ScoreDeltaPort,
    private readonly blocking: BlockingConditionPort,
    private readonly audit?: DiscoveryAuditPort,
    private readonly outbox?: DiscoveryOutboxPort,
  ) {}

  async confirm(command: {
    mappingId: string;
    actor: DiscoveryActor;
    reviewReason?: string | null;
    scoreKeys?: readonly string[];
    evidenceRecordId?: string | null;
  }): Promise<{
    mapping: DiscoveryMapping;
    recommendation: DiscoveryRecommendation;
    snapshots: Awaited<ReturnType<ScoreDeltaPort['captureDeltas']>>;
  }> {
    assertRole(command.actor, ['admin', 'reviewer', 'sales'], 'confirm mapping');
    const mapping = await this.mappings.findById(command.mappingId);
    if (mapping === null) throw notFound('Discovery mapping not found', command.mappingId);
    if (mapping.status !== 'proposed') {
      throw validation('Only proposed mappings can be confirmed', {
        mappingId: mapping.id,
        status: mapping.status,
      });
    }
    const session = await this.sessions.findById(mapping.sessionId);
    if (session === null) throw notFound('Discovery session not found', mapping.sessionId);
    const answer = await this.answers.findById(mapping.answerId);
    if (answer === null) throw notFound('Discovery answer not found', mapping.answerId);
    if (answer.originalAnswer === null || answer.originalAnswer === undefined) {
      throw validation('Cannot confirm mapping without immutable original answer', {
        answerId: answer.id,
      });
    }

    const confirmedValue = await this.variables.confirmFromMapping({
      subjectType: mapping.subjectType,
      organizationId: mapping.organizationId,
      contactId: mapping.contactId,
      variableDefinitionVersionId: mapping.variableDefinitionVersionId,
      typedValue: mapping.proposedTypedValue,
      actor: command.actor,
      correlationId: session.commandCorrelationId,
      evidenceRecordId: command.evidenceRecordId ?? null,
    });

    const reviewed = await this.mappings.markReviewed({
      mappingId: mapping.id,
      status: 'confirmed',
      reviewedByUserId: command.actor.userId,
      reviewReason: command.reviewReason ?? null,
      evidenceRecordId: confirmedValue.evidenceRecordId,
      variableValueId: confirmedValue.variableValueId,
    });
    if (reviewed === null) throw conflict('Mapping could not be confirmed', mapping.id);

    const deltas = await this.scores.captureDeltas({
      sessionId: session.id,
      mappingId: reviewed.id,
      organizationId: session.organizationId,
      scoreKeys: command.scoreKeys ?? ['acquisition_fit'],
    });
    for (const delta of deltas) {
      await this.snapshots.insert({
        sessionId: session.id,
        mappingId: reviewed.id,
        subjectType: 'organization',
        organizationId: session.organizationId,
        contactId: null,
        scoreKey: delta.scoreKey,
        beforeScoreResultId: delta.beforeScoreResultId,
        afterScoreResultId: delta.afterScoreResultId,
        beforeSnapshot: delta.beforeSnapshot,
        afterSnapshot: delta.afterSnapshot,
        recommendationMovement: delta.recommendationMovement,
        durationMs: delta.durationMs,
      });
      await this.publish({
        action: 'discovery.score_delta_recorded',
        organizationId: session.organizationId,
        actorUserId: command.actor.userId,
        correlationId: session.commandCorrelationId,
        aggregateId: session.id,
        payload: {
          mappingId: reviewed.id,
          scoreKey: delta.scoreKey,
          before: delta.before,
          after: delta.after,
        },
      });
    }

    await this.publish({
      action: 'discovery.mapping_confirmed',
      organizationId: session.organizationId,
      actorUserId: command.actor.userId,
      correlationId: session.commandCorrelationId,
      aggregateId: session.id,
      payload: {
        mappingId: reviewed.id,
        variableValueId: confirmedValue.variableValueId,
        originalAnswerPreserved: true,
      },
    });

    const all = await this.mappings.listForSession(session.id);
    const openBlocking = await this.blocking.listOpenBlockingForOrganization(
      session.organizationId,
    );
    const recommendation = recommendAfterMapping({
      confirmedCount: all.filter((row) => row.status === 'confirmed').length,
      rejectedCount: all.filter((row) => row.status === 'rejected').length,
      openProposedCount: all.filter((row) => row.status === 'proposed').length,
      scoreMovements: deltas.map((delta) => ({
        scoreKey: delta.scoreKey,
        before: delta.before,
        after: delta.after,
      })),
      openBlockingConditions: openBlocking.length,
    });

    if (
      recommendation.nextAction === 'follow_up' ||
      recommendation.nextAction === 'continue_discovery'
    ) {
      await this.followUps.insert({
        sessionId: session.id,
        organizationId: session.organizationId,
        title: 'Discovery follow-up required',
        description: recommendation.reasons.join('; '),
        createdByUserId: command.actor.userId,
      });
      await this.publish({
        action: 'discovery.follow_up_created',
        organizationId: session.organizationId,
        actorUserId: command.actor.userId,
        correlationId: session.commandCorrelationId,
        aggregateId: session.id,
        payload: { reasons: recommendation.reasons },
      });
    }

    return { mapping: reviewed, recommendation, snapshots: deltas };
  }

  async reject(command: {
    mappingId: string;
    actor: DiscoveryActor;
    reviewReason: string;
  }): Promise<DiscoveryMapping> {
    assertRole(command.actor, ['admin', 'reviewer', 'sales'], 'reject mapping');
    const mapping = await this.mappings.findById(command.mappingId);
    if (mapping === null) throw notFound('Discovery mapping not found', command.mappingId);
    if (mapping.status !== 'proposed') {
      throw validation('Only proposed mappings can be rejected', {
        mappingId: mapping.id,
        status: mapping.status,
      });
    }
    const session = await this.sessions.findById(mapping.sessionId);
    if (session === null) throw notFound('Discovery session not found', mapping.sessionId);
    const reviewed = await this.mappings.markReviewed({
      mappingId: mapping.id,
      status: 'rejected',
      reviewedByUserId: command.actor.userId,
      reviewReason: command.reviewReason,
    });
    if (reviewed === null) throw conflict('Mapping could not be rejected', mapping.id);
    await this.publish({
      action: 'discovery.mapping_rejected',
      organizationId: session.organizationId,
      actorUserId: command.actor.userId,
      correlationId: session.commandCorrelationId,
      aggregateId: session.id,
      payload: { mappingId: reviewed.id, reviewReason: command.reviewReason },
    });
    return reviewed;
  }

  private async publish(input: {
    action:
      | 'discovery.mapping_confirmed'
      | 'discovery.mapping_rejected'
      | 'discovery.score_delta_recorded'
      | 'discovery.follow_up_created';
    organizationId: string;
    actorUserId: string | null;
    correlationId: string | null;
    aggregateId: string;
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
      idempotencyKey: `${input.action}:${String(input.payload['mappingId'] ?? input.aggregateId)}:${String(input.payload['scoreKey'] ?? 'na')}`,
      payload: {
        ...input.payload,
        organizationId: input.organizationId,
        sessionId: input.aggregateId,
      },
      metadata: { correlationId: input.correlationId },
    });
  }
}
