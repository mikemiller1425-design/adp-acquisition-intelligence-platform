import type { Channel, PermissionEvaluation } from '@adp/consent';
import type { OperationalStateService } from '@adp/qualification';

export type OutreachDefinitionStatus = 'draft' | 'published' | 'retired';
export type EnrollmentStatus = 'pending' | 'active' | 'paused' | 'completed' | 'exited' | 'blocked';
export type DraftStatus =
  'draft' | 'pending_approval' | 'approved' | 'rejected' | 'exported' | 'sent' | 'cancelled';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ActivityType =
  | 'drafted'
  | 'submitted_for_approval'
  | 'approved'
  | 'rejected'
  | 'exported'
  | 'marked_sent'
  | 'response_received'
  | 'permission_blocked'
  | 'sequence_advanced'
  | 'enrollment_paused'
  | 'enrollment_resumed'
  | 'enrollment_exited';
export type ResponseClassification =
  | 'positive'
  | 'negative'
  | 'referral_to_another_contact'
  | 'existing_provider'
  | 'timing_issue'
  | 'needs_information'
  | 'meeting_booked'
  | 'unsubscribe'
  | 'no_longer_relevant'
  | 'out_of_office'
  | 'wrong_contact'
  | 'unknown';

export type CampaignVersion = {
  id: string;
  campaignId: string;
  version: string;
  name: string;
  description: string;
  sequenceVersionId: string | null;
  defaultChannel: Channel | null;
  status: OutreachDefinitionStatus;
};

export type TemplateVersion = {
  id: string;
  templateId: string;
  version: string;
  key: string;
  channel: Channel;
  subjectTemplate: string | null;
  bodyTemplate: string;
  contextKeys: string[];
  status: OutreachDefinitionStatus;
};

export type SequenceStep = {
  id: string;
  sequenceVersionId: string;
  stepOrder: number;
  templateVersionId: string;
  channel: Channel;
  delayDays: number;
  waitForResponse: boolean;
};

export type SequenceVersion = {
  id: string;
  sequenceId: string;
  version: string;
  name: string;
  status: OutreachDefinitionStatus;
};

export type Enrollment = {
  id: string;
  organizationId: string;
  contactId: string;
  campaignVersionId: string;
  sequenceVersionId: string;
  status: EnrollmentStatus;
  ownerUserId: string | null;
  currentStepId: string | null;
  permissionSnapshot: Record<string, unknown>;
  enrolledAt: Date | null;
  pausedAt: Date | null;
  exitedAt: Date | null;
  exitReason: string | null;
  recordVersion: number;
  commandCorrelationId: string | null;
};

export type MessageDraft = {
  id: string;
  enrollmentId: string;
  sequenceStepId: string | null;
  templateVersionId: string;
  channel: Channel;
  status: DraftStatus;
  renderedSubject: string | null;
  renderedBody: string;
  contextRefs: Record<string, unknown>;
  permissionSnapshot: Record<string, unknown>;
  createdByUserId: string | null;
};

export type MessageApproval = {
  id: string;
  draftId: string;
  status: ApprovalStatus;
  permissionSnapshot: Record<string, unknown>;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  notes: string | null;
};

export type OutreachActivity = {
  id: string;
  enrollmentId: string;
  draftId: string | null;
  activityType: ActivityType;
  channel: Channel;
  occurredAt: Date;
  immutableSnapshot: Record<string, unknown>;
  permissionSnapshot: Record<string, unknown>;
  createdByUserId: string | null;
};

export type OutreachResponse = {
  id: string;
  enrollmentId: string;
  activityId: string | null;
  channel: Channel;
  originalText: string;
  receivedAt: Date;
};

export type ResponseClassificationRecord = {
  id: string;
  responseId: string;
  classification: ResponseClassification;
  classifiedByUserId: string | null;
  classifiedAt: Date;
  notes: string | null;
};

export type SequenceHistoryEntry = {
  id: string;
  enrollmentId: string;
  stepId: string;
  status: 'pending' | 'active' | 'completed' | 'skipped' | 'blocked';
  advancedAt: Date | null;
};

export type OrganizationContext = {
  organizationId: string;
  prospectStage: string;
  outreachStatus: string;
  recordVersion: number;
  ownerUserId: string | null;
};

export type OutreachPermissionPort = {
  evaluateOutreachPermission(command: {
    contactId: string;
    organizationId: string;
    channel: Channel;
    auditBlockedDecision?: {
      actorUserId: string | null;
      correlationId: string | null;
    };
  }): Promise<PermissionEvaluation>;
};

export type OutreachConsentOptOutPort = {
  recordOptOut(command: {
    contactId: string;
    organizationId: string;
    channel: Channel;
    capturedByUserId: string | null;
    reasonCode?: string | null;
    reasonNote?: string | null;
  }): Promise<void>;
};

export type OrganizationContextPort = {
  findOrganizationContext(organizationId: string): Promise<OrganizationContext | null>;
};

export type CampaignRepository = {
  findPublishedVersionByKey(key: string): Promise<CampaignVersion | null>;
  publishVersion(command: {
    campaignKey: string;
    version: string;
    actorUserId: string;
  }): Promise<CampaignVersion>;
};

export type TemplateRepository = {
  findPublishedVersionByKey(key: string): Promise<TemplateVersion | null>;
  findPublishedVersionById(id: string): Promise<TemplateVersion | null>;
  publishVersion(command: {
    templateKey: string;
    version: string;
    actorUserId: string;
  }): Promise<TemplateVersion>;
};

export type SequenceRepository = {
  findPublishedVersionByKey(key: string): Promise<SequenceVersion | null>;
  listPublishedSteps(sequenceVersionId: string): Promise<SequenceStep[]>;
  findStepById(stepId: string): Promise<SequenceStep | null>;
  publishVersion(command: {
    sequenceKey: string;
    version: string;
    actorUserId: string;
  }): Promise<SequenceVersion>;
};

export type EnrollmentRepository = {
  findById(id: string): Promise<Enrollment | null>;
  findByCorrelationId(correlationId: string): Promise<Enrollment | null>;
  create(command: {
    organizationId: string;
    contactId: string;
    campaignVersionId: string;
    sequenceVersionId: string;
    ownerUserId: string | null;
    permissionSnapshot: Record<string, unknown>;
    commandCorrelationId?: string | null;
  }): Promise<Enrollment>;
  updateStatus(command: {
    enrollmentId: string;
    status: EnrollmentStatus;
    expectedRecordVersion: number;
    enrolledAt?: Date | null;
    pausedAt?: Date | null;
    exitedAt?: Date | null;
    exitReason?: string | null;
    currentStepId?: string | null;
  }): Promise<Enrollment | null>;
  createRecipient(command: {
    enrollmentId: string;
    contactId: string;
    channel: Channel;
  }): Promise<void>;
};

export type DraftRepository = {
  findById(id: string): Promise<MessageDraft | null>;
  create(command: {
    enrollmentId: string;
    sequenceStepId: string | null;
    templateVersionId: string;
    channel: Channel;
    renderedSubject: string | null;
    renderedBody: string;
    contextRefs: Record<string, unknown>;
    permissionSnapshot: Record<string, unknown>;
    createdByUserId: string | null;
  }): Promise<MessageDraft>;
  updateStatus(draftId: string, status: DraftStatus): Promise<MessageDraft>;
};

export type ApprovalRepository = {
  findById(id: string): Promise<MessageApproval | null>;
  findPendingByDraftId(draftId: string): Promise<MessageApproval | null>;
  create(command: {
    draftId: string;
    permissionSnapshot: Record<string, unknown>;
  }): Promise<MessageApproval>;
  decide(command: {
    approvalId: string;
    status: Exclude<ApprovalStatus, 'pending'>;
    decidedByUserId: string;
    permissionSnapshot: Record<string, unknown>;
    notes?: string | null;
  }): Promise<MessageApproval>;
};

export type ActivityRepository = {
  create(command: {
    enrollmentId: string;
    draftId?: string | null;
    activityType: ActivityType;
    channel: Channel;
    immutableSnapshot: Record<string, unknown>;
    permissionSnapshot: Record<string, unknown>;
    createdByUserId: string | null;
    occurredAt?: Date;
  }): Promise<OutreachActivity>;
};

export type ResponseRepository = {
  create(command: {
    enrollmentId: string;
    activityId?: string | null;
    channel: Channel;
    originalText: string;
    receivedAt?: Date;
  }): Promise<OutreachResponse>;
  classify(command: {
    responseId: string;
    classification: ResponseClassification;
    classifiedByUserId: string;
    notes?: string | null;
  }): Promise<ResponseClassificationRecord>;
};

export type SequenceHistoryRepository = {
  findByEnrollmentAndStep(
    enrollmentId: string,
    stepId: string,
  ): Promise<SequenceHistoryEntry | null>;
  listByEnrollment(enrollmentId: string): Promise<SequenceHistoryEntry[]>;
  upsert(command: {
    enrollmentId: string;
    stepId: string;
    status: SequenceHistoryEntry['status'];
    advancedAt?: Date | null;
  }): Promise<SequenceHistoryEntry>;
};

export type ReadinessRepository = {
  saveAssessment(command: {
    organizationId: string;
    contactId: string | null;
    channel: Channel | null;
    ready: boolean;
    reasons: unknown[];
    permissionSnapshot: Record<string, unknown>;
    assessedByUserId: string | null;
  }): Promise<{ id: string }>;
};

export type OutreachAuditPort = {
  append(event: {
    actorUserId: string | null;
    action:
      | 'outreach.readiness_assessed'
      | 'outreach.campaign_published'
      | 'outreach.template_published'
      | 'outreach.sequence_published'
      | 'outreach.enrolled'
      | 'outreach.enrollment_blocked'
      | 'outreach.draft_created'
      | 'outreach.approval_requested'
      | 'outreach.approved'
      | 'outreach.rejected'
      | 'outreach.marked_sent'
      | 'outreach.response_recorded'
      | 'outreach.response_classified'
      | 'outreach.enrollment_paused'
      | 'outreach.enrollment_resumed'
      | 'outreach.enrollment_exited'
      | 'outreach.sequence_advanced';
    subjectType: 'organization' | 'contact';
    subjectId: string;
    organizationId?: string | null;
    correlationId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
};

export type OutreachOutboxPort = {
  insert(event: {
    aggregateType: 'organization';
    aggregateId: string;
    eventType:
      | 'outreach.readiness_assessed'
      | 'outreach.enrolled'
      | 'outreach.draft_created'
      | 'outreach.approved'
      | 'outreach.marked_sent'
      | 'outreach.response_classified'
      | 'outreach.enrollment_paused'
      | 'outreach.enrollment_exited'
      | 'outreach.sequence_advanced';
    idempotencyKey: string;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
};

export type OperationalStateOutreachPort = Pick<
  OperationalStateService,
  'transitionProspectStage' | 'transitionOutreachStatus'
>;
