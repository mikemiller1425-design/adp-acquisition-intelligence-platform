import { AppError } from '@adp/platform';

import {
  assertNoCredentialFields,
  assertUnitInterval,
  type AccessClassification,
  type JsonObject,
  type SourceType,
} from '../domain/evidence.js';
import {
  AllowListCapabilityChecker,
  type CapabilityActor,
  type CapabilityChecker,
  type EvidenceAuditPort,
  type SourceRecord,
  type SourceRepository,
} from '../domain/ports.js';

export type CreateSourceCommand = {
  sourceType: SourceType;
  title: string;
  locator?: string | null;
  publisher?: string | null;
  defaultReliability?: number | null;
  accessClassification?: AccessClassification;
  retrievalRestrictions?: JsonObject;
  actor: CapabilityActor;
};

export type UpdateSourceCommand = {
  sourceId: string;
  title?: string;
  locator?: string | null;
  publisher?: string | null;
  defaultReliability?: number | null;
  accessClassification?: AccessClassification;
  retrievalRestrictions?: JsonObject;
  actor: CapabilityActor;
};

export class SourceService {
  constructor(
    private readonly sources: SourceRepository,
    private readonly authz: CapabilityChecker = new AllowListCapabilityChecker(),
    private readonly audit?: EvidenceAuditPort,
  ) {}

  async create(command: CreateSourceCommand): Promise<SourceRecord> {
    await this.authz.assertCan(command.actor, 'source:create');
    const locator = normalizeLocator(command.locator ?? null);
    if (locator !== null) {
      const existing = await this.sources.findByTypeAndLocator(command.sourceType, locator);
      if (existing !== null) return existing;
    }

    const restrictions = command.retrievalRestrictions ?? {};
    assertNoCredentialFields(restrictions, 'retrievalRestrictions');
    assertUnitInterval(command.defaultReliability, 'defaultReliability');
    assertNonBlank(command.title, 'title');

    const created = await this.sources.insert({
      sourceType: command.sourceType,
      title: command.title,
      locator,
      publisher: command.publisher ?? null,
      defaultReliability: command.defaultReliability ?? null,
      accessClassification: command.accessClassification ?? 'public',
      retrievalRestrictions: restrictions,
      createdByUserId: command.actor.userId,
      updatedByUserId: command.actor.userId,
    });

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'source_created',
      subjectType: 'system',
      subjectId: null,
      correlationId: null,
      metadata: { sourceId: created.id, sourceType: created.sourceType },
    });

    return created;
  }

  async update(command: UpdateSourceCommand): Promise<SourceRecord> {
    await this.authz.assertCan(command.actor, 'source:update');
    if (command.title !== undefined) assertNonBlank(command.title, 'title');
    if (command.defaultReliability !== undefined) {
      assertUnitInterval(command.defaultReliability, 'defaultReliability');
    }
    if (command.retrievalRestrictions !== undefined) {
      assertNoCredentialFields(command.retrievalRestrictions, 'retrievalRestrictions');
    }

    const locator = command.locator === undefined ? undefined : normalizeLocator(command.locator);
    const updated = await this.sources.update(command.sourceId, {
      ...(command.title !== undefined ? { title: command.title } : {}),
      ...(locator !== undefined ? { locator } : {}),
      ...(command.publisher !== undefined ? { publisher: command.publisher } : {}),
      ...(command.defaultReliability !== undefined
        ? { defaultReliability: command.defaultReliability }
        : {}),
      ...(command.accessClassification !== undefined
        ? { accessClassification: command.accessClassification }
        : {}),
      ...(command.retrievalRestrictions !== undefined
        ? { retrievalRestrictions: command.retrievalRestrictions }
        : {}),
      updatedByUserId: command.actor.userId,
    });
    if (updated === null) throw notFound(command.sourceId);
    return updated;
  }

  async disable(command: { sourceId: string; actor: CapabilityActor }): Promise<SourceRecord> {
    await this.authz.assertCan(command.actor, 'source:disable');
    const disabled = await this.sources.disable(command.sourceId, command.actor.userId);
    if (disabled === null) throw notFound(command.sourceId);
    return disabled;
  }
}

function normalizeLocator(locator: string | null): string | null {
  const trimmed = locator?.trim();
  return trimmed === undefined || trimmed === '' ? null : trimmed;
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

function notFound(sourceId: string): AppError {
  return new AppError({
    code: 'NOT_FOUND',
    message: 'Source not found',
    details: { sourceId },
  });
}
