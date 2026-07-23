import { AppError } from '@adp/platform';

import type {
  DefinitionLifecycle,
  EvidenceRelationshipType,
  EvidenceType,
  FreshnessResult,
  JsonObject,
  SubjectRef,
  SubjectType,
  ValueLifecycle,
  ValueStatus,
  VariableDataType,
} from './variables.js';

export type ActorRole = 'admin' | 'researcher' | 'sales' | 'reviewer';

export type VariableCapability =
  | 'definition:create'
  | 'definition:version'
  | 'definition:publish'
  | 'definition:retire'
  | 'value:propose'
  | 'value:confirm'
  | 'value:supersede'
  | 'value:contradict'
  | 'value:override'
  | 'value:read';

export type CapabilityActor = {
  userId: string | null;
  roles: readonly ActorRole[];
};

export type CapabilityChecker = {
  assertCan(actor: CapabilityActor, capability: VariableCapability): Promise<void> | void;
};

const roleCapabilities: Record<ActorRole, ReadonlySet<VariableCapability>> = {
  admin: new Set<VariableCapability>([
    'definition:create',
    'definition:version',
    'definition:publish',
    'definition:retire',
    'value:propose',
    'value:confirm',
    'value:supersede',
    'value:contradict',
    'value:override',
    'value:read',
  ]),
  researcher: new Set<VariableCapability>([
    'definition:create',
    'definition:version',
    'value:propose',
    'value:confirm',
    'value:supersede',
    'value:contradict',
    'value:read',
  ]),
  reviewer: new Set<VariableCapability>([
    'definition:publish',
    'definition:retire',
    'value:confirm',
    'value:supersede',
    'value:contradict',
    'value:override',
    'value:read',
  ]),
  sales: new Set<VariableCapability>(['value:propose', 'value:override', 'value:read']),
};

export class AllowListCapabilityChecker implements CapabilityChecker {
  assertCan(actor: CapabilityActor, capability: VariableCapability): void {
    if (actor.roles.some((role) => roleCapabilities[role].has(capability))) return;
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Actor is not authorized for variable capability',
      details: { capability, roles: actor.roles },
    });
  }
}

export type VariableDefinition = {
  id: string;
  key: string;
  displayLabel: string;
  description: string;
  subjectType: SubjectType;
  dataType: VariableDataType;
  status: DefinitionLifecycle;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type VariableDefinitionVersion = {
  id: string;
  definitionId: string;
  version: number;
  unit: string | null;
  allowedValues: unknown;
  rangeConstraints: unknown;
  nullStatusSemantics: unknown;
  collectionMethods: unknown;
  evidenceRequirements: unknown;
  confidenceRequirements: unknown;
  freshnessPolicy: unknown;
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  applicableWorkflows: unknown;
  scoreConsumerMetadata: unknown;
  helpText: string | null;
  lifecycleStatus: DefinitionLifecycle;
  publishedAt: Date | null;
  publishedBy: string | null;
  createdAt: Date;
};

export type VariableDefinitionRepository = {
  findById(id: string): Promise<VariableDefinition | null>;
  findByKey(key: string): Promise<VariableDefinition | null>;
  insertDefinition(input: {
    key: string;
    displayLabel: string;
    description: string;
    subjectType: SubjectType;
    dataType: VariableDataType;
  }): Promise<VariableDefinition>;
  updateDefinition(
    id: string,
    input: Partial<
      Pick<VariableDefinition, 'displayLabel' | 'description' | 'status' | 'currentVersionId'>
    >,
  ): Promise<VariableDefinition | null>;
  findVersionById(id: string): Promise<VariableDefinitionVersion | null>;
  findLatestVersion(definitionId: string): Promise<VariableDefinitionVersion | null>;
  insertVersion(
    input: Omit<VariableDefinitionVersion, 'id' | 'createdAt' | 'publishedAt' | 'publishedBy'>,
  ): Promise<VariableDefinitionVersion>;
  publishVersion(input: {
    definitionId: string;
    versionId: string;
    publishedBy: string | null;
    publishedAt: Date;
  }): Promise<{ definition: VariableDefinition; version: VariableDefinitionVersion } | null>;
};

export type VariableValue = SubjectRef & {
  id: string;
  variableDefinitionId: string;
  definitionVersionId: string;
  typedValue: unknown;
  normalizedValue: unknown;
  valueStatus: ValueStatus;
  evidenceType: EvidenceType;
  confidenceStatus: 'unassessed' | 'provisional' | 'assessed';
  confidenceAssessmentId: string | null;
  lifecycle: ValueLifecycle;
  freshnessResult: FreshnessResult;
  effectiveAt: Date | null;
  observedAt: Date | null;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  sourceActorUserId: string | null;
  calculationActor: string | null;
  supersededById: string | null;
  manualOverrideFlag: boolean;
  overrideActor: string | null;
  overrideReasonCode: string | null;
  overrideReasonNote: string | null;
  overrideAt: Date | null;
  originalValueId: string | null;
  recordVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type VariableValueCreateInput = {
  subjectType: SubjectType;
  organizationId: string | null;
  contactId: string | null;
  variableDefinitionId: string;
  definitionVersionId: string;
  typedValue: unknown;
  normalizedValue: unknown;
  valueStatus: ValueStatus;
  evidenceType: EvidenceType;
  confidenceStatus: 'unassessed' | 'provisional' | 'assessed';
  confidenceAssessmentId: string | null;
  lifecycle: ValueLifecycle;
  freshnessResult: FreshnessResult;
  effectiveAt: Date | null;
  observedAt: Date | null;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  sourceActorUserId: string | null;
  calculationActor: string | null;
  manualOverrideFlag: boolean;
  overrideActor: string | null;
  overrideReasonCode: string | null;
  overrideReasonNote: string | null;
  overrideAt: Date | null;
  originalValueId: string | null;
};

export type VariableValueRepository = {
  findById(id: string): Promise<VariableValue | null>;
  findCurrent(input: {
    subject: SubjectRef;
    variableDefinitionId: string;
  }): Promise<VariableValue | null>;
  listHistory(input: {
    subject: SubjectRef;
    variableDefinitionId: string;
  }): Promise<VariableValue[]>;
  insert(input: VariableValueCreateInput): Promise<VariableValue>;
  confirmCurrent(
    input: VariableValueCreateInput,
  ): Promise<{ value: VariableValue; superseded: VariableValue[] }>;
  updateLifecycle(input: {
    valueId: string;
    lifecycle: ValueLifecycle;
    valueStatus?: ValueStatus;
    supersededById?: string | null;
  }): Promise<VariableValue | null>;
  linkEvidence(input: {
    valueId: string;
    evidenceId: string;
    relationshipType: EvidenceRelationshipType;
    contributionRole: string | null;
    actorUserId: string | null;
  }): Promise<void>;
};

export type VariableAuditPort = {
  append(event: {
    actorUserId: string | null;
    action: string;
    subjectType: SubjectType | 'system';
    subjectId: string | null;
    correlationId: string | null;
    metadata: JsonObject;
  }): Promise<void>;
};

export type VariableOutboxPort = {
  insert(event: {
    aggregateType: SubjectType | 'system';
    aggregateId: string;
    eventType:
      | 'variable_definition.published'
      | 'variable_value.confirmed'
      | 'variable_value.superseded'
      | 'variable_value.contradicted'
      | 'variable_value.stale';
    idempotencyKey: string;
    payload: JsonObject;
    metadata: JsonObject;
  }): Promise<void>;
};
