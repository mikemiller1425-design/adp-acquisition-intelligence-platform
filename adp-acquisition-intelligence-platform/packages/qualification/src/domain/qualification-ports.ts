import type { ProspectStage } from './operational-state.js';
import type {
  QualificationActor,
  QualificationConditionInput,
  QualificationConditionStatus,
  QualificationConditionType,
  QualificationOutcome,
  QualificationReviewStatus,
} from './qualification.js';

export type QualificationReview = {
  id: string;
  organizationId: string;
  status: QualificationReviewStatus;
  requestedByUserId: string | null;
  assignedToUserId: string | null;
  startedAt: Date | null;
  decidedAt: Date | null;
  computedRecommendation: Record<string, unknown> | null;
  reviewerRecommendation: Record<string, unknown> | null;
  recommendationOverridden: boolean;
  overrideReasonCode: string | null;
  overrideReasonNote: string | null;
  requiredGaps: readonly string[];
  consentIndicators: Record<string, unknown>;
  reviewSummary: Record<string, unknown>;
  commandCorrelationId: string | null;
  recordVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type QualificationScoreLink = {
  id: string;
  reviewId: string;
  scoreResultId: string;
  purpose: string;
  isPrimary: boolean;
  computedRecommendationSnapshot: Record<string, unknown> | null;
  createdAt: Date;
};

export type QualificationCondition = {
  id: string;
  reviewId: string;
  organizationId: string;
  type: QualificationConditionType;
  key: string;
  title: string;
  description: string | null;
  ownerUserId: string | null;
  dueDate: string | null;
  status: QualificationConditionStatus;
  taskId: string | null;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  waivedByUserId: string | null;
  waivedAt: Date | null;
  waiverReasonCode: string | null;
  waiverReasonNote: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type DisqualificationReason = {
  id: string;
  key: string;
  version: string;
  displayName: string;
  description: string;
  category: string;
  status: 'active' | 'archived';
  appliesToOutcomes: readonly QualificationOutcome[];
};

export type QualificationDecision = {
  id: string;
  reviewId: string;
  organizationId: string;
  outcome: QualificationOutcome;
  disqualificationReasonId: string | null;
  supersedesDecisionId: string | null;
  actorUserId: string | null;
  reasonCode: string;
  reasonNote: string | null;
  decisionSnapshot: Record<string, unknown>;
  commandCorrelationId: string | null;
  createdAt: Date;
};

export type QualificationReviewRepository = {
  create(input: {
    organizationId: string;
    requestedByUserId: string | null;
    assignedToUserId?: string | null;
    computedRecommendation?: Record<string, unknown> | null;
    requiredGaps?: readonly string[];
    consentIndicators?: Record<string, unknown>;
    commandCorrelationId?: string | null;
  }): Promise<QualificationReview>;
  findById(id: string): Promise<QualificationReview | null>;
  start(input: {
    reviewId: string;
    assignedToUserId: string | null;
    expectedRecordVersion: number;
  }): Promise<QualificationReview | null>;
  markDecided(input: {
    reviewId: string;
    expectedRecordVersion: number;
    reviewerRecommendation?: Record<string, unknown> | null;
    overrideReasonCode?: string | null;
    overrideReasonNote?: string | null;
    reviewSummary?: Record<string, unknown>;
  }): Promise<QualificationReview | null>;
  listQueue(input: {
    statuses?: readonly QualificationReviewStatus[];
    assignedToUserId?: string | null;
    limit: number;
  }): Promise<QualificationReview[]>;
  linkScores(input: {
    reviewId: string;
    scores: readonly {
      scoreResultId: string;
      purpose?: string;
      isPrimary?: boolean;
      computedRecommendationSnapshot?: Record<string, unknown> | null;
    }[];
  }): Promise<QualificationScoreLink[]>;
  listScores(reviewId: string): Promise<QualificationScoreLink[]>;
};

export type QualificationDecisionRepository = {
  insert(input: Omit<QualificationDecision, 'id' | 'createdAt'>): Promise<QualificationDecision>;
  latestForReview(reviewId: string): Promise<QualificationDecision | null>;
};

export type QualificationConditionRepository = {
  createMany(input: {
    reviewId: string;
    organizationId: string;
    createdByUserId: string | null;
    conditions: readonly (QualificationConditionInput & { taskId?: string | null })[];
  }): Promise<QualificationCondition[]>;
  findById(conditionId: string): Promise<QualificationCondition | null>;
  listForReview(reviewId: string): Promise<QualificationCondition[]>;
  listOpenBlockingForOrganization(organizationId: string): Promise<QualificationCondition[]>;
  resolve(input: {
    conditionId: string;
    actorUserId: string | null;
    resolutionNote?: string | null;
  }): Promise<QualificationCondition | null>;
  waive(input: {
    conditionId: string;
    actorUserId: string | null;
    reasonCode: string;
    reasonNote?: string | null;
  }): Promise<QualificationCondition | null>;
};

export type DisqualificationReasonRepository = {
  findActiveByKey(key: string): Promise<DisqualificationReason | null>;
  listActive(): Promise<DisqualificationReason[]>;
};

export type RecommendationOverrideRepository = {
  insert(input: {
    reviewId: string;
    scoreResultId?: string | null;
    computedRecommendation: Record<string, unknown>;
    reviewerRecommendation: Record<string, unknown>;
    actorUserId: string | null;
    reasonCode: string;
    reasonNote?: string | null;
  }): Promise<{ id: string }>;
};

export type QualificationTaskPort = {
  createTask(input: {
    subjectType: 'organization';
    subjectId: string;
    organizationId: string;
    title: string;
    description?: string | null;
    dueDate: string;
    assignedToUserId: string;
    createdByUserId: string | null;
    metadata: Record<string, unknown>;
  }): Promise<{ id: string }>;
};

export type QualificationGuardPort = {
  assertCanAccessOrganization(input: {
    organizationId: string;
    actor: QualificationActor;
  }): Promise<void>;
  assertAssignmentAllowsQualification(input: {
    organizationId: string;
    actor: QualificationActor;
  }): Promise<void>;
  assertTerritoryAllowsQualification(input: {
    organizationId: string;
    actor: QualificationActor;
  }): Promise<void>;
};

export type QualificationAuditPort = {
  append(event: {
    actorUserId: string | null;
    action:
      | 'qualification.review_requested'
      | 'qualification.review_started'
      | 'qualification.decision_recorded'
      | 'qualification.condition_created'
      | 'qualification.condition_resolved'
      | 'qualification.condition_waived'
      | 'qualification.recommendation_overridden'
      | 'qualification.reentry_requested';
    subjectType: 'organization';
    subjectId: string;
    correlationId: string | null;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

export type QualificationOutboxPort = {
  insert(event: {
    aggregateType: 'organization';
    aggregateId: string;
    eventType:
      | 'qualification.review_requested'
      | 'qualification.review_started'
      | 'qualification.decision_recorded'
      | 'qualification.condition_created'
      | 'qualification.condition_resolved'
      | 'qualification.condition_waived'
      | 'qualification.recommendation_overridden'
      | 'qualification.reentry_requested'
      | 'prospect.stage_transitioned'
      | 'prospect.transition_denied';
    idempotencyKey: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

export type TransitionPreview = {
  from: ProspectStage;
  to: ProspectStage;
  allowed: boolean;
  deniedReason?: string;
};
