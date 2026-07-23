import { AppError } from '@adp/platform';

import type {
  AccessClassification,
  ConfidenceAssessmentStatus,
  ConfidenceComponents,
  EvidenceRelationshipType,
  EvidenceType,
  FreshnessResult,
  JsonObject,
  ObservationLifecycle,
  PermissionEvidenceSubjectType,
  ReviewerStatus,
  SourceStatus,
  SourceType,
  SubjectRef,
  SubjectType,
} from './evidence.js';

export type ActorRole = 'admin' | 'researcher' | 'sales' | 'reviewer';

export type EvidenceCapability =
  | 'source:create'
  | 'source:update'
  | 'source:disable'
  | 'evidence:create'
  | 'evidence:review'
  | 'evidence:supersede'
  | 'observation:create'
  | 'observation:accept'
  | 'observation:reject'
  | 'observation:contradict'
  | 'confidence:assess'
  | 'permission_evidence:link'
  | 'provenance:read';

export type CapabilityActor = {
  userId: string | null;
  roles: readonly ActorRole[];
};

export type CapabilityChecker = {
  assertCan(actor: CapabilityActor, capability: EvidenceCapability): Promise<void> | void;
};

const roleCapabilities: Record<ActorRole, ReadonlySet<EvidenceCapability>> = {
  admin: new Set<EvidenceCapability>([
    'source:create',
    'source:update',
    'source:disable',
    'evidence:create',
    'evidence:review',
    'evidence:supersede',
    'observation:create',
    'observation:accept',
    'observation:reject',
    'observation:contradict',
    'confidence:assess',
    'permission_evidence:link',
    'provenance:read',
  ]),
  researcher: new Set<EvidenceCapability>([
    'source:create',
    'source:update',
    'evidence:create',
    'evidence:supersede',
    'observation:create',
    'observation:reject',
    'observation:contradict',
    'confidence:assess',
    'provenance:read',
  ]),
  reviewer: new Set<EvidenceCapability>([
    'evidence:create',
    'evidence:review',
    'evidence:supersede',
    'observation:create',
    'observation:accept',
    'observation:reject',
    'observation:contradict',
    'confidence:assess',
    'provenance:read',
  ]),
  sales: new Set<EvidenceCapability>([
    'evidence:create',
    'observation:create',
    'permission_evidence:link',
    'provenance:read',
  ]),
};

export class AllowListCapabilityChecker implements CapabilityChecker {
  assertCan(actor: CapabilityActor, capability: EvidenceCapability): void {
    if (actor.roles.some((role) => roleCapabilities[role].has(capability))) return;
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Actor is not authorized for evidence capability',
      details: { capability, roles: actor.roles },
    });
  }
}

export type SourceRecord = {
  id: string;
  sourceType: SourceType;
  title: string;
  locator: string | null;
  publisher: string | null;
  defaultReliability: number | null;
  accessClassification: AccessClassification;
  retrievalRestrictions: JsonObject;
  status: SourceStatus;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SourceCreateInput = {
  sourceType: SourceType;
  title: string;
  locator: string | null;
  publisher: string | null;
  defaultReliability: number | null;
  accessClassification: AccessClassification;
  retrievalRestrictions: JsonObject;
  createdByUserId: string | null;
  updatedByUserId: string | null;
};

export type SourceUpdateInput = Partial<
  Pick<
    SourceCreateInput,
    | 'title'
    | 'locator'
    | 'publisher'
    | 'defaultReliability'
    | 'accessClassification'
    | 'retrievalRestrictions'
  >
> & { updatedByUserId: string | null };

export type SourceRepository = {
  findById(id: string): Promise<SourceRecord | null>;
  findByTypeAndLocator(sourceType: SourceType, locator: string): Promise<SourceRecord | null>;
  insert(input: SourceCreateInput): Promise<SourceRecord>;
  update(id: string, input: SourceUpdateInput): Promise<SourceRecord | null>;
  disable(id: string, updatedByUserId: string | null): Promise<SourceRecord | null>;
};

export type EvidenceRecord = SubjectRef & {
  id: string;
  sourceId: string | null;
  claim: string;
  structuredPayload: JsonObject;
  evidenceType: EvidenceType;
  observedAt: Date;
  retrievedAt: Date;
  effectiveAt: Date | null;
  expiresAt: Date | null;
  confidenceComponents: ConfidenceComponents;
  reviewerStatus: ReviewerStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  supersededById: string | null;
  contentHash: string;
  actorUserId: string | null;
  correlationId: string | null;
  createdAt: Date;
};

export type EvidenceCreateInput = {
  subjectType: SubjectType;
  organizationId: string | null;
  contactId: string | null;
  sourceId: string | null;
  claim: string;
  structuredPayload: JsonObject;
  evidenceType: EvidenceType;
  observedAt: Date;
  retrievedAt: Date;
  effectiveAt: Date | null;
  expiresAt: Date | null;
  confidenceComponents: ConfidenceComponents;
  reviewerStatus: ReviewerStatus;
  contentHash: string;
  actorUserId: string | null;
  correlationId: string | null;
};

export type EvidenceReviewInput = {
  reviewerStatus: ReviewerStatus;
  reviewedBy: string | null;
  reviewedAt: Date;
};

export type EvidenceRepository = {
  findById(id: string): Promise<EvidenceRecord | null>;
  findByContentHash(contentHash: string): Promise<EvidenceRecord | null>;
  insert(input: EvidenceCreateInput): Promise<EvidenceRecord>;
  review(id: string, input: EvidenceReviewInput): Promise<EvidenceRecord | null>;
  supersede(existingId: string, replacement: EvidenceCreateInput): Promise<EvidenceRecord>;
};

export type ResearchObservation = SubjectRef & {
  id: string;
  claim: string;
  evidenceId: string | null;
  proposedDefinitionVersionId: string | null;
  proposedTypedValue: unknown;
  normalizedInterpretation: string | null;
  proposingUserId: string | null;
  reviewUserId: string | null;
  lifecycleStatus: ObservationLifecycle;
  decisionReason: string | null;
  decidedAt: Date | null;
  resultingVariableValueId: string | null;
  correlationId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ResearchObservationCreateInput = {
  subjectType: SubjectType;
  organizationId: string | null;
  contactId: string | null;
  claim: string;
  evidenceId: string | null;
  proposedDefinitionVersionId: string | null;
  proposedTypedValue: unknown;
  normalizedInterpretation: string | null;
  proposingUserId: string | null;
  correlationId: string | null;
};

export type ResearchObservationRepository = {
  findById(id: string): Promise<ResearchObservation | null>;
  findByCorrelationId(correlationId: string): Promise<ResearchObservation | null>;
  insert(input: ResearchObservationCreateInput): Promise<ResearchObservation>;
  decide(input: {
    id: string;
    lifecycleStatus: Exclude<ObservationLifecycle, 'proposed'>;
    reviewUserId: string | null;
    decisionReason: string | null;
    decidedAt: Date;
    resultingVariableValueId: string | null;
  }): Promise<ResearchObservation | null>;
};

export type VariableValueCommandPort = {
  confirmValue(command: {
    subject: SubjectRef;
    definitionVersionId: string;
    typedValue: unknown;
    evidenceType: EvidenceType;
    actorUserId: string | null;
    correlationId: string | null;
    evidenceRecordId: string | null;
    observedAt: Date | null;
  }): Promise<{ valueId: string }>;
};

export type ConfidenceAssessment = {
  id: string;
  subjectType: 'variable_value' | 'evidence_record';
  subjectId: string;
  components: ConfidenceComponents;
  aggregateScore: number | null;
  status: ConfidenceAssessmentStatus;
  policyVersion: string | null;
  createdAt: Date;
};

export type ConfidenceAssessmentRepository = {
  insert(input: Omit<ConfidenceAssessment, 'id' | 'createdAt'>): Promise<ConfidenceAssessment>;
};

export type PermissionEvidenceLink = {
  id: string;
  subjectType: PermissionEvidenceSubjectType;
  subjectId: string;
  evidenceRecordId: string;
  createdAt: Date;
  createdBy: string | null;
};

export type PermissionEvidenceLinkRepository = {
  link(input: {
    subjectType: PermissionEvidenceSubjectType;
    subjectId: string;
    evidenceRecordId: string;
    createdBy: string | null;
  }): Promise<PermissionEvidenceLink>;
  listForSubject(input: {
    subjectType: PermissionEvidenceSubjectType;
    subjectId: string;
  }): Promise<PermissionEvidenceLink[]>;
};

export type EvidenceProvenanceRepository = {
  listEvidenceForValue(
    valueId: string,
  ): Promise<Array<{ evidence: EvidenceRecord; relationshipType: EvidenceRelationshipType }>>;
  listValuesForEvidence(evidenceRecordId: string): Promise<
    Array<{
      valueId: string;
      variableDefinitionId: string;
      relationshipType: EvidenceRelationshipType;
    }>
  >;
};

export type EvidenceAuditPort = {
  append(event: {
    actorUserId: string | null;
    action: string;
    subjectType: SubjectType | 'system';
    subjectId: string | null;
    correlationId: string | null;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

export type EvidenceOutboxPort = {
  insert(event: {
    aggregateType: SubjectType | 'system';
    aggregateId: string;
    eventType:
      | 'evidence.recorded'
      | 'evidence.reviewed'
      | 'observation.accepted'
      | 'observation.rejected'
      | 'confidence.assessed'
      | 'variable_value.stale';
    idempotencyKey: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

export type FreshnessPolicyCarrier = {
  freshnessPolicy: unknown;
};

export type FreshnessValueCarrier = {
  observedAt: Date | null;
  effectiveAt: Date | null;
  expiresAt: Date | null;
  freshnessResult?: FreshnessResult;
};
