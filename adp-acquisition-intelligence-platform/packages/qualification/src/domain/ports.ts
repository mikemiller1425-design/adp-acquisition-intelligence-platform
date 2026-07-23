import type {
  DataFreshnessStatus,
  OperationalDimension,
  OperationalStateValue,
  OutreachStatus,
  ProspectStage,
  ResearchStatus,
} from './operational-state.js';

export type TransitionActor = {
  type: 'user' | 'system';
  userId: string | null;
};

export type OrganizationState = {
  id: string;
  prospectStage: ProspectStage;
  researchStatus: ResearchStatus;
  outreachStatus: OutreachStatus;
  dataFreshnessStatus: DataFreshnessStatus;
  recordStatus: 'active' | 'archived';
  recordVersion: number;
};

export type OperationalStateTransition = {
  id: string;
  subjectType: 'organization';
  subjectId: string;
  dimension: OperationalDimension;
  fromValue: OperationalStateValue | null;
  toValue: OperationalStateValue;
  actorUserId: string | null;
  actorType: 'user' | 'system';
  reasonCode: string | null;
  reasonNote: string | null;
  commandCorrelationId: string | null;
  validationResult: Record<string, unknown>;
  exceptionAuthorized: boolean;
  relatedReviewId: string | null;
  createdAt: Date;
};

export type OrganizationStateWriter = {
  findOrganizationState(organizationId: string): Promise<OrganizationState | null>;
  updateOrganizationStateIfVersion(input: {
    organizationId: string;
    dimension: OperationalDimension;
    toValue: OperationalStateValue;
    expectedRecordVersion: number;
  }): Promise<OrganizationState | null>;
};

export type OperationalStateTransitionRepository = {
  findByCorrelationId(input: {
    subjectType: 'organization';
    subjectId: string;
    dimension: OperationalDimension;
    commandCorrelationId: string;
  }): Promise<OperationalStateTransition | null>;
  insert(
    input: Omit<OperationalStateTransition, 'id' | 'createdAt'>,
  ): Promise<OperationalStateTransition>;
};

export type OperationalStateAuditPort = {
  append(event: {
    actorUserId: string | null;
    action: 'operational_state_transitioned';
    subjectType: 'organization';
    subjectId: string;
    correlationId: string | null;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

export type OperationalStateOutboxPort = {
  insert(event: {
    aggregateType: 'organization';
    aggregateId: string;
    eventType: 'operational_state.transitioned';
    idempotencyKey: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};
