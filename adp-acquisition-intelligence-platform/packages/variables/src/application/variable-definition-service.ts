import { AppError } from '@adp/platform';

import type { SubjectType, VariableDataType } from '../domain/variables.js';
import {
  AllowListCapabilityChecker,
  type CapabilityActor,
  type CapabilityChecker,
  type VariableAuditPort,
  type VariableDefinition,
  type VariableDefinitionRepository,
  type VariableDefinitionVersion,
  type VariableOutboxPort,
} from '../domain/ports.js';

export type VersionDraft = {
  unit?: string | null;
  allowedValues?: unknown;
  rangeConstraints?: unknown;
  nullStatusSemantics?: unknown;
  collectionMethods?: unknown;
  evidenceRequirements?: unknown;
  confidenceRequirements?: unknown;
  freshnessPolicy?: unknown;
  sensitivity?: 'public' | 'internal' | 'confidential' | 'restricted';
  applicableWorkflows?: unknown;
  scoreConsumerMetadata?: unknown;
  helpText?: string | null;
};

export class VariableDefinitionService {
  constructor(
    private readonly definitions: VariableDefinitionRepository,
    private readonly authz: CapabilityChecker = new AllowListCapabilityChecker(),
    private readonly audit?: VariableAuditPort,
    private readonly outbox?: VariableOutboxPort,
  ) {}

  async createDraftDefinition(command: {
    key: string;
    displayLabel: string;
    description: string;
    subjectType: SubjectType;
    dataType: VariableDataType;
    actor: CapabilityActor;
  }): Promise<VariableDefinition> {
    await this.authz.assertCan(command.actor, 'definition:create');
    assertKey(command.key);
    assertNonBlank(command.displayLabel, 'displayLabel');
    assertNonBlank(command.description, 'description');
    const existing = await this.definitions.findByKey(command.key);
    if (existing !== null) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Variable definition key already exists',
        details: { key: command.key },
      });
    }
    return this.definitions.insertDefinition({
      key: command.key,
      displayLabel: command.displayLabel,
      description: command.description,
      subjectType: command.subjectType,
      dataType: command.dataType,
    });
  }

  async addVersion(command: {
    definitionId: string;
    draft: VersionDraft;
    actor: CapabilityActor;
  }): Promise<VariableDefinitionVersion> {
    await this.authz.assertCan(command.actor, 'definition:version');
    const definition = await this.definitions.findById(command.definitionId);
    if (definition === null) throw definitionNotFound(command.definitionId);
    if (definition.status === 'retired') {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Cannot add a version to a retired definition',
        details: { definitionId: definition.id },
      });
    }
    const latest = await this.definitions.findLatestVersion(definition.id);
    const version = (latest?.version ?? 0) + 1;
    return this.definitions.insertVersion({
      definitionId: definition.id,
      version,
      unit: command.draft.unit ?? null,
      allowedValues: command.draft.allowedValues ?? null,
      rangeConstraints: command.draft.rangeConstraints ?? null,
      nullStatusSemantics: command.draft.nullStatusSemantics ?? null,
      collectionMethods: command.draft.collectionMethods ?? null,
      evidenceRequirements: command.draft.evidenceRequirements ?? null,
      confidenceRequirements: command.draft.confidenceRequirements ?? null,
      freshnessPolicy: command.draft.freshnessPolicy ?? null,
      sensitivity: command.draft.sensitivity ?? 'internal',
      applicableWorkflows: command.draft.applicableWorkflows ?? [],
      scoreConsumerMetadata: command.draft.scoreConsumerMetadata ?? null,
      helpText: command.draft.helpText ?? null,
      lifecycleStatus: 'draft',
    });
  }

  async publishVersion(command: {
    definitionId: string;
    versionId: string;
    actor: CapabilityActor;
    correlationId?: string | null;
  }): Promise<{ definition: VariableDefinition; version: VariableDefinitionVersion }> {
    await this.authz.assertCan(command.actor, 'definition:publish');
    const version = await this.definitions.findVersionById(command.versionId);
    if (version === null || version.definitionId !== command.definitionId) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Variable definition version not found',
        details: { definitionId: command.definitionId, versionId: command.versionId },
      });
    }
    if (version.lifecycleStatus === 'retired') {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Retired definition versions cannot be published',
        details: { versionId: version.id },
      });
    }

    const published = await this.definitions.publishVersion({
      definitionId: command.definitionId,
      versionId: command.versionId,
      publishedBy: command.actor.userId,
      publishedAt: new Date(),
    });
    if (published === null) throw definitionNotFound(command.definitionId);

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'variable_definition_published',
      subjectType: 'system',
      subjectId: null,
      correlationId: command.correlationId ?? null,
      metadata: {
        definitionId: command.definitionId,
        versionId: command.versionId,
        envelopeVersion: 1,
      },
    });
    await this.outbox?.insert({
      aggregateType: 'system',
      aggregateId: command.definitionId,
      eventType: 'variable_definition.published',
      idempotencyKey: command.correlationId ?? `variable_definition.published:${command.versionId}`,
      payload: { definitionId: command.definitionId, versionId: command.versionId },
      metadata: { envelopeVersion: 1 },
    });

    return published;
  }

  async retire(command: {
    definitionId: string;
    actor: CapabilityActor;
  }): Promise<VariableDefinition> {
    await this.authz.assertCan(command.actor, 'definition:retire');
    const retired = await this.definitions.updateDefinition(command.definitionId, {
      status: 'retired',
    });
    if (retired === null) throw definitionNotFound(command.definitionId);
    return retired;
  }
}

function assertKey(key: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: 'Variable definition key must be snake_case',
      details: { key },
    });
  }
}

function assertNonBlank(value: string, field: string): void {
  if (value.trim() === '') {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: `${field} must not be blank`,
      details: { field },
    });
  }
}

function definitionNotFound(definitionId: string): AppError {
  return new AppError({
    code: 'NOT_FOUND',
    message: 'Variable definition not found',
    details: { definitionId },
  });
}
