import { AppError } from '@adp/platform';

import {
  subjectColumns,
  type EvidenceType,
  type JsonObject,
  type SubjectRef,
} from '../domain/evidence.js';
import {
  AllowListCapabilityChecker,
  type CapabilityActor,
  type CapabilityChecker,
  type EvidenceAuditPort,
  type EvidenceOutboxPort,
  type ResearchObservation,
  type ResearchObservationRepository,
  type VariableValueCommandPort,
} from '../domain/ports.js';

export type CreateResearchObservationCommand = SubjectRef & {
  claim: string;
  evidenceId?: string | null;
  proposedDefinitionVersionId?: string | null;
  proposedTypedValue?: unknown;
  normalizedInterpretation?: string | null;
  correlationId?: string | null;
  actor: CapabilityActor;
};

export class ResearchObservationService {
  constructor(
    private readonly observations: ResearchObservationRepository,
    private readonly variableValues: VariableValueCommandPort,
    private readonly authz: CapabilityChecker = new AllowListCapabilityChecker(),
    private readonly audit?: EvidenceAuditPort,
    private readonly outbox?: EvidenceOutboxPort,
  ) {}

  async create(command: CreateResearchObservationCommand): Promise<ResearchObservation> {
    await this.authz.assertCan(command.actor, 'observation:create');
    if (command.claim.trim() === '') {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Observation claim must not be blank',
      });
    }
    if (command.correlationId !== undefined && command.correlationId !== null) {
      const existing = await this.observations.findByCorrelationId(command.correlationId);
      if (existing !== null) return existing;
    }

    return this.observations.insert({
      ...subjectColumns(command),
      claim: command.claim,
      evidenceId: command.evidenceId ?? null,
      proposedDefinitionVersionId: command.proposedDefinitionVersionId ?? null,
      proposedTypedValue: command.proposedTypedValue ?? null,
      normalizedInterpretation: command.normalizedInterpretation ?? null,
      proposingUserId: command.actor.userId,
      correlationId: command.correlationId ?? null,
    });
  }

  async accept(command: {
    observationId: string;
    evidenceType: EvidenceType;
    reviewUserId: string | null;
    decisionReason?: string | null;
    actor: CapabilityActor;
    correlationId?: string | null;
    metadata?: JsonObject;
  }): Promise<ResearchObservation> {
    await this.authz.assertCan(command.actor, 'observation:accept');
    const observation = await this.getObservation(command.observationId);
    if (observation.lifecycleStatus === 'accepted') return observation;
    if (observation.lifecycleStatus !== 'proposed') {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Only proposed observations can be accepted',
        details: { observationId: observation.id, lifecycleStatus: observation.lifecycleStatus },
      });
    }
    if (observation.proposedDefinitionVersionId === null) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Accepted observations require a proposed definition version',
        details: { observationId: observation.id },
      });
    }

    const value = await this.variableValues.confirmValue({
      subject:
        observation.subjectType === 'organization'
          ? { subjectType: 'organization', organizationId: observation.organizationId }
          : { subjectType: 'contact', contactId: observation.contactId },
      definitionVersionId: observation.proposedDefinitionVersionId,
      typedValue: observation.proposedTypedValue,
      evidenceType: command.evidenceType,
      actorUserId: command.actor.userId,
      correlationId: command.correlationId ?? observation.correlationId,
      evidenceRecordId: observation.evidenceId,
      observedAt: null,
    });

    const accepted = await this.observations.decide({
      id: observation.id,
      lifecycleStatus: 'accepted',
      reviewUserId: command.reviewUserId,
      decisionReason: command.decisionReason ?? null,
      decidedAt: new Date(),
      resultingVariableValueId: value.valueId,
    });
    if (accepted === null) throw notFound(command.observationId);
    await this.emitDecision(
      accepted,
      'observation.accepted',
      command.actor.userId,
      command.metadata ?? {},
    );
    return accepted;
  }

  async reject(command: {
    observationId: string;
    reviewUserId: string | null;
    decisionReason: string;
    actor: CapabilityActor;
  }): Promise<ResearchObservation> {
    await this.authz.assertCan(command.actor, 'observation:reject');
    const rejected = await this.decideWithoutValue(command, 'rejected');
    await this.emitDecision(rejected, 'observation.rejected', command.actor.userId, {});
    return rejected;
  }

  async markContradicted(command: {
    observationId: string;
    reviewUserId: string | null;
    decisionReason: string;
    actor: CapabilityActor;
  }): Promise<ResearchObservation> {
    await this.authz.assertCan(command.actor, 'observation:contradict');
    return this.decideWithoutValue(command, 'contradicted');
  }

  private async decideWithoutValue(
    command: {
      observationId: string;
      reviewUserId: string | null;
      decisionReason: string;
    },
    lifecycleStatus: 'rejected' | 'contradicted',
  ): Promise<ResearchObservation> {
    const observation = await this.getObservation(command.observationId);
    if (observation.lifecycleStatus === lifecycleStatus) return observation;
    if (observation.lifecycleStatus !== 'proposed') {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Only proposed observations can be decided',
        details: { observationId: observation.id, lifecycleStatus: observation.lifecycleStatus },
      });
    }
    const decided = await this.observations.decide({
      id: observation.id,
      lifecycleStatus,
      reviewUserId: command.reviewUserId,
      decisionReason: command.decisionReason,
      decidedAt: new Date(),
      resultingVariableValueId: null,
    });
    if (decided === null) throw notFound(command.observationId);
    return decided;
  }

  private async getObservation(observationId: string): Promise<ResearchObservation> {
    const observation = await this.observations.findById(observationId);
    if (observation === null) throw notFound(observationId);
    return observation;
  }

  private async emitDecision(
    observation: ResearchObservation,
    eventType: 'observation.accepted' | 'observation.rejected',
    actorUserId: string | null,
    metadata: JsonObject,
  ): Promise<void> {
    const aggregateId =
      observation.subjectType === 'organization'
        ? observation.organizationId
        : observation.contactId;
    await this.audit?.append({
      actorUserId,
      action: eventType.replace('.', '_'),
      subjectType: observation.subjectType,
      subjectId: aggregateId,
      correlationId: observation.correlationId,
      metadata: { ...metadata, observationId: observation.id, envelopeVersion: 1 },
    });
    await this.outbox?.insert({
      aggregateType: observation.subjectType,
      aggregateId,
      eventType,
      idempotencyKey: observation.correlationId ?? `${eventType}:${observation.id}`,
      payload: {
        observationId: observation.id,
        resultingVariableValueId: observation.resultingVariableValueId,
      },
      metadata: { envelopeVersion: 1 },
    });
  }
}

function notFound(observationId: string): AppError {
  return new AppError({
    code: 'NOT_FOUND',
    message: 'Research observation not found',
    details: { observationId },
  });
}
