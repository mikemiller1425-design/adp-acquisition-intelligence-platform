import type { OpportunityActor, OpportunityContactRole, OpportunityStage } from './opportunity.js';

export type OpportunityRecord = {
  id: string;
  organizationId: string;
  primaryMotion: string;
  opportunityStage: OpportunityStage;
  name: string;
  description: string | null;
  ownerUserId: string | null;
  recordStatus: 'active' | 'archived';
  recordVersion: number;
  humanConfirmationAt: Date | null;
  humanConfirmedByUserId: string | null;
};

export type OrganizationOpportunityContext = {
  organizationId: string;
  prospectStage: string;
  recordStatus: 'active' | 'archived';
  existingRelationshipFlag: boolean;
  recordVersion: number;
  ownerUserId: string | null;
};

export type StageDefinition = {
  stageKey: OpportunityStage;
  version: string;
  displayName: string;
  defaultProbability: string | null;
  maxAgeDays: number | null;
};

export type LossReason = {
  id: string;
  key: string;
  displayName: string;
  status: 'active' | 'retired';
};

export type OpportunityOutcome = {
  id: string;
  opportunityId: string;
  outcomeType: 'won' | 'lost' | 'nurture';
  lossReasonId: string | null;
  priorStage: OpportunityStage | null;
  closedAt: Date;
  supersededAt: Date | null;
};

export type PipelineFilter = {
  organizationId?: string;
  ownerUserId?: string;
  stage?: OpportunityStage | readonly OpportunityStage[];
  motion?: string;
  limit: number;
  offset: number;
};

export type PipelineRow = {
  id: string;
  organizationId: string;
  name: string;
  primaryMotion: string;
  opportunityStage: OpportunityStage;
  ownerUserId: string | null;
  currentValueAmount: string | null;
  currentValueCurrency: string | null;
  currentProbability: string | null;
  openRiskFlagCount: number;
  updatedAt: Date;
};

export interface OrganizationContextPort {
  findOrganizationContext(organizationId: string): Promise<OrganizationOpportunityContext | null>;
}

export interface OpportunityRepository {
  findById(opportunityId: string): Promise<OpportunityRecord | null>;
  findActiveByOrganizationAndMotion(
    organizationId: string,
    motion: string,
  ): Promise<OpportunityRecord | null>;
  insert(command: {
    organizationId: string;
    primaryMotion: string;
    name: string;
    description?: string | null;
    ownerUserId: string | null;
    humanConfirmedByUserId: string;
    createdByUserId: string;
  }): Promise<OpportunityRecord>;
  updateStageIfVersion(command: {
    opportunityId: string;
    toStage: OpportunityStage;
    expectedRecordVersion: number;
    updatedByUserId: string;
  }): Promise<OpportunityRecord | null>;
}

export interface EligibilityAssessmentRepository {
  saveAssessment(command: {
    organizationId: string;
    motion: string;
    eligible: boolean;
    reasons: readonly { code: string; message: string }[];
    assessedByUserId: string;
  }): Promise<{ id: string }>;
}

export interface StageDefinitionRepository {
  findActiveByStage(stageKey: OpportunityStage): Promise<StageDefinition | null>;
  listActive(): Promise<readonly StageDefinition[]>;
}

export interface StageTransitionRepository {
  findByCorrelationId(command: {
    opportunityId: string;
    commandCorrelationId: string;
  }): Promise<{ id: string; toStage: OpportunityStage } | null>;
  insert(command: {
    opportunityId: string;
    fromStage: OpportunityStage | null;
    toStage: OpportunityStage;
    actorUserId: string;
    reasonCode?: string | null;
    reasonNote?: string | null;
    commandCorrelationId?: string | null;
    validationResult: Record<string, unknown>;
    exceptionAuthorized?: boolean;
  }): Promise<{ id: string }>;
}

export interface OperationalStateOpportunityPort {
  transitionOpportunityStage(command: {
    opportunityId: string;
    fromValue: OpportunityStage;
    toValue: OpportunityStage;
    actorUserId: string;
    reasonCode?: string | null;
    reasonNote?: string | null;
    commandCorrelationId?: string | null;
    validationResult: Record<string, unknown>;
    exceptionAuthorized?: boolean;
  }): Promise<{ id: string }>;
  transitionProspectToOpportunity(command: {
    organizationId: string;
    expectedRecordVersion: number;
    actorUserId: string;
    commandCorrelationId?: string | null;
  }): Promise<void>;
}

export interface ContactRoleRepository {
  assignContact(command: {
    opportunityId: string;
    contactId: string;
    role: OpportunityContactRole;
    isPrimary: boolean;
    createdByUserId: string;
  }): Promise<{ id: string }>;
  listByOpportunity(opportunityId: string): Promise<
    Array<{
      id: string;
      contactId: string;
      role: OpportunityContactRole;
      isPrimary: boolean;
    }>
  >;
}

export interface ValueRepository {
  closeCurrent(opportunityId: string): Promise<void>;
  insert(command: {
    opportunityId: string;
    amount: string | null;
    currency: string | null;
    valueBand?: string | null;
    source: string;
    setByUserId: string;
    reasonNote?: string | null;
  }): Promise<{ id: string }>;
  findCurrent(opportunityId: string): Promise<{
    amount: string | null;
    currency: string | null;
    valueBand: string | null;
  } | null>;
}

export interface ProbabilityRepository {
  closeCurrent(opportunityId: string): Promise<void>;
  insert(command: {
    opportunityId: string;
    probability: string | null;
    source: 'manual' | 'stage_default';
    stageKey?: OpportunityStage | null;
    setByUserId: string;
    reasonNote?: string | null;
  }): Promise<{ id: string }>;
  findCurrent(opportunityId: string): Promise<{
    probability: string | null;
    source: 'manual' | 'stage_default';
  } | null>;
}

export interface NextActionRepository {
  create(command: {
    opportunityId: string;
    title: string;
    description?: string | null;
    dueAt?: Date | null;
    assignedToUserId?: string | null;
    createdByUserId: string;
  }): Promise<{ id: string }>;
  complete(command: { actionId: string; completedByUserId: string }): Promise<void>;
}

export interface RiskFlagRepository {
  raise(command: {
    opportunityId: string;
    flagKey: string;
    severity: string;
    description: string;
    raisedByUserId: string;
  }): Promise<{ id: string }>;
  resolve(command: { flagId: string; resolvedByUserId: string }): Promise<void>;
  countOpen(opportunityId: string): Promise<number>;
}

export interface LossReasonRepository {
  findActiveByKey(key: string): Promise<LossReason | null>;
  findActiveById(id: string): Promise<LossReason | null>;
}

export interface OutcomeRepository {
  findCurrent(opportunityId: string): Promise<OpportunityOutcome | null>;
  insert(command: {
    opportunityId: string;
    outcomeType: 'won' | 'lost' | 'nurture';
    lossReasonId?: string | null;
    priorStage: OpportunityStage;
    closedByUserId: string;
    notes?: string | null;
  }): Promise<{ id: string }>;
  supersede(command: { outcomeId: string; supersededByOutcomeId?: string | null }): Promise<void>;
}

export interface HistoryRepository {
  append(command: {
    opportunityId: string;
    changeType: string;
    fieldName?: string | null;
    priorValue?: unknown;
    newValue?: unknown;
    actorUserId: string;
    commandCorrelationId?: string | null;
  }): Promise<void>;
}

export interface ContextLinkRepository {
  link(command: {
    opportunityId: string;
    linkType: string;
    linkedSubjectType: 'organization' | 'opportunity' | 'contact' | 'user' | 'system';
    linkedSubjectId: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }>;
}

export interface PipelineQueryRepository {
  query(filter: PipelineFilter): Promise<{ rows: PipelineRow[]; total: number }>;
}

export interface OpportunityAuditPort {
  append(command: {
    actorUserId: string;
    action: string;
    subjectType: 'organization' | 'opportunity';
    subjectId: string;
    organizationId?: string | null;
    correlationId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface OpportunityOutboxPort {
  insert(command: {
    aggregateType: 'organization' | 'opportunity';
    aggregateId: string;
    eventType: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export type { OpportunityActor };
