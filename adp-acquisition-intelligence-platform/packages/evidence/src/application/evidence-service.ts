import { createHash } from 'node:crypto';

import { AppError } from '@adp/platform';

import {
  assertConfidenceComponents,
  assertEffectiveWindow,
  subjectColumns,
  type ConfidenceComponents,
  type EvidenceType,
  type JsonObject,
  type ReviewerStatus,
  type SubjectRef,
} from '../domain/evidence.js';
import {
  AllowListCapabilityChecker,
  type CapabilityActor,
  type CapabilityChecker,
  type EvidenceAuditPort,
  type EvidenceOutboxPort,
  type EvidenceRecord,
  type EvidenceRepository,
} from '../domain/ports.js';

export type CreateEvidenceCommand = SubjectRef & {
  sourceId?: string | null;
  claim: string;
  structuredPayload?: JsonObject;
  evidenceType: EvidenceType;
  observedAt: Date;
  retrievedAt?: Date;
  effectiveAt?: Date | null;
  expiresAt?: Date | null;
  confidenceComponents?: ConfidenceComponents;
  correlationId?: string | null;
  actor: CapabilityActor;
};

export type SupersedeEvidenceCommand = CreateEvidenceCommand & {
  existingEvidenceId: string;
};

export class EvidenceService {
  constructor(
    private readonly evidence: EvidenceRepository,
    private readonly authz: CapabilityChecker = new AllowListCapabilityChecker(),
    private readonly audit?: EvidenceAuditPort,
    private readonly outbox?: EvidenceOutboxPort,
  ) {}

  async create(command: CreateEvidenceCommand): Promise<EvidenceRecord> {
    await this.authz.assertCan(command.actor, 'evidence:create');
    const input = buildCreateInput(command);
    const existing = await this.evidence.findByContentHash(input.contentHash);
    if (existing !== null) return existing;

    const created = await this.evidence.insert(input);
    await this.recordCreatedSideEffects(
      created,
      command.actor.userId,
      command.correlationId ?? null,
    );
    return created;
  }

  async review(command: {
    evidenceRecordId: string;
    reviewerStatus: Exclude<ReviewerStatus, 'pending'>;
    reviewedBy: string | null;
    reviewedAt?: Date;
    actor: CapabilityActor;
    correlationId?: string | null;
  }): Promise<EvidenceRecord> {
    await this.authz.assertCan(command.actor, 'evidence:review');
    const reviewed = await this.evidence.review(command.evidenceRecordId, {
      reviewerStatus: command.reviewerStatus,
      reviewedBy: command.reviewedBy,
      reviewedAt: command.reviewedAt ?? new Date(),
    });
    if (reviewed === null) throw notFound(command.evidenceRecordId);

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'evidence_reviewed',
      subjectType: reviewed.subjectType,
      subjectId:
        reviewed.subjectType === 'organization' ? reviewed.organizationId : reviewed.contactId,
      correlationId: command.correlationId ?? null,
      metadata: {
        evidenceRecordId: reviewed.id,
        reviewerStatus: reviewed.reviewerStatus,
        envelopeVersion: 1,
      },
    });
    await this.outbox?.insert({
      aggregateType: reviewed.subjectType,
      aggregateId:
        reviewed.subjectType === 'organization' ? reviewed.organizationId : reviewed.contactId,
      eventType: 'evidence.reviewed',
      idempotencyKey: command.correlationId ?? `evidence.reviewed:${reviewed.id}`,
      payload: { evidenceRecordId: reviewed.id, reviewerStatus: reviewed.reviewerStatus },
      metadata: { envelopeVersion: 1 },
    });
    return reviewed;
  }

  async supersede(command: SupersedeEvidenceCommand): Promise<EvidenceRecord> {
    await this.authz.assertCan(command.actor, 'evidence:supersede');
    const input = buildCreateInput(command);
    const existingDuplicate = await this.evidence.findByContentHash(input.contentHash);
    if (existingDuplicate !== null) return existingDuplicate;

    const replacement = await this.evidence.supersede(command.existingEvidenceId, input);
    await this.recordCreatedSideEffects(
      replacement,
      command.actor.userId,
      command.correlationId ?? null,
    );
    return replacement;
  }

  private async recordCreatedSideEffects(
    evidence: EvidenceRecord,
    actorUserId: string | null,
    correlationId: string | null,
  ): Promise<void> {
    const aggregateId =
      evidence.subjectType === 'organization' ? evidence.organizationId : evidence.contactId;
    await this.audit?.append({
      actorUserId,
      action: 'evidence_recorded',
      subjectType: evidence.subjectType,
      subjectId: aggregateId,
      correlationId,
      metadata: {
        evidenceRecordId: evidence.id,
        evidenceType: evidence.evidenceType,
        envelopeVersion: 1,
      },
    });
    await this.outbox?.insert({
      aggregateType: evidence.subjectType,
      aggregateId,
      eventType: 'evidence.recorded',
      idempotencyKey: correlationId ?? `evidence.recorded:${evidence.id}`,
      payload: { evidenceRecordId: evidence.id, evidenceType: evidence.evidenceType },
      metadata: { envelopeVersion: 1 },
    });
  }
}

function buildCreateInput(command: CreateEvidenceCommand) {
  assertNonBlank(command.claim, 'claim');
  assertEffectiveWindow({
    effectiveAt: command.effectiveAt ?? null,
    expiresAt: command.expiresAt ?? null,
  });
  const confidenceComponents = command.confidenceComponents ?? {};
  assertConfidenceComponents(confidenceComponents);
  const structuredPayload = command.structuredPayload ?? {};
  const retrievedAt = command.retrievedAt ?? new Date();
  const subject = subjectColumns(command);
  const contentHash = hashEvidenceContent({
    ...subject,
    sourceId: command.sourceId ?? null,
    claim: command.claim,
    structuredPayload,
    evidenceType: command.evidenceType,
    observedAt: command.observedAt.toISOString(),
    retrievedAt: retrievedAt.toISOString(),
    effectiveAt: command.effectiveAt?.toISOString() ?? null,
    expiresAt: command.expiresAt?.toISOString() ?? null,
  });

  return {
    ...command,
    ...subject,
    sourceId: command.sourceId ?? null,
    structuredPayload,
    retrievedAt,
    effectiveAt: command.effectiveAt ?? null,
    expiresAt: command.expiresAt ?? null,
    confidenceComponents,
    reviewerStatus: 'pending' as const,
    contentHash,
    actorUserId: command.actor.userId,
    correlationId: command.correlationId ?? null,
  };
}

function hashEvidenceContent(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
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

function notFound(evidenceRecordId: string): AppError {
  return new AppError({
    code: 'NOT_FOUND',
    message: 'Evidence record not found',
    details: { evidenceRecordId },
  });
}
