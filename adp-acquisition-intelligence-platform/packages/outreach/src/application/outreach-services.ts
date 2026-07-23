import type { Channel } from '@adp/consent';
import { AppError } from '@adp/platform';

import {
  actorHasRole,
  evaluateReadiness,
  evaluateSequenceEligibility,
  extractTemplateKeys,
  renderTemplate,
  shouldExitForClassification,
  shouldPauseForClassification,
  type OutreachActor,
} from '../domain/outreach.js';
import type {
  ActivityRepository,
  ApprovalRepository,
  CampaignRepository,
  DraftRepository,
  Enrollment,
  EnrollmentRepository,
  OrganizationContextPort,
  OutreachAuditPort,
  OutreachConsentOptOutPort,
  OutreachOutboxPort,
  OutreachPermissionPort,
  OperationalStateOutreachPort,
  ReadinessRepository,
  ResponseClassification,
  ResponseRepository,
  SequenceHistoryRepository,
  SequenceRepository,
  TemplateRepository,
} from '../domain/ports.js';

function assertRole(
  actor: OutreachActor,
  allowed: readonly OutreachActor['roles'][number][],
  action: string,
): void {
  if (!actorHasRole(actor, allowed)) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: `Actor is not authorized to ${action}`,
      details: { roles: actor.roles, allowed },
    });
  }
}

function notFound(message: string, id: string): AppError {
  return new AppError({ code: 'NOT_FOUND', message, details: { id } });
}

function permissionSnapshot(evaluation: {
  allowed: boolean;
  state: string;
  rulingRule: string;
  evidenceRefs: string[];
}): Record<string, unknown> {
  return {
    allowed: evaluation.allowed,
    state: evaluation.state,
    rulingRule: evaluation.rulingRule,
    evidenceRefs: evaluation.evidenceRefs,
  };
}

export class OutreachReadinessService {
  constructor(
    private readonly organizations: OrganizationContextPort,
    private readonly permissions: OutreachPermissionPort,
    private readonly readiness: ReadinessRepository,
    private readonly audit?: OutreachAuditPort,
    private readonly outbox?: OutreachOutboxPort,
  ) {}

  async assess(command: {
    organizationId: string;
    contactId: string;
    channel: Channel;
    actor: OutreachActor;
    commandCorrelationId?: string | null;
  }) {
    assertRole(command.actor, ['admin', 'sales', 'reviewer'], 'assess outreach readiness');
    const org = await this.organizations.findOrganizationContext(command.organizationId);
    if (org === null) throw notFound('Organization not found', command.organizationId);

    const permission = await this.permissions.evaluateOutreachPermission({
      contactId: command.contactId,
      organizationId: command.organizationId,
      channel: command.channel,
      auditBlockedDecision: {
        actorUserId: command.actor.userId,
        correlationId: command.commandCorrelationId ?? null,
      },
    });

    const assessment = evaluateReadiness({
      prospectStage: org.prospectStage,
      ownerUserId: org.ownerUserId,
      contactPresent: true,
      permission,
      channel: command.channel,
    });

    const saved = await this.readiness.saveAssessment({
      organizationId: command.organizationId,
      contactId: command.contactId,
      channel: command.channel,
      ready: assessment.ready,
      reasons: assessment.reasons,
      permissionSnapshot: permissionSnapshot(permission),
      assessedByUserId: command.actor.userId,
    });

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'outreach.readiness_assessed',
      subjectType: 'organization',
      subjectId: command.organizationId,
      organizationId: command.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: { assessment, assessmentId: saved.id },
    });
    await this.outbox?.insert({
      aggregateType: 'organization',
      aggregateId: command.organizationId,
      eventType: 'outreach.readiness_assessed',
      idempotencyKey:
        command.commandCorrelationId ?? `${command.organizationId}:readiness:${saved.id}`,
      payload: {
        organizationId: command.organizationId,
        contactId: command.contactId,
        channel: command.channel,
        ready: assessment.ready,
        reasons: assessment.reasons,
      },
    });

    return { assessment, assessmentId: saved.id };
  }
}

export class OutreachDefinitionService {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly templates: TemplateRepository,
    private readonly sequences: SequenceRepository,
    private readonly audit?: OutreachAuditPort,
  ) {}

  async publishCampaign(command: { campaignKey: string; version: string; actor: OutreachActor }) {
    assertRole(command.actor, ['admin'], 'publish outreach campaign');
    const published = await this.campaigns.publishVersion({
      campaignKey: command.campaignKey,
      version: command.version,
      actorUserId: command.actor.userId,
    });
    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'outreach.campaign_published',
      subjectType: 'organization',
      subjectId: published.campaignId,
      metadata: { campaignKey: command.campaignKey, version: command.version },
    });
    return published;
  }

  async publishTemplate(command: { templateKey: string; version: string; actor: OutreachActor }) {
    assertRole(command.actor, ['admin'], 'publish message template');
    const published = await this.templates.publishVersion({
      templateKey: command.templateKey,
      version: command.version,
      actorUserId: command.actor.userId,
    });
    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'outreach.template_published',
      subjectType: 'organization',
      subjectId: published.templateId,
      metadata: { templateKey: command.templateKey, version: command.version },
    });
    return published;
  }

  async publishSequence(command: { sequenceKey: string; version: string; actor: OutreachActor }) {
    assertRole(command.actor, ['admin'], 'publish outreach sequence');
    const published = await this.sequences.publishVersion({
      sequenceKey: command.sequenceKey,
      version: command.version,
      actorUserId: command.actor.userId,
    });
    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'outreach.sequence_published',
      subjectType: 'organization',
      subjectId: published.sequenceId,
      metadata: { sequenceKey: command.sequenceKey, version: command.version },
    });
    return published;
  }
}

export class EnrollmentService {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly campaigns: CampaignRepository,
    private readonly organizations: OrganizationContextPort,
    private readonly permissions: OutreachPermissionPort,
    private readonly operationalState: OperationalStateOutreachPort,
    private readonly audit?: OutreachAuditPort,
    private readonly outbox?: OutreachOutboxPort,
  ) {}

  async enroll(command: {
    organizationId: string;
    contactId: string;
    campaignKey: string;
    channel: Channel;
    actor: OutreachActor;
    commandCorrelationId?: string | null;
  }) {
    assertRole(command.actor, ['admin', 'sales'], 'enroll in outreach campaign');
    if (command.commandCorrelationId !== undefined && command.commandCorrelationId !== null) {
      const existing = await this.enrollments.findByCorrelationId(command.commandCorrelationId);
      if (existing !== null) return existing;
    }

    const org = await this.organizations.findOrganizationContext(command.organizationId);
    if (org === null) throw notFound('Organization not found', command.organizationId);

    const campaign = await this.campaigns.findPublishedVersionByKey(command.campaignKey);
    if (campaign === null || campaign.sequenceVersionId === null) {
      throw notFound('Published campaign not found', command.campaignKey);
    }

    const permission = await this.permissions.evaluateOutreachPermission({
      contactId: command.contactId,
      organizationId: command.organizationId,
      channel: command.channel,
      auditBlockedDecision: {
        actorUserId: command.actor.userId,
        correlationId: command.commandCorrelationId ?? null,
      },
    });
    if (!permission.allowed) {
      await this.audit?.append({
        actorUserId: command.actor.userId,
        action: 'outreach.enrollment_blocked',
        subjectType: 'contact',
        subjectId: command.contactId,
        organizationId: command.organizationId,
        correlationId: command.commandCorrelationId ?? null,
        metadata: { permission: permissionSnapshot(permission) },
      });
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Enrollment blocked by channel permission',
        details: { state: permission.state, rulingRule: permission.rulingRule },
      });
    }

    const readiness = evaluateReadiness({
      prospectStage: org.prospectStage,
      ownerUserId: org.ownerUserId,
      contactPresent: true,
      permission,
      channel: command.channel,
    });
    if (!readiness.ready) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Organization is not outreach-ready',
        details: { reasons: readiness.reasons },
      });
    }

    const enrollment = await this.enrollments.create({
      organizationId: command.organizationId,
      contactId: command.contactId,
      campaignVersionId: campaign.id,
      sequenceVersionId: campaign.sequenceVersionId,
      ownerUserId: org.ownerUserId,
      permissionSnapshot: permissionSnapshot(permission),
      commandCorrelationId: command.commandCorrelationId ?? null,
    });
    await this.enrollments.createRecipient({
      enrollmentId: enrollment.id,
      contactId: command.contactId,
      channel: command.channel,
    });

    const activated = await this.enrollments.updateStatus({
      enrollmentId: enrollment.id,
      status: 'active',
      expectedRecordVersion: enrollment.recordVersion,
      enrolledAt: new Date(),
    });
    if (activated === null) {
      throw new AppError({ code: 'CONFLICT', message: 'Enrollment activation conflict' });
    }

    if (org.prospectStage === 'discovery_completed' || org.prospectStage === 'outreach_ready') {
      await this.operationalState.transitionProspectStage({
        organizationId: command.organizationId,
        to: 'outreach_active',
        expectedRecordVersion: org.recordVersion,
        actor: { userId: command.actor.userId, type: 'user' },
        reasonCode: 'outreach_enrolled',
        commandCorrelationId: command.commandCorrelationId ?? null,
      });
    }
    if (org.outreachStatus === 'not_started' || org.outreachStatus === 'ready') {
      const refreshed = await this.organizations.findOrganizationContext(command.organizationId);
      if (refreshed !== null) {
        await this.operationalState.transitionOutreachStatus({
          organizationId: command.organizationId,
          to: 'active',
          expectedRecordVersion: refreshed.recordVersion,
          actor: { userId: command.actor.userId, type: 'user' },
          reasonCode: 'outreach_enrolled',
          commandCorrelationId: command.commandCorrelationId ?? null,
        });
      }
    }

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'outreach.enrolled',
      subjectType: 'organization',
      subjectId: command.organizationId,
      organizationId: command.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: { enrollmentId: activated.id, campaignKey: command.campaignKey },
    });
    await this.outbox?.insert({
      aggregateType: 'organization',
      aggregateId: command.organizationId,
      eventType: 'outreach.enrolled',
      idempotencyKey: command.commandCorrelationId ?? `${activated.id}:enrolled`,
      payload: {
        enrollmentId: activated.id,
        organizationId: command.organizationId,
        contactId: command.contactId,
        campaignKey: command.campaignKey,
      },
    });

    return activated;
  }

  async pause(command: {
    enrollmentId: string;
    actor: OutreachActor;
    reasonCode?: string | null;
    commandCorrelationId?: string | null;
  }) {
    assertRole(command.actor, ['admin', 'sales', 'reviewer'], 'pause outreach enrollment');
    return this.transitionEnrollment(command.enrollmentId, 'paused', command, {
      pausedAt: new Date(),
      exitReason: command.reasonCode ?? null,
    });
  }

  async resume(command: {
    enrollmentId: string;
    actor: OutreachActor;
    commandCorrelationId?: string | null;
  }) {
    assertRole(command.actor, ['admin', 'sales'], 'resume outreach enrollment');
    return this.transitionEnrollment(command.enrollmentId, 'active', command, {
      pausedAt: null,
    });
  }

  async exit(command: {
    enrollmentId: string;
    actor: OutreachActor;
    reasonCode: string;
    commandCorrelationId?: string | null;
  }) {
    assertRole(command.actor, ['admin', 'sales', 'reviewer'], 'exit outreach enrollment');
    return this.transitionEnrollment(command.enrollmentId, 'exited', command, {
      exitedAt: new Date(),
      exitReason: command.reasonCode,
    });
  }

  private async transitionEnrollment(
    enrollmentId: string,
    status: Enrollment['status'],
    command: { actor: OutreachActor; commandCorrelationId?: string | null },
    extra: {
      pausedAt?: Date | null;
      exitedAt?: Date | null;
      exitReason?: string | null;
    },
  ) {
    const enrollment = await this.enrollments.findById(enrollmentId);
    if (enrollment === null) throw notFound('Enrollment not found', enrollmentId);

    const updated = await this.enrollments.updateStatus({
      enrollmentId,
      status,
      expectedRecordVersion: enrollment.recordVersion,
      ...extra,
    });
    if (updated === null) {
      throw new AppError({ code: 'CONFLICT', message: 'Enrollment version conflict' });
    }

    const action =
      status === 'paused'
        ? 'outreach.enrollment_paused'
        : status === 'active'
          ? 'outreach.enrollment_resumed'
          : 'outreach.enrollment_exited';
    await this.audit?.append({
      actorUserId: command.actor.userId,
      action,
      subjectType: 'organization',
      subjectId: enrollment.organizationId,
      organizationId: enrollment.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: { enrollmentId, status },
    });
    if (status === 'paused' || status === 'exited') {
      await this.outbox?.insert({
        aggregateType: 'organization',
        aggregateId: enrollment.organizationId,
        eventType:
          status === 'paused' ? 'outreach.enrollment_paused' : 'outreach.enrollment_exited',
        idempotencyKey: command.commandCorrelationId ?? `${enrollmentId}:${status}`,
        payload: { enrollmentId, status, reason: extra.exitReason ?? null },
      });
    }
    return updated;
  }
}

export class DraftService {
  constructor(
    private readonly drafts: DraftRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly templates: TemplateRepository,
    private readonly permissions: OutreachPermissionPort,
    private readonly activities: ActivityRepository,
    private readonly audit?: OutreachAuditPort,
    private readonly outbox?: OutreachOutboxPort,
  ) {}

  async createFromTemplate(command: {
    enrollmentId: string;
    templateVersionId: string;
    channel: Channel;
    context: Record<string, string>;
    actor: OutreachActor;
    sequenceStepId?: string | null;
    commandCorrelationId?: string | null;
  }) {
    assertRole(command.actor, ['admin', 'sales'], 'create outreach draft');
    const enrollment = await this.enrollments.findById(command.enrollmentId);
    if (enrollment === null) throw notFound('Enrollment not found', command.enrollmentId);
    if (enrollment.status !== 'active') {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Drafts require an active enrollment',
        details: { status: enrollment.status },
      });
    }

    const template = await this.templates.findPublishedVersionById(command.templateVersionId);
    if (template === null) {
      throw notFound('Published template version not found', command.templateVersionId);
    }

    const declaredKeys = template.contextKeys.filter(
      (key): key is string => typeof key === 'string',
    );
    for (const key of declaredKeys) {
      if (!(key in command.context)) {
        throw new AppError({
          code: 'VALIDATION_FAILED',
          message: 'Template context is missing required keys',
          details: { missingKey: key, declaredKeys },
        });
      }
    }
    for (const key of extractTemplateKeys(template.bodyTemplate)) {
      if (!(key in command.context)) {
        throw new AppError({
          code: 'VALIDATION_FAILED',
          message: 'Rendered template references undeclared context key',
          details: { missingKey: key },
        });
      }
    }

    const permission = await this.permissions.evaluateOutreachPermission({
      contactId: enrollment.contactId,
      organizationId: enrollment.organizationId,
      channel: command.channel,
      auditBlockedDecision: {
        actorUserId: command.actor.userId,
        correlationId: command.commandCorrelationId ?? null,
      },
    });
    if (!permission.allowed) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Draft creation blocked by channel permission',
        details: { state: permission.state },
      });
    }

    const renderedBody = renderTemplate(template.bodyTemplate, command.context);
    const renderedSubject =
      template.subjectTemplate === null
        ? null
        : renderTemplate(template.subjectTemplate, command.context);

    const draft = await this.drafts.create({
      enrollmentId: command.enrollmentId,
      sequenceStepId: command.sequenceStepId ?? null,
      templateVersionId: command.templateVersionId,
      channel: command.channel,
      renderedSubject,
      renderedBody,
      contextRefs: command.context,
      permissionSnapshot: permissionSnapshot(permission),
      createdByUserId: command.actor.userId,
    });

    await this.activities.create({
      enrollmentId: command.enrollmentId,
      draftId: draft.id,
      activityType: 'drafted',
      channel: command.channel,
      immutableSnapshot: {
        renderedSubject,
        renderedBody,
        templateVersionId: command.templateVersionId,
        contextRefs: command.context,
      },
      permissionSnapshot: permissionSnapshot(permission),
      createdByUserId: command.actor.userId,
    });

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'outreach.draft_created',
      subjectType: 'organization',
      subjectId: enrollment.organizationId,
      organizationId: enrollment.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: { draftId: draft.id, enrollmentId: command.enrollmentId },
    });
    await this.outbox?.insert({
      aggregateType: 'organization',
      aggregateId: enrollment.organizationId,
      eventType: 'outreach.draft_created',
      idempotencyKey: command.commandCorrelationId ?? `${draft.id}:draft_created`,
      payload: { draftId: draft.id, enrollmentId: command.enrollmentId },
    });

    return draft;
  }
}

export class ApprovalService {
  constructor(
    private readonly approvals: ApprovalRepository,
    private readonly drafts: DraftRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly permissions: OutreachPermissionPort,
    private readonly activities: ActivityRepository,
    private readonly audit?: OutreachAuditPort,
    private readonly outbox?: OutreachOutboxPort,
  ) {}

  async requestApproval(command: {
    draftId: string;
    actor: OutreachActor;
    commandCorrelationId?: string | null;
  }) {
    assertRole(command.actor, ['admin', 'sales'], 'request outreach approval');
    const draft = await this.drafts.findById(command.draftId);
    if (draft === null) throw notFound('Draft not found', command.draftId);
    const enrollment = await this.enrollments.findById(draft.enrollmentId);
    if (enrollment === null) throw notFound('Enrollment not found', draft.enrollmentId);

    const permission = await this.permissions.evaluateOutreachPermission({
      contactId: enrollment.contactId,
      organizationId: enrollment.organizationId,
      channel: draft.channel,
      auditBlockedDecision: {
        actorUserId: command.actor.userId,
        correlationId: command.commandCorrelationId ?? null,
      },
    });
    if (!permission.allowed) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Approval request blocked by channel permission',
        details: { state: permission.state },
      });
    }

    const approval = await this.approvals.create({
      draftId: draft.id,
      permissionSnapshot: permissionSnapshot(permission),
    });
    await this.drafts.updateStatus(draft.id, 'pending_approval');
    await this.activities.create({
      enrollmentId: draft.enrollmentId,
      draftId: draft.id,
      activityType: 'submitted_for_approval',
      channel: draft.channel,
      immutableSnapshot: {
        draftId: draft.id,
        renderedBody: draft.renderedBody,
        renderedSubject: draft.renderedSubject,
      },
      permissionSnapshot: permissionSnapshot(permission),
      createdByUserId: command.actor.userId,
    });
    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'outreach.approval_requested',
      subjectType: 'organization',
      subjectId: enrollment.organizationId,
      organizationId: enrollment.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: { approvalId: approval.id, draftId: draft.id },
    });
    return approval;
  }

  async approve(command: {
    approvalId: string;
    actor: OutreachActor;
    notes?: string | null;
    commandCorrelationId?: string | null;
  }) {
    return this.decide(command, 'approved');
  }

  async reject(command: {
    approvalId: string;
    actor: OutreachActor;
    notes?: string | null;
    commandCorrelationId?: string | null;
  }) {
    return this.decide(command, 'rejected');
  }

  private async decide(
    command: {
      approvalId: string;
      actor: OutreachActor;
      notes?: string | null;
      commandCorrelationId?: string | null;
    },
    status: 'approved' | 'rejected',
  ) {
    assertRole(command.actor, ['admin', 'reviewer'], `${status} outreach draft`);
    const approval = await this.approvals.findById(command.approvalId);
    if (approval === null || approval.status !== 'pending') {
      throw notFound('Pending approval not found', command.approvalId);
    }

    const draft = await this.drafts.findById(approval.draftId);
    if (draft === null) throw notFound('Draft not found', approval.draftId);
    const enrollment = await this.enrollments.findById(draft.enrollmentId);
    if (enrollment === null) throw notFound('Enrollment not found', draft.enrollmentId);

    const permission = await this.permissions.evaluateOutreachPermission({
      contactId: enrollment.contactId,
      organizationId: enrollment.organizationId,
      channel: draft.channel,
      auditBlockedDecision: {
        actorUserId: command.actor.userId,
        correlationId: command.commandCorrelationId ?? null,
      },
    });
    if (!permission.allowed) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: `${status} blocked by channel permission`,
        details: { state: permission.state },
      });
    }

    const decided = await this.approvals.decide({
      approvalId: approval.id,
      status,
      decidedByUserId: command.actor.userId,
      permissionSnapshot: permissionSnapshot(permission),
      notes: command.notes ?? null,
    });
    await this.drafts.updateStatus(draft.id, status === 'approved' ? 'approved' : 'rejected');
    await this.activities.create({
      enrollmentId: draft.enrollmentId,
      draftId: draft.id,
      activityType: status,
      channel: draft.channel,
      immutableSnapshot: {
        draftId: draft.id,
        renderedBody: draft.renderedBody,
        renderedSubject: draft.renderedSubject,
        approvalId: decided.id,
      },
      permissionSnapshot: permissionSnapshot(permission),
      createdByUserId: command.actor.userId,
    });

    const action = status === 'approved' ? 'outreach.approved' : 'outreach.rejected';
    await this.audit?.append({
      actorUserId: command.actor.userId,
      action,
      subjectType: 'organization',
      subjectId: enrollment.organizationId,
      organizationId: enrollment.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: { approvalId: decided.id, draftId: draft.id },
    });
    if (status === 'approved') {
      await this.outbox?.insert({
        aggregateType: 'organization',
        aggregateId: enrollment.organizationId,
        eventType: 'outreach.approved',
        idempotencyKey: command.commandCorrelationId ?? `${decided.id}:approved`,
        payload: { approvalId: decided.id, draftId: draft.id, enrollmentId: enrollment.id },
      });
    }
    return decided;
  }
}

export class ActivityService {
  constructor(
    private readonly activities: ActivityRepository,
    private readonly drafts: DraftRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly permissions: OutreachPermissionPort,
    private readonly audit?: OutreachAuditPort,
    private readonly outbox?: OutreachOutboxPort,
  ) {}

  async markSent(command: {
    draftId: string;
    actor: OutreachActor;
    commandCorrelationId?: string | null;
  }) {
    assertRole(command.actor, ['admin', 'sales'], 'mark outreach as sent');
    const draft = await this.drafts.findById(command.draftId);
    if (draft === null) throw notFound('Draft not found', command.draftId);
    if (draft.status !== 'approved') {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Only approved drafts can be marked sent',
        details: { status: draft.status },
      });
    }

    const enrollment = await this.enrollments.findById(draft.enrollmentId);
    if (enrollment === null) throw notFound('Enrollment not found', draft.enrollmentId);

    const permission = await this.permissions.evaluateOutreachPermission({
      contactId: enrollment.contactId,
      organizationId: enrollment.organizationId,
      channel: draft.channel,
      auditBlockedDecision: {
        actorUserId: command.actor.userId,
        correlationId: command.commandCorrelationId ?? null,
      },
    });
    if (!permission.allowed) {
      await this.activities.create({
        enrollmentId: draft.enrollmentId,
        draftId: draft.id,
        activityType: 'permission_blocked',
        channel: draft.channel,
        immutableSnapshot: { draftId: draft.id, attemptedAction: 'marked_sent' },
        permissionSnapshot: permissionSnapshot(permission),
        createdByUserId: command.actor.userId,
      });
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Mark sent blocked by channel permission',
        details: { state: permission.state },
      });
    }

    const activity = await this.activities.create({
      enrollmentId: draft.enrollmentId,
      draftId: draft.id,
      activityType: 'marked_sent',
      channel: draft.channel,
      immutableSnapshot: {
        draftId: draft.id,
        renderedBody: draft.renderedBody,
        renderedSubject: draft.renderedSubject,
        contextRefs: draft.contextRefs,
      },
      permissionSnapshot: permissionSnapshot(permission),
      createdByUserId: command.actor.userId,
    });
    await this.drafts.updateStatus(draft.id, 'sent');

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'outreach.marked_sent',
      subjectType: 'organization',
      subjectId: enrollment.organizationId,
      organizationId: enrollment.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: { activityId: activity.id, draftId: draft.id },
    });
    await this.outbox?.insert({
      aggregateType: 'organization',
      aggregateId: enrollment.organizationId,
      eventType: 'outreach.marked_sent',
      idempotencyKey: command.commandCorrelationId ?? `${activity.id}:marked_sent`,
      payload: { activityId: activity.id, draftId: draft.id, enrollmentId: enrollment.id },
    });

    return activity;
  }
}

export class ResponseService {
  constructor(
    private readonly responses: ResponseRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly activities: ActivityRepository,
    private readonly enrollmentService: EnrollmentService,
    private readonly consentOptOut: OutreachConsentOptOutPort,
    private readonly audit?: OutreachAuditPort,
    private readonly outbox?: OutreachOutboxPort,
  ) {}

  async recordAndClassify(command: {
    enrollmentId: string;
    channel: Channel;
    originalText: string;
    classification: ResponseClassification;
    actor: OutreachActor;
    activityId?: string | null;
    notes?: string | null;
    commandCorrelationId?: string | null;
  }) {
    assertRole(command.actor, ['admin', 'sales', 'reviewer'], 'record outreach response');
    const enrollment = await this.enrollments.findById(command.enrollmentId);
    if (enrollment === null) throw notFound('Enrollment not found', command.enrollmentId);

    const response = await this.responses.create({
      enrollmentId: command.enrollmentId,
      activityId: command.activityId ?? null,
      channel: command.channel,
      originalText: command.originalText,
    });
    await this.activities.create({
      enrollmentId: command.enrollmentId,
      activityType: 'response_received',
      channel: command.channel,
      immutableSnapshot: { responseId: response.id, originalText: command.originalText },
      permissionSnapshot: {},
      createdByUserId: command.actor.userId,
    });

    const classification = await this.responses.classify({
      responseId: response.id,
      classification: command.classification,
      classifiedByUserId: command.actor.userId,
      notes: command.notes ?? null,
    });

    if (command.classification === 'unsubscribe') {
      await this.consentOptOut.recordOptOut({
        contactId: enrollment.contactId,
        organizationId: enrollment.organizationId,
        channel: command.channel,
        capturedByUserId: command.actor.userId,
        reasonCode: 'response_unsubscribe',
        reasonNote: command.originalText,
      });
    }

    if (shouldPauseForClassification(command.classification)) {
      await this.enrollmentService.pause({
        enrollmentId: command.enrollmentId,
        actor: command.actor,
        reasonCode: command.classification,
        commandCorrelationId: command.commandCorrelationId ?? null,
      });
    }
    if (shouldExitForClassification(command.classification)) {
      await this.enrollmentService.exit({
        enrollmentId: command.enrollmentId,
        actor: command.actor,
        reasonCode: command.classification,
        commandCorrelationId: command.commandCorrelationId ?? null,
      });
    }

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'outreach.response_classified',
      subjectType: 'organization',
      subjectId: enrollment.organizationId,
      organizationId: enrollment.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: {
        responseId: response.id,
        classification: command.classification,
      },
    });
    await this.outbox?.insert({
      aggregateType: 'organization',
      aggregateId: enrollment.organizationId,
      eventType: 'outreach.response_classified',
      idempotencyKey: command.commandCorrelationId ?? `${classification.id}:classified`,
      payload: {
        responseId: response.id,
        classification: command.classification,
        enrollmentId: command.enrollmentId,
      },
    });

    return { response, classification };
  }
}

export class SequenceProgressionService {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly sequences: SequenceRepository,
    private readonly history: SequenceHistoryRepository,
    private readonly permissions: OutreachPermissionPort,
    private readonly audit?: OutreachAuditPort,
    private readonly outbox?: OutreachOutboxPort,
  ) {}

  async advanceIfEligible(command: {
    enrollmentId: string;
    stepId: string;
    actor: OutreachActor;
    now?: Date;
    commandCorrelationId?: string | null;
  }) {
    assertRole(command.actor, ['admin', 'sales'], 'advance outreach sequence');
    const enrollment = await this.enrollments.findById(command.enrollmentId);
    if (enrollment === null) throw notFound('Enrollment not found', command.enrollmentId);
    const step = await this.sequences.findStepById(command.stepId);
    if (step === null) throw notFound('Sequence step not found', command.stepId);

    const steps = await this.sequences.listPublishedSteps(enrollment.sequenceVersionId);
    const priorSteps = steps.filter((row) => row.stepOrder < step.stepOrder);
    const historyRows = await this.history.listByEnrollment(command.enrollmentId);
    const priorStepComplete = priorSteps.every((prior) =>
      historyRows.some((row) => row.stepId === prior.id && row.status === 'completed'),
    );

    const enrolledAt = enrollment.enrolledAt ?? new Date(0);
    const dueAt = new Date(enrolledAt);
    dueAt.setUTCDate(dueAt.getUTCDate() + step.delayDays);
    const due = (command.now ?? new Date()) >= dueAt;

    const permission = await this.permissions.evaluateOutreachPermission({
      contactId: enrollment.contactId,
      organizationId: enrollment.organizationId,
      channel: step.channel,
      auditBlockedDecision: {
        actorUserId: command.actor.userId,
        correlationId: command.commandCorrelationId ?? null,
      },
    });

    const eligibility = evaluateSequenceEligibility({
      enrollmentStatus: enrollment.status,
      priorStepComplete,
      due,
      permissionAllowed: permission.allowed,
    });
    if (!eligibility.eligible) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Sequence step is not eligible for advancement',
        details: { reasons: eligibility.reasons },
      });
    }

    const entry = await this.history.upsert({
      enrollmentId: command.enrollmentId,
      stepId: command.stepId,
      status: 'completed',
      advancedAt: command.now ?? new Date(),
    });
    await this.enrollments.updateStatus({
      enrollmentId: command.enrollmentId,
      status: enrollment.status,
      expectedRecordVersion: enrollment.recordVersion,
      currentStepId: command.stepId,
    });

    await this.audit?.append({
      actorUserId: command.actor.userId,
      action: 'outreach.sequence_advanced',
      subjectType: 'organization',
      subjectId: enrollment.organizationId,
      organizationId: enrollment.organizationId,
      correlationId: command.commandCorrelationId ?? null,
      metadata: { stepId: command.stepId, historyId: entry.id },
    });
    await this.outbox?.insert({
      aggregateType: 'organization',
      aggregateId: enrollment.organizationId,
      eventType: 'outreach.sequence_advanced',
      idempotencyKey: command.commandCorrelationId ?? `${entry.id}:sequence_advanced`,
      payload: { enrollmentId: command.enrollmentId, stepId: command.stepId },
    });

    return entry;
  }
}
