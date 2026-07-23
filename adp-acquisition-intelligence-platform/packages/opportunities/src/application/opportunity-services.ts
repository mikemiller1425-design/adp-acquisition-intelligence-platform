import { AppError } from '@adp/platform';

import {
  actorHasRole,
  closeOutcomeStage,
  evaluateEligibility,
  evaluateRiskRules,
  isTerminalStage,
  reopenTargetStage,
  ruleForOpportunityTransition,
  validateProbabilityInput,
  validateValueInput,
  type OpportunityActor,
  type OpportunityContactRole,
  type OpportunityStage,
} from '../domain/opportunity.js';
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
  OpportunityRecord,
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

function assertRole(
  actor: OpportunityActor,
  allowed: readonly OpportunityActor['roles'][number][],
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

function validation(message: string, details: Record<string, unknown>): AppError {
  return new AppError({ code: 'VALIDATION_FAILED', message, details });
}

export class EligibilityService {
  constructor(
    private readonly organizations: OrganizationContextPort,
    private readonly assessments: EligibilityAssessmentRepository,
    private readonly audit?: OpportunityAuditPort,
  ) {}

  async assess(command: { organizationId: string; motion: string; actor: OpportunityActor }) {
    assertRole(command.actor, ['admin', 'sales', 'reviewer'], 'assess opportunity eligibility');
    const org = await this.organizations.findOrganizationContext(command.organizationId);
    if (org === null) throw notFound('Organization not found', command.organizationId);

    const result = evaluateEligibility({
      prospectStage: org.prospectStage,
      recordStatus: org.recordStatus,
      existingRelationshipFlag: org.existingRelationshipFlag,
      ownerUserId: org.ownerUserId,
      motion: command.motion,
    });

    const saved = await this.assessments.saveAssessment({
      organizationId: command.organizationId,
      motion: command.motion,
      eligible: result.eligible,
      reasons: result.reasons,
      assessedByUserId: command.actor.userId,
    });

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'opportunity.eligibility_assessed',
      subjectType: 'organization',
      subjectId: command.organizationId,
      organizationId: command.organizationId,
      metadata: { assessmentId: saved.id, ...result },
    });

    return { ...result, assessmentId: saved.id };
  }
}

export class OpportunityService {
  constructor(
    private readonly organizations: OrganizationContextPort,
    private readonly opportunities: OpportunityRepository,
    private readonly eligibility: EligibilityService,
    private readonly operationalState: OperationalStateOpportunityPort,
    private readonly stageDefinitions: StageDefinitionRepository,
    private readonly probabilities: ProbabilityRepository,
    private readonly history: HistoryRepository,
    private readonly contextLinks: ContextLinkRepository,
    private readonly audit?: OpportunityAuditPort,
    private readonly outbox?: OpportunityOutboxPort,
  ) {}

  async create(command: {
    organizationId: string;
    primaryMotion: string;
    name: string;
    description?: string | null;
    ownerUserId?: string | null;
    humanConfirmation: boolean;
    actor: OpportunityActor;
    contextLinks?: Array<{
      linkType: string;
      linkedSubjectType: 'organization' | 'opportunity' | 'contact' | 'user' | 'system';
      linkedSubjectId: string;
      metadata?: Record<string, unknown>;
    }>;
    commandCorrelationId?: string | null;
  }): Promise<OpportunityRecord> {
    assertRole(command.actor, ['admin', 'sales'], 'create opportunity');
    if (!command.humanConfirmation) {
      throw validation('Human confirmation is required to create an opportunity', {
        humanConfirmation: command.humanConfirmation,
      });
    }

    const assessment = await this.eligibility.assess({
      organizationId: command.organizationId,
      motion: command.primaryMotion,
      actor: command.actor,
    });
    if (!assessment.eligible) {
      throw validation('Organization is not eligible for opportunity creation', {
        reasons: assessment.reasons,
      });
    }

    const existing = await this.opportunities.findActiveByOrganizationAndMotion(
      command.organizationId,
      command.primaryMotion,
    );
    if (existing !== null) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'An active opportunity already exists for this organization and motion',
        details: {
          organizationId: command.organizationId,
          primaryMotion: command.primaryMotion,
          existingOpportunityId: existing.id,
        },
      });
    }

    const org = await this.organizations.findOrganizationContext(command.organizationId);
    if (org === null) throw notFound('Organization not found', command.organizationId);

    const opportunity = await this.opportunities.insert({
      organizationId: command.organizationId,
      primaryMotion: command.primaryMotion,
      name: command.name,
      description: command.description ?? null,
      ownerUserId: command.ownerUserId ?? org.ownerUserId,
      humanConfirmedByUserId: command.actor.userId,
      createdByUserId: command.actor.userId,
    });

    const stageDef = await this.stageDefinitions.findActiveByStage('open');
    if (stageDef?.defaultProbability !== null && stageDef?.defaultProbability !== undefined) {
      await this.probabilities.insert({
        opportunityId: opportunity.id,
        probability: stageDef.defaultProbability,
        source: 'stage_default',
        stageKey: 'open',
        setByUserId: command.actor.userId,
      });
    }

    if (org.prospectStage !== 'opportunity') {
      await this.operationalState.transitionProspectToOpportunity({
        organizationId: command.organizationId,
        expectedRecordVersion: org.recordVersion,
        actorUserId: command.actor.userId,
        commandCorrelationId: command.commandCorrelationId ?? null,
      });
    }

    for (const link of command.contextLinks ?? []) {
      await this.contextLinks.link({
        opportunityId: opportunity.id,
        ...link,
      });
    }

    await this.history.append({
      opportunityId: opportunity.id,
      changeType: 'created',
      newValue: {
        primaryMotion: command.primaryMotion,
        name: command.name,
        stage: 'open',
      },
      actorUserId: command.actor.userId,
      commandCorrelationId: command.commandCorrelationId ?? null,
    });

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'opportunity.created',
      subjectType: 'opportunity',
      subjectId: opportunity.id,
      organizationId: command.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: { primaryMotion: command.primaryMotion, name: command.name },
    });
    await this.outbox?.insert({
      aggregateType: 'opportunity',
      aggregateId: opportunity.id,
      eventType: 'opportunity.created',
      idempotencyKey:
        command.commandCorrelationId ?? `${opportunity.id}:created:${opportunity.recordVersion}`,
      payload: {
        opportunityId: opportunity.id,
        organizationId: command.organizationId,
        primaryMotion: command.primaryMotion,
      },
    });

    return opportunity;
  }
}

export class ContactRoleService {
  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly contacts: ContactRoleRepository,
    private readonly audit?: OpportunityAuditPort,
  ) {}

  async assign(command: {
    opportunityId: string;
    contactId: string;
    role: OpportunityContactRole;
    isPrimary?: boolean;
    actor: OpportunityActor;
  }) {
    assertRole(command.actor, ['admin', 'sales'], 'assign opportunity contact role');
    const opportunity = await this.opportunities.findById(command.opportunityId);
    if (opportunity === null) throw notFound('Opportunity not found', command.opportunityId);
    if (isTerminalStage(opportunity.opportunityStage)) {
      throw validation('Cannot assign contacts to a terminal opportunity', {
        opportunityId: command.opportunityId,
        stage: opportunity.opportunityStage,
      });
    }

    const assignment = await this.contacts.assignContact({
      opportunityId: command.opportunityId,
      contactId: command.contactId,
      role: command.role,
      isPrimary: command.isPrimary ?? false,
      createdByUserId: command.actor.userId,
    });

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'opportunity.contact_assigned',
      subjectType: 'opportunity',
      subjectId: command.opportunityId,
      organizationId: opportunity.organizationId,
      metadata: { assignmentId: assignment.id, role: command.role },
    });

    return assignment;
  }
}

export class StageTransitionService {
  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly transitions: StageTransitionRepository,
    private readonly operationalState: OperationalStateOpportunityPort,
    private readonly stageDefinitions: StageDefinitionRepository,
    private readonly probabilities: ProbabilityRepository,
    private readonly riskFlags: RiskFlagRepository,
    private readonly history: HistoryRepository,
    private readonly audit?: OpportunityAuditPort,
    private readonly outbox?: OpportunityOutboxPort,
  ) {}

  async advance(command: {
    opportunityId: string;
    toStage: OpportunityStage;
    actor: OpportunityActor;
    reasonCode?: string | null;
    reasonNote?: string | null;
    exceptionAuthorized?: boolean;
    commandCorrelationId?: string | null;
  }) {
    assertRole(command.actor, ['admin', 'sales', 'reviewer'], 'transition opportunity stage');
    const opportunity = await this.requireActiveOpportunity(command.opportunityId);
    const fromStage = opportunity.opportunityStage;

    if (command.commandCorrelationId) {
      const existing = await this.transitions.findByCorrelationId({
        opportunityId: command.opportunityId,
        commandCorrelationId: command.commandCorrelationId,
      });
      if (existing !== null) {
        if (existing.toStage !== command.toStage) {
          throw validation('Correlation id reused with different target stage', {
            commandCorrelationId: command.commandCorrelationId,
          });
        }
        return { opportunity, transitionId: existing.id };
      }
    }

    if (fromStage === command.toStage) {
      throw validation('No-op stage transitions are rejected', {
        opportunityId: command.opportunityId,
        stage: command.toStage,
      });
    }

    const rule = ruleForOpportunityTransition(fromStage, command.toStage);
    if (rule === null) {
      throw validation('Opportunity stage transition is not allowed by the matrix', {
        fromStage,
        toStage: command.toStage,
      });
    }
    if (isTerminalStage(fromStage) && !command.exceptionAuthorized && command.toStage === 'open') {
      throw validation('Reopening a terminal opportunity requires authorized exception', {
        fromStage,
        toStage: command.toStage,
      });
    }
    if (
      rule === 'R' &&
      !command.exceptionAuthorized &&
      !actorHasRole(command.actor, ['admin', 'reviewer'])
    ) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'This stage transition requires reviewer authorization or exception',
        details: { fromStage, toStage: command.toStage, rule },
      });
    }
    if (rule === 'R' && (command.reasonCode === undefined || command.reasonCode === null)) {
      throw validation('Reason code is required for restricted stage transitions', {
        fromStage,
        toStage: command.toStage,
      });
    }

    const openRiskCount = await this.riskFlags.countOpen(command.opportunityId);
    const stageDef = await this.stageDefinitions.findActiveByStage(fromStage);
    const riskEvaluation = evaluateRiskRules({
      stage: fromStage,
      openRiskFlagCount: openRiskCount,
      daysInStage: null,
      maxAgeDays: stageDef?.maxAgeDays ?? null,
    });
    if (
      riskEvaluation.some((flag) => flag.flagKey === 'open_risk_flags_present') &&
      !command.exceptionAuthorized
    ) {
      throw validation('Open risk flags block stage advancement without authorized exception', {
        opportunityId: command.opportunityId,
        openRiskFlagCount: openRiskCount,
      });
    }

    const updated = await this.opportunities.updateStageIfVersion({
      opportunityId: command.opportunityId,
      toStage: command.toStage,
      expectedRecordVersion: opportunity.recordVersion,
      updatedByUserId: command.actor.userId,
    });
    if (updated === null) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Opportunity record version conflict',
        details: { opportunityId: command.opportunityId },
      });
    }

    const transition = await this.transitions.insert({
      opportunityId: command.opportunityId,
      fromStage,
      toStage: command.toStage,
      actorUserId: command.actor.userId,
      reasonCode: command.reasonCode ?? null,
      reasonNote: command.reasonNote ?? null,
      commandCorrelationId: command.commandCorrelationId ?? null,
      validationResult: { rule, riskEvaluation },
      exceptionAuthorized: command.exceptionAuthorized ?? false,
    });

    await this.operationalState.transitionOpportunityStage({
      opportunityId: command.opportunityId,
      fromValue: fromStage,
      toValue: command.toStage,
      actorUserId: command.actor.userId,
      reasonCode: command.reasonCode ?? null,
      reasonNote: command.reasonNote ?? null,
      commandCorrelationId: command.commandCorrelationId ?? null,
      validationResult: { rule },
      exceptionAuthorized: command.exceptionAuthorized ?? false,
    });

    const nextStageDef = await this.stageDefinitions.findActiveByStage(command.toStage);
    if (
      nextStageDef?.defaultProbability !== null &&
      nextStageDef?.defaultProbability !== undefined
    ) {
      await this.probabilities.closeCurrent(command.opportunityId);
      await this.probabilities.insert({
        opportunityId: command.opportunityId,
        probability: nextStageDef.defaultProbability,
        source: 'stage_default',
        stageKey: command.toStage,
        setByUserId: command.actor.userId,
      });
    }

    await this.history.append({
      opportunityId: command.opportunityId,
      changeType: 'stage_transition',
      fieldName: 'opportunity_stage',
      priorValue: fromStage,
      newValue: command.toStage,
      actorUserId: command.actor.userId,
      commandCorrelationId: command.commandCorrelationId ?? null,
    });

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'opportunity.stage_transitioned',
      subjectType: 'opportunity',
      subjectId: command.opportunityId,
      organizationId: opportunity.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: { fromStage, toStage: command.toStage, transitionId: transition.id },
    });
    await this.outbox?.insert({
      aggregateType: 'opportunity',
      aggregateId: command.opportunityId,
      eventType: 'opportunity.stage_transitioned',
      idempotencyKey:
        command.commandCorrelationId ?? `${command.opportunityId}:stage:${transition.id}`,
      payload: { opportunityId: command.opportunityId, fromStage, toStage: command.toStage },
      metadata: { transitionId: transition.id },
    });

    return { opportunity: updated, transitionId: transition.id };
  }

  private async requireActiveOpportunity(opportunityId: string): Promise<OpportunityRecord> {
    const opportunity = await this.opportunities.findById(opportunityId);
    if (opportunity === null) throw notFound('Opportunity not found', opportunityId);
    return opportunity;
  }
}

export class ValueService {
  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly values: ValueRepository,
    private readonly history: HistoryRepository,
    private readonly audit?: OpportunityAuditPort,
  ) {}

  async setValue(command: {
    opportunityId: string;
    amount: string | null;
    currency: string | null;
    valueBand?: string | null;
    reasonNote?: string | null;
    actor: OpportunityActor;
  }) {
    assertRole(command.actor, ['admin', 'sales'], 'set opportunity value');
    const opportunity = await this.opportunities.findById(command.opportunityId);
    if (opportunity === null) throw notFound('Opportunity not found', command.opportunityId);

    const validationResult = validateValueInput({
      amount: command.amount,
      currency: command.currency,
    });
    if (!validationResult.ok) {
      throw validation(validationResult.message, { code: validationResult.code });
    }

    const prior = await this.values.findCurrent(command.opportunityId);
    await this.values.closeCurrent(command.opportunityId);
    const saved = await this.values.insert({
      opportunityId: command.opportunityId,
      amount: command.amount,
      currency: command.currency,
      valueBand: command.valueBand ?? null,
      source: 'manual',
      setByUserId: command.actor.userId,
      reasonNote: command.reasonNote ?? null,
    });

    await this.history.append({
      opportunityId: command.opportunityId,
      changeType: 'value_updated',
      fieldName: 'value',
      priorValue: prior,
      newValue: {
        amount: command.amount,
        currency: command.currency,
        valueBand: command.valueBand,
      },
      actorUserId: command.actor.userId,
    });
    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'opportunity.value_set',
      subjectType: 'opportunity',
      subjectId: command.opportunityId,
      organizationId: opportunity.organizationId,
      metadata: { valueId: saved.id },
    });

    return { valueId: saved.id };
  }
}

export class ProbabilityService {
  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly probabilities: ProbabilityRepository,
    private readonly history: HistoryRepository,
    private readonly audit?: OpportunityAuditPort,
  ) {}

  async setProbability(command: {
    opportunityId: string;
    probability: string | null;
    source: 'manual' | 'stage_default';
    reasonNote?: string | null;
    actor: OpportunityActor;
  }) {
    assertRole(command.actor, ['admin', 'sales', 'reviewer'], 'set opportunity probability');
    const opportunity = await this.opportunities.findById(command.opportunityId);
    if (opportunity === null) throw notFound('Opportunity not found', command.opportunityId);

    const validationResult = validateProbabilityInput({
      probability: command.probability,
      source: command.source,
      reasonNote: command.reasonNote ?? null,
    });
    if (!validationResult.ok) {
      throw validation(validationResult.message, { code: validationResult.code });
    }

    const prior = await this.probabilities.findCurrent(command.opportunityId);
    await this.probabilities.closeCurrent(command.opportunityId);
    const saved = await this.probabilities.insert({
      opportunityId: command.opportunityId,
      probability: command.probability,
      source: command.source,
      stageKey: opportunity.opportunityStage,
      setByUserId: command.actor.userId,
      reasonNote: command.reasonNote ?? null,
    });

    await this.history.append({
      opportunityId: command.opportunityId,
      changeType: 'probability_updated',
      fieldName: 'probability',
      priorValue: prior,
      newValue: { probability: command.probability, source: command.source },
      actorUserId: command.actor.userId,
    });
    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'opportunity.probability_set',
      subjectType: 'opportunity',
      subjectId: command.opportunityId,
      organizationId: opportunity.organizationId,
      metadata: { probabilityId: saved.id, source: command.source },
    });

    return { probabilityId: saved.id };
  }
}

export class NextActionService {
  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly nextActions: NextActionRepository,
    private readonly audit?: OpportunityAuditPort,
  ) {}

  async create(command: {
    opportunityId: string;
    title: string;
    description?: string | null;
    dueAt?: Date | null;
    assignedToUserId?: string | null;
    actor: OpportunityActor;
  }) {
    assertRole(command.actor, ['admin', 'sales'], 'create opportunity next action');
    const opportunity = await this.opportunities.findById(command.opportunityId);
    if (opportunity === null) throw notFound('Opportunity not found', command.opportunityId);

    const action = await this.nextActions.create({
      opportunityId: command.opportunityId,
      title: command.title,
      description: command.description ?? null,
      dueAt: command.dueAt ?? null,
      assignedToUserId: command.assignedToUserId ?? opportunity.ownerUserId,
      createdByUserId: command.actor.userId,
    });

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'opportunity.next_action_created',
      subjectType: 'opportunity',
      subjectId: command.opportunityId,
      organizationId: opportunity.organizationId,
      metadata: { actionId: action.id },
    });

    return action;
  }

  async complete(command: { actionId: string; opportunityId: string; actor: OpportunityActor }) {
    assertRole(command.actor, ['admin', 'sales'], 'complete opportunity next action');
    await this.nextActions.complete({
      actionId: command.actionId,
      completedByUserId: command.actor.userId,
    });
    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'opportunity.next_action_completed',
      subjectType: 'opportunity',
      subjectId: command.opportunityId,
      metadata: { actionId: command.actionId },
    });
  }
}

export class RiskFlagService {
  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly riskFlags: RiskFlagRepository,
    private readonly audit?: OpportunityAuditPort,
  ) {}

  async raise(command: {
    opportunityId: string;
    flagKey: string;
    severity?: string;
    description: string;
    actor: OpportunityActor;
  }) {
    assertRole(command.actor, ['admin', 'sales', 'reviewer'], 'raise opportunity risk flag');
    const opportunity = await this.opportunities.findById(command.opportunityId);
    if (opportunity === null) throw notFound('Opportunity not found', command.opportunityId);

    const flag = await this.riskFlags.raise({
      opportunityId: command.opportunityId,
      flagKey: command.flagKey,
      severity: command.severity ?? 'medium',
      description: command.description,
      raisedByUserId: command.actor.userId,
    });

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'opportunity.risk_flag_raised',
      subjectType: 'opportunity',
      subjectId: command.opportunityId,
      organizationId: opportunity.organizationId,
      metadata: { flagId: flag.id, flagKey: command.flagKey },
    });

    return flag;
  }

  async resolve(command: { flagId: string; opportunityId: string; actor: OpportunityActor }) {
    assertRole(command.actor, ['admin', 'sales', 'reviewer'], 'resolve opportunity risk flag');
    await this.riskFlags.resolve({
      flagId: command.flagId,
      resolvedByUserId: command.actor.userId,
    });
    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'opportunity.risk_flag_resolved',
      subjectType: 'opportunity',
      subjectId: command.opportunityId,
      metadata: { flagId: command.flagId },
    });
  }
}

export class CloseService {
  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly outcomes: OutcomeRepository,
    private readonly lossReasons: LossReasonRepository,
    private readonly stageTransitions: StageTransitionService,
    private readonly history: HistoryRepository,
    private readonly audit?: OpportunityAuditPort,
    private readonly outbox?: OpportunityOutboxPort,
  ) {}

  async closeWon(command: {
    opportunityId: string;
    notes?: string | null;
    actor: OpportunityActor;
    commandCorrelationId?: string | null;
  }) {
    return this.close({
      ...command,
      outcomeType: 'won',
    });
  }

  async closeLost(command: {
    opportunityId: string;
    lossReasonKey: string;
    notes?: string | null;
    actor: OpportunityActor;
    commandCorrelationId?: string | null;
  }) {
    const lossReason = await this.lossReasons.findActiveByKey(command.lossReasonKey);
    if (lossReason === null) {
      throw validation('Loss reason is required and must be active', {
        lossReasonKey: command.lossReasonKey,
      });
    }
    return this.close({
      opportunityId: command.opportunityId,
      outcomeType: 'lost',
      lossReasonId: lossReason.id,
      notes: command.notes ?? null,
      actor: command.actor,
      commandCorrelationId: command.commandCorrelationId ?? null,
    });
  }

  async nurture(command: {
    opportunityId: string;
    reasonCode: string;
    reasonNote?: string | null;
    actor: OpportunityActor;
    commandCorrelationId?: string | null;
  }) {
    return this.close({
      opportunityId: command.opportunityId,
      outcomeType: 'nurture',
      notes: command.reasonNote ?? null,
      actor: command.actor,
      commandCorrelationId: command.commandCorrelationId ?? null,
      reasonCode: command.reasonCode,
    });
  }

  private async close(command: {
    opportunityId: string;
    outcomeType: 'won' | 'lost' | 'nurture';
    lossReasonId?: string;
    notes?: string | null;
    actor: OpportunityActor;
    commandCorrelationId?: string | null;
    reasonCode?: string;
  }) {
    assertRole(command.actor, ['admin', 'sales', 'reviewer'], 'close opportunity');
    const opportunity = await this.opportunities.findById(command.opportunityId);
    if (opportunity === null) throw notFound('Opportunity not found', command.opportunityId);
    if (isTerminalStage(opportunity.opportunityStage)) {
      throw validation('Opportunity is already in a terminal stage', {
        stage: opportunity.opportunityStage,
      });
    }

    const targetStage = closeOutcomeStage(command.outcomeType);
    await this.stageTransitions.advance({
      opportunityId: command.opportunityId,
      toStage: targetStage,
      actor: command.actor,
      reasonCode: command.reasonCode ?? command.outcomeType,
      reasonNote: command.notes ?? null,
      commandCorrelationId: command.commandCorrelationId ?? null,
    });

    const outcome = await this.outcomes.insert({
      opportunityId: command.opportunityId,
      outcomeType: command.outcomeType,
      lossReasonId: command.lossReasonId ?? null,
      priorStage: opportunity.opportunityStage,
      closedByUserId: command.actor.userId,
      notes: command.notes ?? null,
    });

    await this.history.append({
      opportunityId: command.opportunityId,
      changeType: 'outcome_recorded',
      fieldName: 'outcome',
      newValue: { outcomeType: command.outcomeType, outcomeId: outcome.id },
      actorUserId: command.actor.userId,
      commandCorrelationId: command.commandCorrelationId ?? null,
    });

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: `opportunity.closed_${command.outcomeType}`,
      subjectType: 'opportunity',
      subjectId: command.opportunityId,
      organizationId: opportunity.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: { outcomeId: outcome.id, outcomeType: command.outcomeType },
    });
    await this.outbox?.insert({
      aggregateType: 'opportunity',
      aggregateId: command.opportunityId,
      eventType: `opportunity.closed_${command.outcomeType}`,
      idempotencyKey:
        command.commandCorrelationId ?? `${command.opportunityId}:close:${outcome.id}`,
      payload: {
        opportunityId: command.opportunityId,
        outcomeType: command.outcomeType,
        outcomeId: outcome.id,
      },
    });

    return { outcomeId: outcome.id, stage: targetStage };
  }
}

export class ReopenService {
  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly outcomes: OutcomeRepository,
    private readonly stageTransitions: StageTransitionService,
    private readonly history: HistoryRepository,
    private readonly audit?: OpportunityAuditPort,
  ) {}

  async reopen(command: {
    opportunityId: string;
    reasonCode: string;
    reasonNote?: string | null;
    actor: OpportunityActor;
    commandCorrelationId?: string | null;
  }) {
    assertRole(command.actor, ['admin', 'reviewer'], 'reopen opportunity');
    const opportunity = await this.opportunities.findById(command.opportunityId);
    if (opportunity === null) throw notFound('Opportunity not found', command.opportunityId);

    const currentOutcome = await this.outcomes.findCurrent(command.opportunityId);
    if (currentOutcome === null) {
      throw validation('Opportunity has no recorded outcome to reopen from', {
        opportunityId: command.opportunityId,
      });
    }
    if (
      !isTerminalStage(opportunity.opportunityStage) &&
      opportunity.opportunityStage !== 'nurture'
    ) {
      throw validation('Only terminal or nurtured opportunities can be reopened', {
        stage: opportunity.opportunityStage,
      });
    }

    const targetStage = reopenTargetStage(currentOutcome.outcomeType);
    const transition = await this.stageTransitions.advance({
      opportunityId: command.opportunityId,
      toStage: targetStage,
      actor: command.actor,
      reasonCode: command.reasonCode,
      reasonNote: command.reasonNote ?? null,
      exceptionAuthorized: true,
      commandCorrelationId: command.commandCorrelationId ?? null,
    });

    await this.outcomes.supersede({
      outcomeId: currentOutcome.id,
    });

    await this.history.append({
      opportunityId: command.opportunityId,
      changeType: 'reopened',
      fieldName: 'opportunity_stage',
      priorValue: opportunity.opportunityStage,
      newValue: targetStage,
      actorUserId: command.actor.userId,
      commandCorrelationId: command.commandCorrelationId ?? null,
    });

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'opportunity.reopened',
      subjectType: 'opportunity',
      subjectId: command.opportunityId,
      organizationId: opportunity.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: {
        priorOutcomeId: currentOutcome.id,
        priorOutcomeType: currentOutcome.outcomeType,
        transitionId: transition.transitionId,
      },
    });

    return {
      opportunity: transition.opportunity,
      priorOutcome: currentOutcome,
      transitionId: transition.transitionId,
    };
  }
}

export class PipelineQueryService {
  constructor(private readonly pipeline: PipelineQueryRepository) {}

  query(filter: PipelineFilter) {
    return this.pipeline.query(filter);
  }
}
