import type {
  DiscoveryActor,
  DiscoveryAnswerStatus,
  DiscoveryMappingStatus,
  DiscoverySessionStatus,
} from './discovery.js';

export type DiscoveryTemplate = {
  id: string;
  key: string;
  version: string;
  name: string;
  description: string;
  motion: string | null;
  organizationType: string | null;
  contactType: string | null;
  qualificationOutcomes: unknown[];
  recommendationRules: Record<string, unknown>;
  status: 'draft' | 'published' | 'retired';
};

export type DiscoveryQuestion = {
  id: string;
  key: string;
  version: string;
  prompt: string;
  helpText: string | null;
  answerType:
    | 'text'
    | 'number'
    | 'boolean'
    | 'date'
    | 'datetime'
    | 'single_select'
    | 'multi_select'
    | 'money'
    | 'percentage'
    | 'json';
  variableDefinitionId: string | null;
  variableDefinitionVersionId: string | null;
  scoreImpact: unknown[];
  requiredDefault: boolean;
  highImpact: boolean;
  tags: unknown[];
  status: 'draft' | 'published' | 'retired';
};

export type DiscoveryAgenda = {
  id: string;
  organizationId: string;
  contactId: string | null;
  templateId: string | null;
  status: 'generated' | 'customized' | 'deferred';
  motion: string | null;
  organizationType: string | null;
  contactType: string | null;
  qualificationOutcome: string | null;
  context: Record<string, unknown>;
  customizations: unknown[];
  generatedByUserId: string | null;
  commandCorrelationId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DiscoveryAgendaItem = {
  id: string;
  agendaId: string;
  questionId: string | null;
  prompt: string;
  reason: string;
  reasonCode: string;
  variables: unknown[];
  scoresAffected: unknown[];
  priority: number;
  required: boolean;
  deferred: boolean;
  displayOrder: number;
  metadata: Record<string, unknown>;
};

export type DiscoverySession = {
  id: string;
  organizationId: string;
  contactId: string | null;
  agendaId: string | null;
  templateId: string | null;
  status: DiscoverySessionStatus;
  ownerUserId: string | null;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  summary: Record<string, unknown>;
  commandCorrelationId: string | null;
  recordVersion: number;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DiscoveryAnswer = {
  id: string;
  sessionId: string;
  agendaItemId: string | null;
  questionId: string | null;
  participantId: string | null;
  answerType: DiscoveryQuestion['answerType'];
  answerStatus: DiscoveryAnswerStatus;
  originalAnswer: unknown;
  transcriptRef: string | null;
  submittedByUserId: string | null;
  submittedAt: Date;
  metadata: Record<string, unknown>;
};

export type DiscoveryInterpretation = {
  id: string;
  answerId: string;
  version: number;
  normalizedValue: unknown;
  variableDefinitionId: string | null;
  variableDefinitionVersionId: string | null;
  confidence: number | null;
  rationale: string;
  status: 'proposed' | 'superseded' | 'accepted' | 'rejected';
  proposedByUserId: string | null;
};

export type DiscoveryMapping = {
  id: string;
  sessionId: string;
  answerId: string;
  interpretationId: string | null;
  subjectType: 'organization' | 'contact';
  organizationId: string | null;
  contactId: string | null;
  variableDefinitionId: string;
  variableDefinitionVersionId: string;
  proposedTypedValue: unknown;
  evidenceRecordId: string | null;
  variableValueId: string | null;
  status: DiscoveryMappingStatus;
  reviewReason: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
};

export type DiscoveryScoreSnapshot = {
  id: string;
  sessionId: string;
  mappingId: string | null;
  subjectType: 'organization' | 'contact';
  organizationId: string | null;
  contactId: string | null;
  scoreKey: string;
  beforeScoreResultId: string | null;
  afterScoreResultId: string | null;
  beforeSnapshot: Record<string, unknown>;
  afterSnapshot: Record<string, unknown>;
  recommendationMovement: Record<string, unknown>;
  durationMs: number;
};

export type DiscoveryFollowUp = {
  id: string;
  sessionId: string;
  organizationId: string;
  contactId: string | null;
  title: string;
  description: string | null;
  status: 'open' | 'completed' | 'cancelled';
};

export type DiscoveryTemplateRepository = {
  listPublished(input?: {
    motion?: string | null;
    organizationType?: string | null;
  }): Promise<DiscoveryTemplate[]>;
  findPublishedByKey(key: string): Promise<DiscoveryTemplate | null>;
  listPublishedQuestionsForTemplate(templateId: string): Promise<
    Array<{
      question: DiscoveryQuestion;
      displayOrder: number;
      required: boolean;
      rationale: string | null;
    }>
  >;
};

export type DiscoveryAgendaRepository = {
  create(input: {
    organizationId: string;
    contactId?: string | null;
    templateId?: string | null;
    motion?: string | null;
    organizationType?: string | null;
    contactType?: string | null;
    qualificationOutcome?: string | null;
    context?: Record<string, unknown>;
    generatedByUserId?: string | null;
    commandCorrelationId?: string | null;
    items: readonly {
      questionId: string | null;
      prompt: string;
      reason: string;
      reasonCode: string;
      variables?: unknown[];
      scoresAffected?: unknown[];
      priority: number;
      required: boolean;
      deferred?: boolean;
      displayOrder: number;
      metadata?: Record<string, unknown>;
    }[];
  }): Promise<{ agenda: DiscoveryAgenda; items: DiscoveryAgendaItem[] }>;
  findById(id: string): Promise<DiscoveryAgenda | null>;
  listItems(agendaId: string): Promise<DiscoveryAgendaItem[]>;
};

export type DiscoverySessionRepository = {
  create(input: {
    organizationId: string;
    contactId?: string | null;
    agendaId?: string | null;
    templateId?: string | null;
    ownerUserId?: string | null;
    createdByUserId?: string | null;
    commandCorrelationId?: string | null;
  }): Promise<DiscoverySession>;
  findById(id: string): Promise<DiscoverySession | null>;
  updateStatus(input: {
    sessionId: string;
    expectedRecordVersion: number;
    status: DiscoverySessionStatus;
    scheduledStartAt?: Date | null;
    scheduledEndAt?: Date | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    summary?: Record<string, unknown>;
  }): Promise<DiscoverySession | null>;
};

export type DiscoveryAnswerRepository = {
  insert(input: {
    sessionId: string;
    agendaItemId?: string | null;
    questionId?: string | null;
    participantId?: string | null;
    answerType: DiscoveryQuestion['answerType'];
    answerStatus: DiscoveryAnswerStatus;
    originalAnswer?: unknown;
    transcriptRef?: string | null;
    submittedByUserId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<DiscoveryAnswer>;
  listForSession(sessionId: string): Promise<DiscoveryAnswer[]>;
  findById(id: string): Promise<DiscoveryAnswer | null>;
};

export type DiscoveryInterpretationRepository = {
  insert(input: {
    answerId: string;
    version: number;
    normalizedValue: unknown;
    variableDefinitionId?: string | null;
    variableDefinitionVersionId?: string | null;
    confidence?: number | null;
    rationale: string;
    proposedByUserId?: string | null;
  }): Promise<DiscoveryInterpretation>;
  latestForAnswer(answerId: string): Promise<DiscoveryInterpretation | null>;
};

export type DiscoveryMappingRepository = {
  insert(input: {
    sessionId: string;
    answerId: string;
    interpretationId?: string | null;
    subjectType: 'organization' | 'contact';
    organizationId?: string | null;
    contactId?: string | null;
    variableDefinitionId: string;
    variableDefinitionVersionId: string;
    proposedTypedValue: unknown;
  }): Promise<DiscoveryMapping>;
  findById(id: string): Promise<DiscoveryMapping | null>;
  listForSession(sessionId: string): Promise<DiscoveryMapping[]>;
  markReviewed(input: {
    mappingId: string;
    status: 'confirmed' | 'rejected';
    reviewedByUserId: string | null;
    reviewReason?: string | null;
    evidenceRecordId?: string | null;
    variableValueId?: string | null;
  }): Promise<DiscoveryMapping | null>;
};

export type DiscoveryScoreSnapshotRepository = {
  insert(input: Omit<DiscoveryScoreSnapshot, 'id'>): Promise<DiscoveryScoreSnapshot>;
  listForSession(sessionId: string): Promise<DiscoveryScoreSnapshot[]>;
};

export type DiscoveryFollowUpRepository = {
  insert(input: {
    sessionId: string;
    organizationId: string;
    contactId?: string | null;
    answerId?: string | null;
    mappingId?: string | null;
    title: string;
    description?: string | null;
    createdByUserId?: string | null;
  }): Promise<DiscoveryFollowUp>;
};

export type BlockingConditionPort = {
  listOpenBlockingForOrganization(organizationId: string): Promise<readonly { id: string }[]>;
};

export type VariableConfirmationPort = {
  confirmFromMapping(input: {
    subjectType: 'organization' | 'contact';
    organizationId: string | null;
    contactId: string | null;
    variableDefinitionVersionId: string;
    typedValue: unknown;
    actor: DiscoveryActor;
    correlationId: string | null;
    evidenceRecordId: string | null;
  }): Promise<{ variableValueId: string; evidenceRecordId: string | null }>;
};

export type ScoreDeltaPort = {
  captureDeltas(input: {
    sessionId: string;
    mappingId: string;
    organizationId: string;
    scoreKeys: readonly string[];
  }): Promise<
    readonly {
      scoreKey: string;
      before: number | null;
      after: number | null;
      beforeScoreResultId: string | null;
      afterScoreResultId: string | null;
      beforeSnapshot: Record<string, unknown>;
      afterSnapshot: Record<string, unknown>;
      recommendationMovement: Record<string, unknown>;
      durationMs: number;
    }[]
  >;
};

export type ProspectStageTransitionPort = {
  transitionToDiscoveryScheduled(input: {
    organizationId: string;
    expectedRecordVersion: number;
    actor: DiscoveryActor;
    commandCorrelationId?: string | null;
  }): Promise<{ recordVersion: number }>;
  transitionToDiscoveryCompleted(input: {
    organizationId: string;
    expectedRecordVersion: number;
    actor: DiscoveryActor;
    commandCorrelationId?: string | null;
  }): Promise<{ recordVersion: number }>;
};

export type DiscoveryAuditPort = {
  append(event: {
    actorUserId: string | null;
    action:
      | 'discovery.agenda_generated'
      | 'discovery.session_created'
      | 'discovery.session_scheduled'
      | 'discovery.session_started'
      | 'discovery.session_completed'
      | 'discovery.answer_recorded'
      | 'discovery.interpretation_proposed'
      | 'discovery.mapping_proposed'
      | 'discovery.mapping_confirmed'
      | 'discovery.mapping_rejected'
      | 'discovery.score_delta_recorded'
      | 'discovery.follow_up_created';
    subjectType: 'organization';
    subjectId: string;
    correlationId: string | null;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

export type DiscoveryOutboxPort = {
  insert(event: {
    aggregateType: 'organization';
    aggregateId: string;
    eventType:
      | 'discovery.agenda_generated'
      | 'discovery.session_created'
      | 'discovery.session_scheduled'
      | 'discovery.session_started'
      | 'discovery.session_completed'
      | 'discovery.answer_recorded'
      | 'discovery.interpretation_proposed'
      | 'discovery.mapping_proposed'
      | 'discovery.mapping_confirmed'
      | 'discovery.mapping_rejected'
      | 'discovery.score_delta_recorded'
      | 'discovery.follow_up_created';
    idempotencyKey: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};
