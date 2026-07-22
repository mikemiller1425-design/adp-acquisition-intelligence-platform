import { AppError } from '@adp/platform';

import {
  columnForDimension,
  ruleForTransition,
} from '../domain/operational-state.js';
import type {
  DataFreshnessStatus,
  OperationalDimension,
  OperationalStateValue,
  OutreachStatus,
  ProspectStage,
  ResearchStatus,
  TransitionRule,
} from '../domain/operational-state.js';
import type {
  OperationalStateAuditPort,
  OperationalStateOutboxPort,
  OperationalStateTransition,
  OperationalStateTransitionRepository,
  OrganizationState,
  OrganizationStateWriter,
  TransitionActor,
} from '../domain/ports.js';

type TransitionCommand<TValue extends OperationalStateValue> = {
  organizationId: string;
  to: TValue;
  expectedRecordVersion: number;
  actor: TransitionActor;
  reasonCode?: string | null;
  reasonNote?: string | null;
  exceptionAuthorized?: boolean;
  commandCorrelationId?: string | null;
  relatedReviewId?: string | null;
};

export type TransitionResult = {
  organization: OrganizationState;
  transition: OperationalStateTransition;
};

export class OperationalStateService {
  constructor(
    private readonly organizations: OrganizationStateWriter,
    private readonly transitions: OperationalStateTransitionRepository,
    private readonly audit?: OperationalStateAuditPort,
    private readonly outbox?: OperationalStateOutboxPort,
  ) {}

  async transitionProspectStage(command: TransitionCommand<ProspectStage>): Promise<TransitionResult> {
    return this.transition('prospect_stage', command);
  }

  async transitionResearchStatus(command: TransitionCommand<ResearchStatus>): Promise<TransitionResult> {
    return this.transition('research_status', command);
  }

  async transitionOutreachStatus(command: TransitionCommand<OutreachStatus>): Promise<TransitionResult> {
    return this.transition('outreach_status', command);
  }

  async recomputeDataFreshness(command: TransitionCommand<DataFreshnessStatus>): Promise<TransitionResult> {
    return this.transition('data_freshness_status', command);
  }

  private async transition<TValue extends OperationalStateValue>(
    dimension: OperationalDimension,
    command: TransitionCommand<TValue>,
  ): Promise<TransitionResult> {
    const existing = await this.findExistingTransition(dimension, command);
    if (existing !== null) {
      const organization = await this.organizations.findOrganizationState(command.organizationId);
      if (organization === null) throw this.notFound(command.organizationId);
      return { organization, transition: existing };
    }

    const current = await this.organizations.findOrganizationState(command.organizationId);
    if (current === null) throw this.notFound(command.organizationId);
    if (current.recordStatus === 'archived') {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Cannot transition an archived organization',
        details: { organizationId: command.organizationId },
      });
    }
    if (current.recordVersion !== command.expectedRecordVersion) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Organization record version conflict',
        details: {
          organizationId: command.organizationId,
          expectedRecordVersion: command.expectedRecordVersion,
        },
      });
    }

    const fromValue = current[columnForDimension(dimension)];
    if (fromValue === command.to) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'No-op state transitions are rejected; reuse the original correlation id for retries',
        details: { organizationId: command.organizationId, dimension, value: command.to },
      });
    }

    const rule = ruleForTransition(dimension, fromValue, command.to);
    if (rule === null) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Operational state transition is not allowed by the matrix',
        details: { organizationId: command.organizationId, dimension, fromValue, toValue: command.to },
      });
    }
    this.assertRuleAllowed(rule, dimension, command);

    const updated = await this.organizations.updateOrganizationStateIfVersion({
      organizationId: command.organizationId,
      dimension,
      toValue: command.to,
      expectedRecordVersion: command.expectedRecordVersion,
    });
    if (updated === null) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Organization record version conflict',
        details: {
          organizationId: command.organizationId,
          expectedRecordVersion: command.expectedRecordVersion,
        },
      });
    }

    const transition = await this.transitions.insert({
      subjectType: 'organization',
      subjectId: command.organizationId,
      dimension,
      fromValue,
      toValue: command.to,
      actorUserId: command.actor.userId,
      actorType: command.actor.type,
      reasonCode: command.reasonCode ?? null,
      reasonNote: command.reasonNote ?? null,
      commandCorrelationId: command.commandCorrelationId ?? null,
      validationResult: { rule },
      exceptionAuthorized: command.exceptionAuthorized ?? false,
      relatedReviewId: command.relatedReviewId ?? null,
    });

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'operational_state_transitioned',
      subjectType: 'organization',
      subjectId: command.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: { dimension, fromValue, toValue: command.to, rule },
    });
    await this.outbox?.insert({
      aggregateType: 'organization',
      aggregateId: command.organizationId,
      eventType: 'operational_state.transitioned',
      idempotencyKey:
        command.commandCorrelationId ?? `${command.organizationId}:${dimension}:${transition.id}`,
      payload: { organizationId: command.organizationId, dimension, fromValue, toValue: command.to },
      metadata: { transitionId: transition.id },
    });

    return { organization: updated, transition };
  }

  private async findExistingTransition<TValue extends OperationalStateValue>(
    dimension: OperationalDimension,
    command: TransitionCommand<TValue>,
  ): Promise<OperationalStateTransition | null> {
    if (command.commandCorrelationId === undefined || command.commandCorrelationId === null) {
      return null;
    }
    const existing = await this.transitions.findByCorrelationId({
      subjectType: 'organization',
      subjectId: command.organizationId,
      dimension,
      commandCorrelationId: command.commandCorrelationId,
    });
    if (existing !== null && existing.toValue !== command.to) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Correlation id was already used for a different transition target',
        details: {
          organizationId: command.organizationId,
          dimension,
          commandCorrelationId: command.commandCorrelationId,
          existingToValue: existing.toValue,
          requestedToValue: command.to,
        },
      });
    }
    return existing;
  }

  private assertRuleAllowed<TValue extends OperationalStateValue>(
    rule: TransitionRule,
    dimension: OperationalDimension,
    command: TransitionCommand<TValue>,
  ): void {
    if (rule === 'R' && (command.reasonCode === undefined || command.reasonCode === null)) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Transition requires a structured reason',
        details: { dimension, toValue: command.to },
      });
    }
    if (rule === 'R' && command.exceptionAuthorized !== true) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Transition requires elevated exception authorization',
        details: { dimension, toValue: command.to },
      });
    }
    if (rule === 'S' && command.actor.type !== 'system') {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Transition is system-only',
        details: { dimension, toValue: command.to },
      });
    }
    if (
      dimension === 'data_freshness_status' &&
      command.to === 'current' &&
      command.actor.type !== 'system'
    ) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Humans cannot mark data freshness current',
        details: { dimension, toValue: command.to },
      });
    }
  }

  private notFound(organizationId: string): AppError {
    return new AppError({
      code: 'NOT_FOUND',
      message: 'Organization not found',
      details: { organizationId },
    });
  }
}
