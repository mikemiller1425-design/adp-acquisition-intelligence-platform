import { AppError } from '@adp/platform';

import {
  normalizeTypedValue,
  subjectColumns,
  validateTypedValue,
  type EvidenceRelationshipType,
  type EvidenceType,
  type FreshnessResult,
  type SubjectRef,
  type ValueStatus,
} from '../domain/variables.js';
import {
  AllowListCapabilityChecker,
  type CapabilityActor,
  type CapabilityChecker,
  type VariableAuditPort,
  type VariableDefinition,
  type VariableDefinitionRepository,
  type VariableDefinitionVersion,
  type VariableOutboxPort,
  type VariableValue,
  type VariableValueCreateInput,
  type VariableValueRepository,
} from '../domain/ports.js';

export type WriteValueCommand = SubjectRef & {
  definitionVersionId: string;
  typedValue: unknown;
  valueStatus?: ValueStatus;
  evidenceType: EvidenceType;
  confidenceStatus?: 'unassessed' | 'provisional' | 'assessed';
  confidenceAssessmentId?: string | null;
  freshnessResult?: FreshnessResult;
  effectiveAt?: Date | null;
  observedAt?: Date | null;
  verifiedAt?: Date | null;
  expiresAt?: Date | null;
  calculationActor?: string | null;
  actor: CapabilityActor;
  correlationId?: string | null;
};

export class VariableValueService {
  constructor(
    private readonly definitions: VariableDefinitionRepository,
    private readonly values: VariableValueRepository,
    private readonly authz: CapabilityChecker = new AllowListCapabilityChecker(),
    private readonly audit?: VariableAuditPort,
    private readonly outbox?: VariableOutboxPort,
  ) {}

  async propose(command: WriteValueCommand): Promise<VariableValue> {
    await this.authz.assertCan(command.actor, 'value:propose');
    const input = await this.buildValueInput(command, 'proposed');
    return this.values.insert(input);
  }

  async confirm(
    command: WriteValueCommand & { evidenceRecordId?: string | null },
  ): Promise<VariableValue> {
    await this.authz.assertCan(command.actor, 'value:confirm');
    const input = await this.buildValueInput(command, 'current');
    const { value, superseded } = await this.values.confirmCurrent(input);
    if (command.evidenceRecordId !== undefined && command.evidenceRecordId !== null) {
      await this.values.linkEvidence({
        valueId: value.id,
        evidenceId: command.evidenceRecordId,
        relationshipType: 'supports',
        contributionRole: 'confirmation',
        actorUserId: command.actor.userId,
      });
    }
    await this.emitConfirmed(
      value,
      superseded,
      command.actor.userId,
      command.correlationId ?? null,
    );
    return value;
  }

  async confirmValue(command: {
    subject: SubjectRef;
    definitionVersionId: string;
    typedValue: unknown;
    evidenceType: EvidenceType;
    actorUserId: string | null;
    correlationId: string | null;
    evidenceRecordId: string | null;
    observedAt: Date | null;
  }): Promise<{ valueId: string }> {
    const value = await this.confirm({
      ...command.subject,
      definitionVersionId: command.definitionVersionId,
      typedValue: command.typedValue,
      evidenceType: command.evidenceType,
      observedAt: command.observedAt,
      actor: { userId: command.actorUserId, roles: ['reviewer'] },
      correlationId: command.correlationId,
      evidenceRecordId: command.evidenceRecordId,
    });
    return { valueId: value.id };
  }

  async supersede(command: WriteValueCommand & { currentValueId: string }): Promise<VariableValue> {
    await this.authz.assertCan(command.actor, 'value:supersede');
    const current = await this.getValue(command.currentValueId);
    const replacement: WriteValueCommand =
      current.subjectType === 'organization'
        ? {
            subjectType: 'organization',
            organizationId: current.organizationId,
            definitionVersionId: command.definitionVersionId,
            typedValue: command.typedValue,
            evidenceType: command.evidenceType,
            actor: command.actor,
          }
        : {
            subjectType: 'contact',
            contactId: current.contactId,
            definitionVersionId: command.definitionVersionId,
            typedValue: command.typedValue,
            evidenceType: command.evidenceType,
            actor: command.actor,
          };
    if (command.valueStatus !== undefined) replacement.valueStatus = command.valueStatus;
    if (command.confidenceStatus !== undefined)
      replacement.confidenceStatus = command.confidenceStatus;
    if (command.confidenceAssessmentId !== undefined) {
      replacement.confidenceAssessmentId = command.confidenceAssessmentId;
    }
    if (command.freshnessResult !== undefined)
      replacement.freshnessResult = command.freshnessResult;
    if (command.effectiveAt !== undefined) replacement.effectiveAt = command.effectiveAt;
    if (command.observedAt !== undefined) replacement.observedAt = command.observedAt;
    if (command.verifiedAt !== undefined) replacement.verifiedAt = command.verifiedAt;
    if (command.expiresAt !== undefined) replacement.expiresAt = command.expiresAt;
    if (command.calculationActor !== undefined)
      replacement.calculationActor = command.calculationActor;
    if (command.correlationId !== undefined) replacement.correlationId = command.correlationId;
    const input = await this.buildValueInput(replacement, 'current');
    const { value, superseded } = await this.values.confirmCurrent(input);
    await this.emitSuperseded(
      value,
      superseded,
      command.actor.userId,
      command.correlationId ?? null,
    );
    return value;
  }

  async markContradicted(command: {
    valueId: string;
    actor: CapabilityActor;
    correlationId?: string | null;
  }): Promise<VariableValue> {
    await this.authz.assertCan(command.actor, 'value:contradict');
    const contradicted = await this.values.updateLifecycle({
      valueId: command.valueId,
      lifecycle: 'contradicted',
      valueStatus: 'contradicted',
    });
    if (contradicted === null) throw valueNotFound(command.valueId);
    await this.outbox?.insert({
      aggregateType: contradicted.subjectType,
      aggregateId:
        contradicted.subjectType === 'organization'
          ? contradicted.organizationId
          : contradicted.contactId,
      eventType: 'variable_value.contradicted',
      idempotencyKey: command.correlationId ?? `variable_value.contradicted:${contradicted.id}`,
      payload: { valueId: contradicted.id },
      metadata: { envelopeVersion: 1 },
    });
    return contradicted;
  }

  async applyManualOverride(
    command: WriteValueCommand & {
      overrideReasonCode: string;
      overrideReasonNote?: string | null;
    },
  ): Promise<VariableValue> {
    await this.authz.assertCan(command.actor, 'value:override');
    const definition = await this.definitionForVersion(command.definitionVersionId);
    const current = await this.values.findCurrent({
      subject: command,
      variableDefinitionId: definition.definition.id,
    });
    const input = await this.buildValueInput(command, 'current');
    const overrideInput: VariableValueCreateInput = {
      ...input,
      manualOverrideFlag: true,
      overrideActor: command.actor.userId,
      overrideReasonCode: command.overrideReasonCode,
      overrideReasonNote: command.overrideReasonNote ?? null,
      overrideAt: new Date(),
      originalValueId: current?.id ?? null,
    };
    const { value } = await this.values.confirmCurrent(overrideInput);
    return value;
  }

  async removeManualOverride(command: {
    subject: SubjectRef;
    variableDefinitionId: string;
    actor: CapabilityActor;
    correlationId?: string | null;
  }): Promise<VariableValue> {
    await this.authz.assertCan(command.actor, 'value:override');
    const current = await this.values.findCurrent({
      subject: command.subject,
      variableDefinitionId: command.variableDefinitionId,
    });
    if (current === null) throw currentNotFound(command.variableDefinitionId);
    if (!current.manualOverrideFlag || current.originalValueId === null) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Current value is not a removable manual override',
        details: { valueId: current.id },
      });
    }
    const original = await this.getValue(current.originalValueId);
    const { value } = await this.values.confirmCurrent({
      ...copyValueForTransition(original),
      sourceActorUserId: command.actor.userId,
      manualOverrideFlag: false,
      originalValueId: current.originalValueId,
    });
    await this.emitConfirmed(value, [current], command.actor.userId, command.correlationId ?? null);
    return value;
  }

  async evaluateEffectiveCurrent(command: {
    subject: SubjectRef;
    variableDefinitionId: string;
    actor: CapabilityActor;
  }): Promise<VariableValue | null> {
    await this.authz.assertCan(command.actor, 'value:read');
    return this.values.findCurrent(command);
  }

  async history(command: {
    subject: SubjectRef;
    variableDefinitionId: string;
    actor: CapabilityActor;
  }): Promise<VariableValue[]> {
    await this.authz.assertCan(command.actor, 'value:read');
    return this.values.listHistory(command);
  }

  async linkEvidence(command: {
    valueId: string;
    evidenceId: string;
    relationshipType: EvidenceRelationshipType;
    contributionRole?: string | null;
    actor: CapabilityActor;
  }): Promise<void> {
    await this.authz.assertCan(command.actor, 'value:confirm');
    await this.values.linkEvidence({
      valueId: command.valueId,
      evidenceId: command.evidenceId,
      relationshipType: command.relationshipType,
      contributionRole: command.contributionRole ?? null,
      actorUserId: command.actor.userId,
    });
  }

  private async buildValueInput(
    command: WriteValueCommand,
    lifecycle: 'proposed' | 'current',
  ): Promise<VariableValueCreateInput> {
    const { definition, version } = await this.definitionForVersion(command.definitionVersionId);
    const valueStatus = command.valueStatus ?? 'known';
    validateTypedValue({
      dataType: definition.dataType,
      allowedValues: version.allowedValues,
      rangeConstraints: version.rangeConstraints,
      typedValue: command.typedValue,
      valueStatus,
      evidenceType: command.evidenceType,
    });
    return {
      ...subjectColumns(command),
      variableDefinitionId: definition.id,
      definitionVersionId: version.id,
      typedValue: command.typedValue,
      normalizedValue: normalizeTypedValue({
        dataType: definition.dataType,
        allowedValues: version.allowedValues,
        rangeConstraints: version.rangeConstraints,
        typedValue: command.typedValue,
        valueStatus,
        evidenceType: command.evidenceType,
      }),
      valueStatus,
      evidenceType: command.evidenceType,
      confidenceStatus: command.confidenceStatus ?? 'unassessed',
      confidenceAssessmentId: command.confidenceAssessmentId ?? null,
      lifecycle,
      freshnessResult: command.freshnessResult ?? 'unknown',
      effectiveAt: command.effectiveAt ?? null,
      observedAt: command.observedAt ?? null,
      verifiedAt:
        command.verifiedAt ?? (command.evidenceType === 'verified_fact' ? new Date() : null),
      expiresAt: command.expiresAt ?? null,
      sourceActorUserId: command.actor.userId,
      calculationActor: command.calculationActor ?? null,
      manualOverrideFlag: false,
      overrideActor: null,
      overrideReasonCode: null,
      overrideReasonNote: null,
      overrideAt: null,
      originalValueId: null,
    };
  }

  private async definitionForVersion(
    definitionVersionId: string,
  ): Promise<{ definition: VariableDefinition; version: VariableDefinitionVersion }> {
    const version = await this.definitions.findVersionById(definitionVersionId);
    if (version === null) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Variable definition version not found',
        details: { definitionVersionId },
      });
    }
    const definition = await this.definitions.findById(version.definitionId);
    if (definition === null) throw definitionNotFound(version.definitionId);
    return { definition, version };
  }

  private async getValue(valueId: string): Promise<VariableValue> {
    const value = await this.values.findById(valueId);
    if (value === null) throw valueNotFound(valueId);
    return value;
  }

  private async emitConfirmed(
    value: VariableValue,
    superseded: VariableValue[],
    actorUserId: string | null,
    correlationId: string | null,
  ): Promise<void> {
    const aggregateId =
      value.subjectType === 'organization' ? value.organizationId : value.contactId;
    await this.audit?.append({
      actorUserId,
      action: 'variable_value_confirmed',
      subjectType: value.subjectType,
      subjectId: aggregateId,
      correlationId,
      metadata: { valueId: value.id, supersededValueIds: superseded.map((item) => item.id) },
    });
    await this.outbox?.insert({
      aggregateType: value.subjectType,
      aggregateId,
      eventType: 'variable_value.confirmed',
      idempotencyKey: correlationId ?? `variable_value.confirmed:${value.id}`,
      payload: { valueId: value.id, supersededValueIds: superseded.map((item) => item.id) },
      metadata: { envelopeVersion: 1 },
    });
  }

  private async emitSuperseded(
    value: VariableValue,
    superseded: VariableValue[],
    actorUserId: string | null,
    correlationId: string | null,
  ): Promise<void> {
    await this.emitConfirmed(value, superseded, actorUserId, correlationId);
    await this.outbox?.insert({
      aggregateType: value.subjectType,
      aggregateId: value.subjectType === 'organization' ? value.organizationId : value.contactId,
      eventType: 'variable_value.superseded',
      idempotencyKey: correlationId ?? `variable_value.superseded:${value.id}`,
      payload: { valueId: value.id, supersededValueIds: superseded.map((item) => item.id) },
      metadata: { envelopeVersion: 1 },
    });
  }
}

function copyValueForTransition(value: VariableValue): VariableValueCreateInput {
  return {
    ...(value.subjectType === 'organization'
      ? {
          subjectType: 'organization' as const,
          organizationId: value.organizationId,
          contactId: null,
        }
      : { subjectType: 'contact' as const, organizationId: null, contactId: value.contactId }),
    variableDefinitionId: value.variableDefinitionId,
    definitionVersionId: value.definitionVersionId,
    typedValue: value.typedValue,
    normalizedValue: value.normalizedValue,
    valueStatus: value.valueStatus,
    evidenceType: value.evidenceType,
    confidenceStatus: value.confidenceStatus,
    confidenceAssessmentId: value.confidenceAssessmentId,
    lifecycle: 'current',
    freshnessResult: value.freshnessResult,
    effectiveAt: value.effectiveAt,
    observedAt: value.observedAt,
    verifiedAt: value.verifiedAt,
    expiresAt: value.expiresAt,
    sourceActorUserId: value.sourceActorUserId,
    calculationActor: value.calculationActor,
    manualOverrideFlag: false,
    overrideActor: null,
    overrideReasonCode: null,
    overrideReasonNote: null,
    overrideAt: null,
    originalValueId: value.originalValueId,
  };
}

function definitionNotFound(definitionId: string): AppError {
  return new AppError({
    code: 'NOT_FOUND',
    message: 'Variable definition not found',
    details: { definitionId },
  });
}

function valueNotFound(valueId: string): AppError {
  return new AppError({
    code: 'NOT_FOUND',
    message: 'Variable value not found',
    details: { valueId },
  });
}

function currentNotFound(variableDefinitionId: string): AppError {
  return new AppError({
    code: 'NOT_FOUND',
    message: 'Current variable value not found',
    details: { variableDefinitionId },
  });
}
