import {
  auditEvents,
  discoveryAgendaItems,
  discoveryAgendas,
  discoveryAnswers,
  discoveryFollowUps,
  discoveryInterpretations,
  discoveryMappings,
  discoveryQuestions,
  discoveryScoreSnapshots,
  discoverySessions,
  discoveryTemplateQuestions,
  discoveryTemplates,
  outboxEvents,
  type RepositoryExecutor,
} from '@adp/database';
import type { OperationalStateService } from '@adp/qualification';
import { and, asc, eq, sql } from 'drizzle-orm';

import type {
  DiscoveryAgenda,
  DiscoveryAgendaItem,
  DiscoveryAgendaRepository,
  DiscoveryAnswer,
  DiscoveryAnswerRepository,
  DiscoveryAuditPort,
  DiscoveryFollowUp,
  DiscoveryFollowUpRepository,
  DiscoveryInterpretation,
  DiscoveryInterpretationRepository,
  DiscoveryMapping,
  DiscoveryMappingRepository,
  DiscoveryOutboxPort,
  DiscoveryQuestion,
  DiscoveryScoreSnapshot,
  DiscoveryScoreSnapshotRepository,
  DiscoverySession,
  DiscoverySessionRepository,
  DiscoveryTemplate,
  DiscoveryTemplateRepository,
  ProspectStageTransitionPort,
} from '../domain/ports.js';
import type { DiscoveryActor } from '../domain/discovery.js';

type Db = RepositoryExecutor;

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected database row');
  return row;
}

function one<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

export class PostgresDiscoveryTemplateRepository implements DiscoveryTemplateRepository {
  constructor(private readonly db: Db) {}

  async listPublished(input?: {
    motion?: string | null;
    organizationType?: string | null;
  }): Promise<DiscoveryTemplate[]> {
    const rows = await this.db
      .select()
      .from(discoveryTemplates)
      .where(eq(discoveryTemplates.status, 'published'));
    return rows.map(mapTemplate).filter((template) => {
      if (input?.motion && template.motion !== null && template.motion !== input.motion) {
        return false;
      }
      if (
        input?.organizationType &&
        template.organizationType !== null &&
        template.organizationType !== input.organizationType
      ) {
        return false;
      }
      return true;
    });
  }

  async findPublishedByKey(key: string): Promise<DiscoveryTemplate | null> {
    const row = one(
      await this.db
        .select()
        .from(discoveryTemplates)
        .where(and(eq(discoveryTemplates.key, key), eq(discoveryTemplates.status, 'published')))
        .limit(1),
    );
    return row === null ? null : mapTemplate(row);
  }

  async listPublishedQuestionsForTemplate(templateId: string) {
    const rows = await this.db
      .select({
        link: discoveryTemplateQuestions,
        question: discoveryQuestions,
      })
      .from(discoveryTemplateQuestions)
      .innerJoin(
        discoveryQuestions,
        eq(discoveryTemplateQuestions.questionId, discoveryQuestions.id),
      )
      .where(
        and(
          eq(discoveryTemplateQuestions.templateId, templateId),
          eq(discoveryQuestions.status, 'published'),
        ),
      )
      .orderBy(asc(discoveryTemplateQuestions.displayOrder));
    return rows.map((row) => ({
      question: mapQuestion(row.question),
      displayOrder: row.link.displayOrder,
      required: row.link.required,
      rationale: row.link.rationale,
    }));
  }
}

export class PostgresDiscoveryAgendaRepository implements DiscoveryAgendaRepository {
  constructor(private readonly db: Db) {}

  async create(input: Parameters<DiscoveryAgendaRepository['create']>[0]) {
    const agendaRow = first(
      await this.db
        .insert(discoveryAgendas)
        .values({
          organizationId: input.organizationId,
          contactId: input.contactId ?? null,
          templateId: input.templateId ?? null,
          motion: input.motion ?? null,
          organizationType: input.organizationType ?? null,
          contactType: input.contactType ?? null,
          qualificationOutcome: input.qualificationOutcome ?? null,
          context: input.context ?? {},
          generatedByUserId: input.generatedByUserId ?? null,
          commandCorrelationId: input.commandCorrelationId ?? null,
        })
        .returning(),
    );
    const itemRows =
      input.items.length === 0
        ? []
        : await this.db
            .insert(discoveryAgendaItems)
            .values(
              input.items.map((item) => ({
                agendaId: agendaRow.id,
                questionId: item.questionId,
                prompt: item.prompt,
                reason: item.reason,
                reasonCode: item.reasonCode,
                variables: item.variables ?? [],
                scoresAffected: item.scoresAffected ?? [],
                priority: item.priority,
                required: item.required,
                deferred: item.deferred ?? false,
                displayOrder: item.displayOrder,
                metadata: item.metadata ?? {},
              })),
            )
            .returning();
    return {
      agenda: mapAgenda(agendaRow),
      items: itemRows.map(mapAgendaItem),
    };
  }

  async findById(id: string): Promise<DiscoveryAgenda | null> {
    const row = one(
      await this.db.select().from(discoveryAgendas).where(eq(discoveryAgendas.id, id)).limit(1),
    );
    return row === null ? null : mapAgenda(row);
  }

  async listItems(agendaId: string): Promise<DiscoveryAgendaItem[]> {
    const rows = await this.db
      .select()
      .from(discoveryAgendaItems)
      .where(eq(discoveryAgendaItems.agendaId, agendaId))
      .orderBy(asc(discoveryAgendaItems.displayOrder));
    return rows.map(mapAgendaItem);
  }
}

export class PostgresDiscoverySessionRepository implements DiscoverySessionRepository {
  constructor(private readonly db: Db) {}

  async create(input: Parameters<DiscoverySessionRepository['create']>[0]) {
    const row = first(
      await this.db
        .insert(discoverySessions)
        .values({
          organizationId: input.organizationId,
          contactId: input.contactId ?? null,
          agendaId: input.agendaId ?? null,
          templateId: input.templateId ?? null,
          ownerUserId: input.ownerUserId ?? null,
          createdByUserId: input.createdByUserId ?? null,
          commandCorrelationId: input.commandCorrelationId ?? null,
          status: 'draft',
        })
        .returning(),
    );
    return mapSession(row);
  }

  async findById(id: string): Promise<DiscoverySession | null> {
    const row = one(
      await this.db.select().from(discoverySessions).where(eq(discoverySessions.id, id)).limit(1),
    );
    return row === null ? null : mapSession(row);
  }

  async updateStatus(input: Parameters<DiscoverySessionRepository['updateStatus']>[0]) {
    const patch: Record<string, unknown> = {
      status: input.status,
      recordVersion: sql`${discoverySessions.recordVersion} + 1`,
      updatedAt: sql`now()`,
    };
    if (input.scheduledStartAt !== undefined) patch['scheduledStartAt'] = input.scheduledStartAt;
    if (input.scheduledEndAt !== undefined) patch['scheduledEndAt'] = input.scheduledEndAt;
    if (input.startedAt !== undefined) patch['startedAt'] = input.startedAt;
    if (input.completedAt !== undefined) patch['completedAt'] = input.completedAt;
    if (input.summary !== undefined) patch['summary'] = input.summary;

    const row = one(
      await this.db
        .update(discoverySessions)
        .set(patch)
        .where(
          and(
            eq(discoverySessions.id, input.sessionId),
            eq(discoverySessions.recordVersion, input.expectedRecordVersion),
          ),
        )
        .returning(),
    );
    return row === null ? null : mapSession(row);
  }
}

export class PostgresDiscoveryAnswerRepository implements DiscoveryAnswerRepository {
  constructor(private readonly db: Db) {}

  async insert(input: Parameters<DiscoveryAnswerRepository['insert']>[0]) {
    const row = first(
      await this.db
        .insert(discoveryAnswers)
        .values({
          sessionId: input.sessionId,
          agendaItemId: input.agendaItemId ?? null,
          questionId: input.questionId ?? null,
          participantId: input.participantId ?? null,
          answerType: input.answerType,
          answerStatus: input.answerStatus,
          originalAnswer: input.originalAnswer ?? null,
          transcriptRef: input.transcriptRef ?? null,
          submittedByUserId: input.submittedByUserId ?? null,
          metadata: input.metadata ?? {},
        })
        .returning(),
    );
    return mapAnswer(row);
  }

  async listForSession(sessionId: string): Promise<DiscoveryAnswer[]> {
    const rows = await this.db
      .select()
      .from(discoveryAnswers)
      .where(eq(discoveryAnswers.sessionId, sessionId));
    return rows.map(mapAnswer);
  }

  async findById(id: string): Promise<DiscoveryAnswer | null> {
    const row = one(
      await this.db.select().from(discoveryAnswers).where(eq(discoveryAnswers.id, id)).limit(1),
    );
    return row === null ? null : mapAnswer(row);
  }
}

export class PostgresDiscoveryInterpretationRepository implements DiscoveryInterpretationRepository {
  constructor(private readonly db: Db) {}

  async insert(input: Parameters<DiscoveryInterpretationRepository['insert']>[0]) {
    const row = first(
      await this.db
        .insert(discoveryInterpretations)
        .values({
          answerId: input.answerId,
          version: input.version,
          normalizedValue: input.normalizedValue ?? null,
          variableDefinitionId: input.variableDefinitionId ?? null,
          variableDefinitionVersionId: input.variableDefinitionVersionId ?? null,
          confidence: input.confidence ?? null,
          rationale: input.rationale,
          proposedByUserId: input.proposedByUserId ?? null,
        })
        .returning(),
    );
    return mapInterpretation(row);
  }

  async latestForAnswer(answerId: string): Promise<DiscoveryInterpretation | null> {
    const row = one(
      await this.db
        .select()
        .from(discoveryInterpretations)
        .where(eq(discoveryInterpretations.answerId, answerId))
        .orderBy(sql`${discoveryInterpretations.version} desc`)
        .limit(1),
    );
    return row === null ? null : mapInterpretation(row);
  }
}

export class PostgresDiscoveryMappingRepository implements DiscoveryMappingRepository {
  constructor(private readonly db: Db) {}

  async insert(input: Parameters<DiscoveryMappingRepository['insert']>[0]) {
    const row = first(
      await this.db
        .insert(discoveryMappings)
        .values({
          sessionId: input.sessionId,
          answerId: input.answerId,
          interpretationId: input.interpretationId ?? null,
          subjectType: input.subjectType,
          organizationId: input.organizationId ?? null,
          contactId: input.contactId ?? null,
          variableDefinitionId: input.variableDefinitionId,
          variableDefinitionVersionId: input.variableDefinitionVersionId,
          proposedTypedValue: input.proposedTypedValue,
        })
        .returning(),
    );
    return mapMapping(row);
  }

  async findById(id: string): Promise<DiscoveryMapping | null> {
    const row = one(
      await this.db.select().from(discoveryMappings).where(eq(discoveryMappings.id, id)).limit(1),
    );
    return row === null ? null : mapMapping(row);
  }

  async listForSession(sessionId: string): Promise<DiscoveryMapping[]> {
    const rows = await this.db
      .select()
      .from(discoveryMappings)
      .where(eq(discoveryMappings.sessionId, sessionId));
    return rows.map(mapMapping);
  }

  async markReviewed(input: Parameters<DiscoveryMappingRepository['markReviewed']>[0]) {
    const row = one(
      await this.db
        .update(discoveryMappings)
        .set({
          status: input.status,
          reviewReason: input.reviewReason ?? null,
          reviewedByUserId: input.reviewedByUserId,
          reviewedAt: sql`now()`,
          evidenceRecordId: input.evidenceRecordId ?? null,
          variableValueId: input.variableValueId ?? null,
          updatedAt: sql`now()`,
        })
        .where(
          and(eq(discoveryMappings.id, input.mappingId), eq(discoveryMappings.status, 'proposed')),
        )
        .returning(),
    );
    return row === null ? null : mapMapping(row);
  }
}

export class PostgresDiscoveryScoreSnapshotRepository implements DiscoveryScoreSnapshotRepository {
  constructor(private readonly db: Db) {}

  async insert(input: Omit<DiscoveryScoreSnapshot, 'id'>) {
    const row = first(
      await this.db
        .insert(discoveryScoreSnapshots)
        .values({
          sessionId: input.sessionId,
          mappingId: input.mappingId,
          subjectType: input.subjectType,
          organizationId: input.organizationId,
          contactId: input.contactId,
          scoreKey: input.scoreKey,
          beforeScoreResultId: input.beforeScoreResultId,
          afterScoreResultId: input.afterScoreResultId,
          beforeSnapshot: input.beforeSnapshot,
          afterSnapshot: input.afterSnapshot,
          recommendationMovement: input.recommendationMovement,
          durationMs: input.durationMs,
        })
        .returning(),
    );
    return mapSnapshot(row);
  }

  async listForSession(sessionId: string): Promise<DiscoveryScoreSnapshot[]> {
    const rows = await this.db
      .select()
      .from(discoveryScoreSnapshots)
      .where(eq(discoveryScoreSnapshots.sessionId, sessionId));
    return rows.map(mapSnapshot);
  }
}

export class PostgresDiscoveryFollowUpRepository implements DiscoveryFollowUpRepository {
  constructor(private readonly db: Db) {}

  async insert(input: Parameters<DiscoveryFollowUpRepository['insert']>[0]) {
    const row = first(
      await this.db
        .insert(discoveryFollowUps)
        .values({
          sessionId: input.sessionId,
          organizationId: input.organizationId,
          contactId: input.contactId ?? null,
          answerId: input.answerId ?? null,
          mappingId: input.mappingId ?? null,
          title: input.title,
          description: input.description ?? null,
          createdByUserId: input.createdByUserId ?? null,
        })
        .returning(),
    );
    return mapFollowUp(row);
  }
}

export class PostgresDiscoveryAuditAdapter implements DiscoveryAuditPort {
  constructor(private readonly db: Db) {}

  async append(event: Parameters<DiscoveryAuditPort['append']>[0]): Promise<void> {
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

export class PostgresDiscoveryOutboxAdapter implements DiscoveryOutboxPort {
  constructor(private readonly db: Db) {}

  async insert(event: Parameters<DiscoveryOutboxPort['insert']>[0]): Promise<void> {
    await this.db
      .insert(outboxEvents)
      .values({
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        idempotencyKey: event.idempotencyKey,
        payload: event.payload,
        metadata: event.metadata,
        status: 'pending',
      })
      .onConflictDoNothing({ target: outboxEvents.idempotencyKey });
  }
}

export class OperationalStateProspectStageAdapter implements ProspectStageTransitionPort {
  constructor(private readonly operationalState: OperationalStateService) {}

  async transitionToDiscoveryScheduled(input: {
    organizationId: string;
    expectedRecordVersion: number;
    actor: DiscoveryActor;
    commandCorrelationId?: string | null;
  }) {
    const result = await this.operationalState.transitionProspectStage({
      organizationId: input.organizationId,
      to: 'discovery_scheduled',
      expectedRecordVersion: input.expectedRecordVersion,
      actor: { type: 'user', userId: input.actor.userId },
      reasonCode: 'discovery_session_scheduled',
      commandCorrelationId: input.commandCorrelationId ?? null,
    });
    return { recordVersion: result.organization.recordVersion };
  }

  async transitionToDiscoveryCompleted(input: {
    organizationId: string;
    expectedRecordVersion: number;
    actor: DiscoveryActor;
    commandCorrelationId?: string | null;
  }) {
    const result = await this.operationalState.transitionProspectStage({
      organizationId: input.organizationId,
      to: 'discovery_completed',
      expectedRecordVersion: input.expectedRecordVersion,
      actor: { type: 'user', userId: input.actor.userId },
      reasonCode: 'discovery_session_completed',
      commandCorrelationId: input.commandCorrelationId ?? null,
    });
    return { recordVersion: result.organization.recordVersion };
  }
}

function mapTemplate(row: typeof discoveryTemplates.$inferSelect): DiscoveryTemplate {
  return {
    id: row.id,
    key: row.key,
    version: row.version,
    name: row.name,
    description: row.description,
    motion: row.motion,
    organizationType: row.organizationType,
    contactType: row.contactType,
    qualificationOutcomes: asArray(row.qualificationOutcomes),
    recommendationRules: asObject(row.recommendationRules),
    status: row.status,
  };
}

function mapQuestion(row: typeof discoveryQuestions.$inferSelect): DiscoveryQuestion {
  return {
    id: row.id,
    key: row.key,
    version: row.version,
    prompt: row.prompt,
    helpText: row.helpText,
    answerType: row.answerType,
    variableDefinitionId: row.variableDefinitionId,
    variableDefinitionVersionId: row.variableDefinitionVersionId,
    scoreImpact: asArray(row.scoreImpact),
    requiredDefault: row.requiredDefault,
    highImpact: row.highImpact,
    tags: asArray(row.tags),
    status: row.status,
  };
}

function mapAgenda(row: typeof discoveryAgendas.$inferSelect): DiscoveryAgenda {
  return {
    id: row.id,
    organizationId: row.organizationId,
    contactId: row.contactId,
    templateId: row.templateId,
    status: row.status,
    motion: row.motion,
    organizationType: row.organizationType,
    contactType: row.contactType,
    qualificationOutcome: row.qualificationOutcome,
    context: asObject(row.context),
    customizations: asArray(row.customizations),
    generatedByUserId: row.generatedByUserId,
    commandCorrelationId: row.commandCorrelationId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAgendaItem(row: typeof discoveryAgendaItems.$inferSelect): DiscoveryAgendaItem {
  return {
    id: row.id,
    agendaId: row.agendaId,
    questionId: row.questionId,
    prompt: row.prompt,
    reason: row.reason,
    reasonCode: row.reasonCode,
    variables: asArray(row.variables),
    scoresAffected: asArray(row.scoresAffected),
    priority: row.priority,
    required: row.required,
    deferred: row.deferred,
    displayOrder: row.displayOrder,
    metadata: asObject(row.metadata),
  };
}

function mapSession(row: typeof discoverySessions.$inferSelect): DiscoverySession {
  return {
    id: row.id,
    organizationId: row.organizationId,
    contactId: row.contactId,
    agendaId: row.agendaId,
    templateId: row.templateId,
    status: row.status,
    ownerUserId: row.ownerUserId,
    scheduledStartAt: row.scheduledStartAt,
    scheduledEndAt: row.scheduledEndAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    summary: asObject(row.summary),
    commandCorrelationId: row.commandCorrelationId,
    recordVersion: row.recordVersion,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAnswer(row: typeof discoveryAnswers.$inferSelect): DiscoveryAnswer {
  return {
    id: row.id,
    sessionId: row.sessionId,
    agendaItemId: row.agendaItemId,
    questionId: row.questionId,
    participantId: row.participantId,
    answerType: row.answerType,
    answerStatus: row.answerStatus,
    originalAnswer: row.originalAnswer,
    transcriptRef: row.transcriptRef,
    submittedByUserId: row.submittedByUserId,
    submittedAt: row.submittedAt,
    metadata: asObject(row.metadata),
  };
}

function mapInterpretation(
  row: typeof discoveryInterpretations.$inferSelect,
): DiscoveryInterpretation {
  return {
    id: row.id,
    answerId: row.answerId,
    version: row.version,
    normalizedValue: row.normalizedValue,
    variableDefinitionId: row.variableDefinitionId,
    variableDefinitionVersionId: row.variableDefinitionVersionId,
    confidence: row.confidence,
    rationale: row.rationale,
    status: row.status,
    proposedByUserId: row.proposedByUserId,
  };
}

function mapMapping(row: typeof discoveryMappings.$inferSelect): DiscoveryMapping {
  return {
    id: row.id,
    sessionId: row.sessionId,
    answerId: row.answerId,
    interpretationId: row.interpretationId,
    subjectType: asOrgOrContact(row.subjectType),
    organizationId: row.organizationId,
    contactId: row.contactId,
    variableDefinitionId: row.variableDefinitionId,
    variableDefinitionVersionId: row.variableDefinitionVersionId,
    proposedTypedValue: row.proposedTypedValue,
    evidenceRecordId: row.evidenceRecordId,
    variableValueId: row.variableValueId,
    status: row.status,
    reviewReason: row.reviewReason,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
  };
}

function mapSnapshot(row: typeof discoveryScoreSnapshots.$inferSelect): DiscoveryScoreSnapshot {
  return {
    id: row.id,
    sessionId: row.sessionId,
    mappingId: row.mappingId,
    subjectType: asOrgOrContact(row.subjectType),
    organizationId: row.organizationId,
    contactId: row.contactId,
    scoreKey: row.scoreKey,
    beforeScoreResultId: row.beforeScoreResultId,
    afterScoreResultId: row.afterScoreResultId,
    beforeSnapshot: asObject(row.beforeSnapshot),
    afterSnapshot: asObject(row.afterSnapshot),
    recommendationMovement: asObject(row.recommendationMovement),
    durationMs: row.durationMs,
  };
}

function mapFollowUp(row: typeof discoveryFollowUps.$inferSelect): DiscoveryFollowUp {
  return {
    id: row.id,
    sessionId: row.sessionId,
    organizationId: row.organizationId,
    contactId: row.contactId,
    title: row.title,
    description: row.description,
    status: row.status,
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asOrgOrContact(value: string): 'organization' | 'contact' {
  if (value === 'organization' || value === 'contact') return value;
  throw new Error(`Unexpected discovery subject type: ${value}`);
}
