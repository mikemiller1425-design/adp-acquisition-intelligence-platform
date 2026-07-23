import {
  accountAssignments,
  auditEvents,
  campaignEnrollments,
  messageApprovals,
  messageDrafts,
  messageTemplateVersions,
  messageTemplates,
  organizations,
  outreachActivities,
  outreachCampaignVersions,
  outreachCampaigns,
  outreachReadinessAssessments,
  outreachRecipients,
  outreachResponses,
  outreachSequenceHistory,
  outreachSequenceSteps,
  outreachSequenceVersions,
  outreachSequences,
  outboxEvents,
  responseClassifications,
  type RepositoryExecutor,
} from '@adp/database';
import type { Channel, ConsentPermissionService } from '@adp/consent';
import { and, asc, eq, isNull } from 'drizzle-orm';

import type {
  ActivityRepository,
  ApprovalRepository,
  CampaignRepository,
  DraftRepository,
  DraftStatus,
  EnrollmentRepository,
  EnrollmentStatus,
  ActivityType,
  OrganizationContextPort,
  OutreachAuditPort,
  OutreachConsentOptOutPort,
  OutreachOutboxPort,
  OutreachPermissionPort,
  ReadinessRepository,
  ResponseClassification,
  ResponseRepository,
  SequenceHistoryEntry,
  SequenceHistoryRepository,
  SequenceRepository,
  TemplateRepository,
} from '../domain/ports.js';

type Db = RepositoryExecutor;

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected database row');
  return row;
}

function one<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

export class PostgresOrganizationContextAdapter implements OrganizationContextPort {
  constructor(private readonly db: Db) {}

  async findOrganizationContext(organizationId: string) {
    const org = one(
      await this.db
        .select({
          organizationId: organizations.id,
          prospectStage: organizations.prospectStage,
          outreachStatus: organizations.outreachStatus,
          recordVersion: organizations.recordVersion,
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1),
    );
    if (org === null) return null;

    const owner = one(
      await this.db
        .select({ userId: accountAssignments.userId })
        .from(accountAssignments)
        .where(
          and(
            eq(accountAssignments.organizationId, organizationId),
            eq(accountAssignments.assignmentRole, 'owner'),
            isNull(accountAssignments.effectiveTo),
          ),
        )
        .limit(1),
    );

    return {
      organizationId: org.organizationId,
      prospectStage: org.prospectStage,
      outreachStatus: org.outreachStatus,
      recordVersion: org.recordVersion,
      ownerUserId: owner?.userId ?? null,
    };
  }
}

export class ConsentPermissionAdapter implements OutreachPermissionPort {
  constructor(private readonly consent: ConsentPermissionService) {}

  evaluateOutreachPermission(
    command: Parameters<ConsentPermissionService['evaluateOutreachPermission']>[0],
  ) {
    return this.consent.evaluateOutreachPermission(command);
  }
}

export class ConsentOptOutAdapter implements OutreachConsentOptOutPort {
  constructor(private readonly consent: ConsentPermissionService) {}

  async recordOptOut(command: {
    contactId: string;
    organizationId: string;
    channel: Parameters<ConsentPermissionService['evaluateOutreachPermission']>[0]['channel'];
    capturedByUserId: string | null;
    reasonCode?: string | null;
    reasonNote?: string | null;
  }): Promise<void> {
    await this.consent.upsertSuppression({
      scope: 'contact_channel',
      contactId: command.contactId,
      organizationId: command.organizationId,
      channel: command.channel,
      identifierType: null,
      identifierHash: null,
      state: 'opted_out',
      source: 'response_unsubscribe',
      capturedByUserId: command.capturedByUserId,
      reasonCode: command.reasonCode ?? 'response_unsubscribe',
      reasonNote: command.reasonNote ?? null,
      effectiveAt: new Date(),
      expiresAt: null,
      revokedAt: null,
      evidenceRef: null,
    });
  }
}

export class PostgresCampaignRepository implements CampaignRepository {
  constructor(private readonly db: Db) {}

  async findPublishedVersionByKey(key: string) {
    const row = one(
      await this.db
        .select({ version: outreachCampaignVersions, campaign: outreachCampaigns })
        .from(outreachCampaignVersions)
        .innerJoin(outreachCampaigns, eq(outreachCampaignVersions.campaignId, outreachCampaigns.id))
        .where(
          and(eq(outreachCampaigns.key, key), eq(outreachCampaignVersions.status, 'published')),
        )
        .limit(1),
    );
    return row === null ? null : mapCampaignVersion(row.version, row.campaign.key);
  }

  async publishVersion(command: { campaignKey: string; version: string; actorUserId: string }) {
    const row = one(
      await this.db
        .select({ version: outreachCampaignVersions, campaign: outreachCampaigns })
        .from(outreachCampaignVersions)
        .innerJoin(outreachCampaigns, eq(outreachCampaignVersions.campaignId, outreachCampaigns.id))
        .where(
          and(
            eq(outreachCampaigns.key, command.campaignKey),
            eq(outreachCampaignVersions.version, command.version),
          ),
        )
        .limit(1),
    );
    if (row === null) {
      throw new Error(`Campaign version not found: ${command.campaignKey}@${command.version}`);
    }
    const publishedAt = new Date();
    const updated = first(
      await this.db
        .update(outreachCampaignVersions)
        .set({
          status: 'published',
          publishedAt,
          publishedByUserId: command.actorUserId,
          updatedAt: publishedAt,
        })
        .where(eq(outreachCampaignVersions.id, row.version.id))
        .returning(),
    );
    await this.db
      .update(outreachCampaigns)
      .set({
        status: 'published',
        currentVersionId: updated.id,
        updatedAt: publishedAt,
      })
      .where(eq(outreachCampaigns.id, row.campaign.id));
    return mapCampaignVersion(updated, row.campaign.key);
  }
}

export class PostgresTemplateRepository implements TemplateRepository {
  constructor(private readonly db: Db) {}

  async findPublishedVersionByKey(key: string) {
    const row = one(
      await this.db
        .select({ version: messageTemplateVersions, template: messageTemplates })
        .from(messageTemplateVersions)
        .innerJoin(messageTemplates, eq(messageTemplateVersions.templateId, messageTemplates.id))
        .where(and(eq(messageTemplates.key, key), eq(messageTemplateVersions.status, 'published')))
        .limit(1),
    );
    return row === null ? null : mapTemplateVersion(row.version, row.template);
  }

  async findPublishedVersionById(id: string) {
    const row = one(
      await this.db
        .select({ version: messageTemplateVersions, template: messageTemplates })
        .from(messageTemplateVersions)
        .innerJoin(messageTemplates, eq(messageTemplateVersions.templateId, messageTemplates.id))
        .where(
          and(eq(messageTemplateVersions.id, id), eq(messageTemplateVersions.status, 'published')),
        )
        .limit(1),
    );
    return row === null ? null : mapTemplateVersion(row.version, row.template);
  }

  async publishVersion(command: { templateKey: string; version: string; actorUserId: string }) {
    const row = one(
      await this.db
        .select({ version: messageTemplateVersions, template: messageTemplates })
        .from(messageTemplateVersions)
        .innerJoin(messageTemplates, eq(messageTemplateVersions.templateId, messageTemplates.id))
        .where(
          and(
            eq(messageTemplates.key, command.templateKey),
            eq(messageTemplateVersions.version, command.version),
          ),
        )
        .limit(1),
    );
    if (row === null) {
      throw new Error(`Template version not found: ${command.templateKey}@${command.version}`);
    }
    const publishedAt = new Date();
    const updated = first(
      await this.db
        .update(messageTemplateVersions)
        .set({
          status: 'published',
          publishedAt,
          publishedByUserId: command.actorUserId,
          updatedAt: publishedAt,
        })
        .where(eq(messageTemplateVersions.id, row.version.id))
        .returning(),
    );
    await this.db
      .update(messageTemplates)
      .set({
        status: 'published',
        currentVersionId: updated.id,
        updatedAt: publishedAt,
      })
      .where(eq(messageTemplates.id, row.template.id));
    return mapTemplateVersion(updated, row.template);
  }
}

export class PostgresSequenceRepository implements SequenceRepository {
  constructor(private readonly db: Db) {}

  async findPublishedVersionByKey(key: string) {
    const row = one(
      await this.db
        .select({ version: outreachSequenceVersions, sequence: outreachSequences })
        .from(outreachSequenceVersions)
        .innerJoin(outreachSequences, eq(outreachSequenceVersions.sequenceId, outreachSequences.id))
        .where(
          and(eq(outreachSequences.key, key), eq(outreachSequenceVersions.status, 'published')),
        )
        .limit(1),
    );
    return row === null ? null : mapSequenceVersion(row.version);
  }

  async listPublishedSteps(sequenceVersionId: string) {
    const rows = await this.db
      .select()
      .from(outreachSequenceSteps)
      .where(eq(outreachSequenceSteps.sequenceVersionId, sequenceVersionId))
      .orderBy(asc(outreachSequenceSteps.stepOrder));
    return rows.map(mapSequenceStep);
  }

  async findStepById(stepId: string) {
    const row = one(
      await this.db
        .select()
        .from(outreachSequenceSteps)
        .where(eq(outreachSequenceSteps.id, stepId))
        .limit(1),
    );
    return row === null ? null : mapSequenceStep(row);
  }

  async publishVersion(command: { sequenceKey: string; version: string; actorUserId: string }) {
    const row = one(
      await this.db
        .select({ version: outreachSequenceVersions, sequence: outreachSequences })
        .from(outreachSequenceVersions)
        .innerJoin(outreachSequences, eq(outreachSequenceVersions.sequenceId, outreachSequences.id))
        .where(
          and(
            eq(outreachSequences.key, command.sequenceKey),
            eq(outreachSequenceVersions.version, command.version),
          ),
        )
        .limit(1),
    );
    if (row === null) {
      throw new Error(`Sequence version not found: ${command.sequenceKey}@${command.version}`);
    }
    const publishedAt = new Date();
    const updated = first(
      await this.db
        .update(outreachSequenceVersions)
        .set({
          status: 'published',
          publishedAt,
          publishedByUserId: command.actorUserId,
          updatedAt: publishedAt,
        })
        .where(eq(outreachSequenceVersions.id, row.version.id))
        .returning(),
    );
    await this.db
      .update(outreachSequences)
      .set({
        status: 'published',
        currentVersionId: updated.id,
        updatedAt: publishedAt,
      })
      .where(eq(outreachSequences.id, row.sequence.id));
    return mapSequenceVersion(updated);
  }
}

export class PostgresEnrollmentRepository implements EnrollmentRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string) {
    const row = one(
      await this.db
        .select()
        .from(campaignEnrollments)
        .where(eq(campaignEnrollments.id, id))
        .limit(1),
    );
    return row === null ? null : mapEnrollment(row);
  }

  async findByCorrelationId(correlationId: string) {
    const row = one(
      await this.db
        .select()
        .from(campaignEnrollments)
        .where(eq(campaignEnrollments.commandCorrelationId, correlationId))
        .limit(1),
    );
    return row === null ? null : mapEnrollment(row);
  }

  async create(command: {
    organizationId: string;
    contactId: string;
    campaignVersionId: string;
    sequenceVersionId: string;
    ownerUserId: string | null;
    permissionSnapshot: Record<string, unknown>;
    commandCorrelationId?: string | null;
  }) {
    const row = first(
      await this.db
        .insert(campaignEnrollments)
        .values({
          organizationId: command.organizationId,
          contactId: command.contactId,
          campaignVersionId: command.campaignVersionId,
          sequenceVersionId: command.sequenceVersionId,
          ownerUserId: command.ownerUserId,
          permissionSnapshot: command.permissionSnapshot,
          commandCorrelationId: command.commandCorrelationId ?? null,
          status: 'pending',
        })
        .returning(),
    );
    return mapEnrollment(row);
  }

  async updateStatus(command: {
    enrollmentId: string;
    status: EnrollmentStatus;
    expectedRecordVersion: number;
    enrolledAt?: Date | null;
    pausedAt?: Date | null;
    exitedAt?: Date | null;
    exitReason?: string | null;
    currentStepId?: string | null;
  }) {
    const row = one(
      await this.db
        .update(campaignEnrollments)
        .set({
          status: command.status,
          enrolledAt: command.enrolledAt,
          pausedAt: command.pausedAt,
          exitedAt: command.exitedAt,
          exitReason: command.exitReason,
          currentStepId: command.currentStepId,
          recordVersion: command.expectedRecordVersion + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(campaignEnrollments.id, command.enrollmentId),
            eq(campaignEnrollments.recordVersion, command.expectedRecordVersion),
          ),
        )
        .returning(),
    );
    return row === null ? null : mapEnrollment(row);
  }

  async createRecipient(command: { enrollmentId: string; contactId: string; channel: Channel }) {
    await this.db.insert(outreachRecipients).values({
      enrollmentId: command.enrollmentId,
      contactId: command.contactId,
      channel: command.channel,
      status: 'active',
    });
  }
}

export class PostgresDraftRepository implements DraftRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string) {
    const row = one(
      await this.db.select().from(messageDrafts).where(eq(messageDrafts.id, id)).limit(1),
    );
    return row === null ? null : mapDraft(row);
  }

  async create(command: {
    enrollmentId: string;
    sequenceStepId: string | null;
    templateVersionId: string;
    channel: Channel;
    renderedSubject: string | null;
    renderedBody: string;
    contextRefs: Record<string, unknown>;
    permissionSnapshot: Record<string, unknown>;
    createdByUserId: string | null;
  }) {
    const row = first(
      await this.db
        .insert(messageDrafts)
        .values({
          enrollmentId: command.enrollmentId,
          sequenceStepId: command.sequenceStepId,
          templateVersionId: command.templateVersionId,
          channel: command.channel,
          renderedSubject: command.renderedSubject,
          renderedBody: command.renderedBody,
          contextRefs: command.contextRefs,
          permissionSnapshot: command.permissionSnapshot,
          createdByUserId: command.createdByUserId,
          status: 'draft',
        })
        .returning(),
    );
    return mapDraft(row);
  }

  async updateStatus(draftId: string, status: DraftStatus) {
    const row = first(
      await this.db
        .update(messageDrafts)
        .set({ status, updatedAt: new Date() })
        .where(eq(messageDrafts.id, draftId))
        .returning(),
    );
    return mapDraft(row);
  }
}

export class PostgresApprovalRepository implements ApprovalRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string) {
    const row = one(
      await this.db.select().from(messageApprovals).where(eq(messageApprovals.id, id)).limit(1),
    );
    return row === null ? null : mapApproval(row);
  }

  async findPendingByDraftId(draftId: string) {
    const row = one(
      await this.db
        .select()
        .from(messageApprovals)
        .where(and(eq(messageApprovals.draftId, draftId), eq(messageApprovals.status, 'pending')))
        .limit(1),
    );
    return row === null ? null : mapApproval(row);
  }

  async create(command: { draftId: string; permissionSnapshot: Record<string, unknown> }) {
    const row = first(
      await this.db
        .insert(messageApprovals)
        .values({
          draftId: command.draftId,
          permissionSnapshot: command.permissionSnapshot,
          status: 'pending',
        })
        .returning(),
    );
    return mapApproval(row);
  }

  async decide(command: {
    approvalId: string;
    status: 'approved' | 'rejected';
    decidedByUserId: string;
    permissionSnapshot: Record<string, unknown>;
    notes?: string | null;
  }) {
    const row = first(
      await this.db
        .update(messageApprovals)
        .set({
          status: command.status,
          decidedByUserId: command.decidedByUserId,
          decidedAt: new Date(),
          permissionSnapshot: command.permissionSnapshot,
          notes: command.notes ?? null,
          updatedAt: new Date(),
        })
        .where(eq(messageApprovals.id, command.approvalId))
        .returning(),
    );
    return mapApproval(row);
  }
}

export class PostgresActivityRepository implements ActivityRepository {
  constructor(private readonly db: Db) {}

  async create(command: {
    enrollmentId: string;
    draftId?: string | null;
    activityType: ActivityType;
    channel: Channel;
    immutableSnapshot: Record<string, unknown>;
    permissionSnapshot: Record<string, unknown>;
    createdByUserId: string | null;
    occurredAt?: Date;
  }) {
    const row = first(
      await this.db
        .insert(outreachActivities)
        .values({
          enrollmentId: command.enrollmentId,
          draftId: command.draftId ?? null,
          activityType: command.activityType,
          channel: command.channel,
          immutableSnapshot: command.immutableSnapshot,
          permissionSnapshot: command.permissionSnapshot,
          createdByUserId: command.createdByUserId,
          occurredAt: command.occurredAt ?? new Date(),
        })
        .returning(),
    );
    return mapActivity(row);
  }
}

export class PostgresResponseRepository implements ResponseRepository {
  constructor(private readonly db: Db) {}

  async create(command: {
    enrollmentId: string;
    activityId?: string | null;
    channel: Channel;
    originalText: string;
    receivedAt?: Date;
  }) {
    const row = first(
      await this.db
        .insert(outreachResponses)
        .values({
          enrollmentId: command.enrollmentId,
          activityId: command.activityId ?? null,
          channel: command.channel,
          originalText: command.originalText,
          receivedAt: command.receivedAt ?? new Date(),
        })
        .returning(),
    );
    return {
      id: row.id,
      enrollmentId: row.enrollmentId,
      activityId: row.activityId,
      channel: row.channel,
      originalText: row.originalText,
      receivedAt: row.receivedAt,
    };
  }

  async classify(command: {
    responseId: string;
    classification: ResponseClassification;
    classifiedByUserId: string;
    notes?: string | null;
  }) {
    const row = first(
      await this.db
        .insert(responseClassifications)
        .values({
          responseId: command.responseId,
          classification: command.classification,
          classifiedByUserId: command.classifiedByUserId,
          notes: command.notes ?? null,
        })
        .returning(),
    );
    return {
      id: row.id,
      responseId: row.responseId,
      classification: row.classification,
      classifiedByUserId: row.classifiedByUserId,
      classifiedAt: row.classifiedAt,
      notes: row.notes,
    };
  }
}

export class PostgresSequenceHistoryRepository implements SequenceHistoryRepository {
  constructor(private readonly db: Db) {}

  async findByEnrollmentAndStep(enrollmentId: string, stepId: string) {
    const row = one(
      await this.db
        .select()
        .from(outreachSequenceHistory)
        .where(
          and(
            eq(outreachSequenceHistory.enrollmentId, enrollmentId),
            eq(outreachSequenceHistory.stepId, stepId),
          ),
        )
        .limit(1),
    );
    return row === null ? null : mapHistory(row);
  }

  async listByEnrollment(enrollmentId: string) {
    const rows = await this.db
      .select()
      .from(outreachSequenceHistory)
      .where(eq(outreachSequenceHistory.enrollmentId, enrollmentId));
    return rows.map(mapHistory);
  }

  async upsert(command: {
    enrollmentId: string;
    stepId: string;
    status: SequenceHistoryEntry['status'];
    advancedAt?: Date | null;
  }) {
    const existing = await this.findByEnrollmentAndStep(command.enrollmentId, command.stepId);
    if (existing === null) {
      const row = first(
        await this.db
          .insert(outreachSequenceHistory)
          .values({
            enrollmentId: command.enrollmentId,
            stepId: command.stepId,
            status: command.status,
            advancedAt: command.advancedAt ?? null,
          })
          .returning(),
      );
      return mapHistory(row);
    }
    const row = first(
      await this.db
        .update(outreachSequenceHistory)
        .set({
          status: command.status,
          advancedAt: command.advancedAt ?? null,
          updatedAt: new Date(),
        })
        .where(eq(outreachSequenceHistory.id, existing.id))
        .returning(),
    );
    return mapHistory(row);
  }
}

export class PostgresReadinessRepository implements ReadinessRepository {
  constructor(private readonly db: Db) {}

  async saveAssessment(command: {
    organizationId: string;
    contactId: string | null;
    channel: Channel | null;
    ready: boolean;
    reasons: unknown[];
    permissionSnapshot: Record<string, unknown>;
    assessedByUserId: string | null;
  }) {
    const row = first(
      await this.db
        .insert(outreachReadinessAssessments)
        .values({
          organizationId: command.organizationId,
          contactId: command.contactId,
          channel: command.channel,
          ready: command.ready,
          reasons: command.reasons,
          permissionSnapshot: command.permissionSnapshot,
          assessedByUserId: command.assessedByUserId,
        })
        .returning({ id: outreachReadinessAssessments.id }),
    );
    return row;
  }
}

export class PostgresOutreachAuditAdapter implements OutreachAuditPort {
  constructor(private readonly db: Db) {}

  async append(event: Parameters<OutreachAuditPort['append']>[0]): Promise<void> {
    await this.db.insert(auditEvents).values({
      actorType: event.actorUserId === null ? 'system' : 'user',
      actorUserId: event.actorUserId,
      action: event.action,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      organizationId: event.organizationId ?? null,
      contactId: event.subjectType === 'contact' ? event.subjectId : null,
      commandCorrelationId: event.correlationId ?? null,
      metadata: event.metadata ?? {},
    });
  }
}

export class PostgresOutreachOutboxAdapter implements OutreachOutboxPort {
  constructor(private readonly db: Db) {}

  async insert(event: Parameters<OutreachOutboxPort['insert']>[0]): Promise<void> {
    await this.db.insert(outboxEvents).values({
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      idempotencyKey: event.idempotencyKey,
      payload: event.payload,
      metadata: event.metadata ?? {},
      status: 'pending',
    });
  }
}

function mapCampaignVersion(
  row: typeof outreachCampaignVersions.$inferSelect,
  _campaignKey: string,
) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    version: row.version,
    name: row.name,
    description: row.description,
    sequenceVersionId: row.sequenceVersionId,
    defaultChannel: row.defaultChannel,
    status: row.status,
  };
}

function mapTemplateVersion(
  row: typeof messageTemplateVersions.$inferSelect,
  template: typeof messageTemplates.$inferSelect,
) {
  return {
    id: row.id,
    templateId: row.templateId,
    version: row.version,
    key: template.key,
    channel: template.channel,
    subjectTemplate: row.subjectTemplate,
    bodyTemplate: row.bodyTemplate,
    contextKeys: Array.isArray(row.contextKeys)
      ? row.contextKeys.filter((key): key is string => typeof key === 'string')
      : [],
    status: row.status,
  };
}

function mapSequenceVersion(row: typeof outreachSequenceVersions.$inferSelect) {
  return {
    id: row.id,
    sequenceId: row.sequenceId,
    version: row.version,
    name: row.name,
    status: row.status,
  };
}

function mapSequenceStep(row: typeof outreachSequenceSteps.$inferSelect) {
  return {
    id: row.id,
    sequenceVersionId: row.sequenceVersionId,
    stepOrder: row.stepOrder,
    templateVersionId: row.templateVersionId,
    channel: row.channel,
    delayDays: row.delayDays,
    waitForResponse: row.waitForResponse,
  };
}

function mapEnrollment(row: typeof campaignEnrollments.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    contactId: row.contactId,
    campaignVersionId: row.campaignVersionId,
    sequenceVersionId: row.sequenceVersionId,
    status: row.status,
    ownerUserId: row.ownerUserId,
    currentStepId: row.currentStepId,
    permissionSnapshot: row.permissionSnapshot as Record<string, unknown>,
    enrolledAt: row.enrolledAt,
    pausedAt: row.pausedAt,
    exitedAt: row.exitedAt,
    exitReason: row.exitReason,
    recordVersion: row.recordVersion,
    commandCorrelationId: row.commandCorrelationId,
  };
}

function mapDraft(row: typeof messageDrafts.$inferSelect) {
  return {
    id: row.id,
    enrollmentId: row.enrollmentId,
    sequenceStepId: row.sequenceStepId,
    templateVersionId: row.templateVersionId,
    channel: row.channel,
    status: row.status,
    renderedSubject: row.renderedSubject,
    renderedBody: row.renderedBody,
    contextRefs: row.contextRefs as Record<string, unknown>,
    permissionSnapshot: row.permissionSnapshot as Record<string, unknown>,
    createdByUserId: row.createdByUserId,
  };
}

function mapApproval(row: typeof messageApprovals.$inferSelect) {
  return {
    id: row.id,
    draftId: row.draftId,
    status: row.status,
    permissionSnapshot: row.permissionSnapshot as Record<string, unknown>,
    decidedByUserId: row.decidedByUserId,
    decidedAt: row.decidedAt,
    notes: row.notes,
  };
}

function mapActivity(row: typeof outreachActivities.$inferSelect) {
  return {
    id: row.id,
    enrollmentId: row.enrollmentId,
    draftId: row.draftId,
    activityType: row.activityType,
    channel: row.channel,
    occurredAt: row.occurredAt,
    immutableSnapshot: row.immutableSnapshot as Record<string, unknown>,
    permissionSnapshot: row.permissionSnapshot as Record<string, unknown>,
    createdByUserId: row.createdByUserId,
  };
}

function mapHistory(row: typeof outreachSequenceHistory.$inferSelect) {
  return {
    id: row.id,
    enrollmentId: row.enrollmentId,
    stepId: row.stepId,
    status: row.status,
    advancedAt: row.advancedAt,
  };
}
