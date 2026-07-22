import { AppError } from '@adp/platform';

import {
  evidenceRefsFrom,
  isEffectiveAt,
  mostRestrictiveState,
  sortMostRestrictiveFirst,
} from '../domain/permission.js';
import type {
  Channel,
  PermissionEvaluation,
  PermissionState,
  SuppressionEntry,
} from '../domain/permission.js';
import type {
  ConsentAuditPort,
  ContactPermissionInput,
  OrganizationRestrictionInput,
  PermissionRepository,
  ConsentEvidenceLinkPort,
  SuppressionInput,
} from '../domain/ports.js';

function assertEffectiveWindow(input: { effectiveAt: Date; expiresAt: Date | null }): void {
  if (input.expiresAt !== null && input.expiresAt <= input.effectiveAt) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: 'expiresAt must be after effectiveAt',
      details: { effectiveAt: input.effectiveAt, expiresAt: input.expiresAt },
    });
  }
}

function assertSuppressionState(state: PermissionState): void {
  if (state !== 'opted_out' && state !== 'restricted') {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: 'Suppressions must be opted_out or restricted',
      details: { state },
    });
  }
}

function scopedToChannel(record: { channel: Channel | null }, channel: Channel): boolean {
  return record.channel === null || record.channel === channel;
}

function isGlobalSuppression(record: SuppressionEntry): boolean {
  return record.scope === 'global' || record.scope === 'global_channel';
}

function isChannelSuppression(record: SuppressionEntry): boolean {
  return (
    record.scope === 'contact_channel' ||
    record.scope === 'organization_channel' ||
    record.scope === 'global_channel'
  );
}

export class ConsentPermissionService {
  constructor(
    private readonly repository: PermissionRepository,
    private readonly audit?: ConsentAuditPort,
    private readonly evidenceLinks?: ConsentEvidenceLinkPort,
  ) {}

  async assertContactChannelPermission(input: ContactPermissionInput) {
    assertEffectiveWindow(input);
    const permission = await this.repository.assertContactChannelPermission(input);
    await this.linkEvidence(input, 'contact_channel_permission', permission.id);
    return permission;
  }

  async setOrganizationRestriction(input: OrganizationRestrictionInput) {
    assertEffectiveWindow(input);
    if (input.state === 'allowed') {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Organization restrictions cannot assert allowed',
      });
    }
    const restriction = await this.repository.setOrganizationRestriction(input);
    await this.linkEvidence(input, 'organization_communication_restriction', restriction.id);
    return restriction;
  }

  async upsertSuppression(input: SuppressionInput) {
    assertEffectiveWindow(input);
    assertSuppressionState(input.state);
    const suppression = await this.repository.upsertSuppression(input);
    await this.linkEvidence(input, 'suppression_entry', suppression.id);
    return suppression;
  }

  async revokeSuppression(command: {
    suppressionId: string;
    revokedAt?: Date;
    capturedByUserId: string | null;
  }) {
    const revoked = await this.repository.revokeSuppression(
      command.suppressionId,
      command.revokedAt ?? new Date(),
      command.capturedByUserId,
    );
    if (revoked === null) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Suppression not found',
        details: { suppressionId: command.suppressionId },
      });
    }
    return revoked;
  }

  async evaluateOutreachPermission(command: {
    contactId: string;
    organizationId: string;
    channel: Channel;
    at?: Date;
    auditBlockedDecision?: {
      actorUserId: string | null;
      correlationId: string | null;
    };
  }): Promise<PermissionEvaluation> {
    const at = command.at ?? new Date();
    const suppressions = (
      await this.repository.findEffectiveSuppressions({
        contactId: command.contactId,
        organizationId: command.organizationId,
        channel: command.channel,
        at,
      })
    ).filter((record) => isEffectiveAt(record, at) && scopedToChannel(record, command.channel));

    const globalSuppressions = suppressions.filter(isGlobalSuppression);
    if (globalSuppressions.length > 0) {
      return this.auditIfBlocked(command, {
        allowed: false,
        state: mostRestrictiveState(globalSuppressions.map((record) => record.state)),
        rulingRule: 'global_suppression',
        evidenceRefs: evidenceRefsFrom(globalSuppressions),
      });
    }

    const orgRestrictions = (
      await this.repository.findEffectiveOrganizationRestrictions({
        organizationId: command.organizationId,
        channel: command.channel,
        at,
      })
    ).filter((record) => isEffectiveAt(record, at) && scopedToChannel(record, command.channel));
    if (orgRestrictions.length > 0) {
      return this.auditIfBlocked(command, {
        allowed: false,
        state: mostRestrictiveState(orgRestrictions.map((record) => record.state)),
        rulingRule: 'organization_restriction',
        evidenceRefs: evidenceRefsFrom(orgRestrictions),
      });
    }

    const channelSuppressions = suppressions.filter(isChannelSuppression);
    if (channelSuppressions.length > 0) {
      return this.auditIfBlocked(command, {
        allowed: false,
        state: mostRestrictiveState(channelSuppressions.map((record) => record.state)),
        rulingRule: 'channel_suppression',
        evidenceRefs: evidenceRefsFrom(channelSuppressions),
      });
    }

    const permissions = (
      await this.repository.findEffectiveContactChannelPermissions({
        contactId: command.contactId,
        channel: command.channel,
        at,
      })
    ).filter((record) => isEffectiveAt(record, at));
    if (permissions.length > 0) {
      const ruling = sortMostRestrictiveFirst(permissions)[0];
      if (ruling === undefined) {
        throw new AppError({
          code: 'INTERNAL_ERROR',
          message: 'Permission ruling unexpectedly missing',
        });
      }
      const evaluation: PermissionEvaluation = {
        allowed: ruling.state === 'allowed',
        state: ruling.state,
        rulingRule: 'contact_channel_permission',
        evidenceRefs: evidenceRefsFrom(permissions),
      };
      return this.auditIfBlocked(command, evaluation);
    }

    return this.auditIfBlocked(command, {
      allowed: false,
      state: 'unknown',
      rulingRule: 'unknown',
      evidenceRefs: [],
    });
  }

  private async auditIfBlocked(
    command: {
      contactId: string;
      organizationId: string;
      channel: Channel;
      auditBlockedDecision?: { actorUserId: string | null; correlationId: string | null };
    },
    evaluation: PermissionEvaluation,
  ): Promise<PermissionEvaluation> {
    if (
      !evaluation.allowed &&
      command.auditBlockedDecision !== undefined &&
      this.audit !== undefined
    ) {
      await this.audit.append({
        actorUserId: command.auditBlockedDecision.actorUserId,
        action: 'outreach_blocked_by_permission',
        subjectType: 'contact',
        subjectId: command.contactId,
        correlationId: command.auditBlockedDecision.correlationId,
        metadata: {
          organizationId: command.organizationId,
          channel: command.channel,
          state: evaluation.state,
          rulingRule: evaluation.rulingRule,
          evidenceRefs: evaluation.evidenceRefs,
        },
      });
    }
    return evaluation;
  }

  private async linkEvidence(
    input: ContactPermissionInput | OrganizationRestrictionInput | SuppressionInput,
    subjectType:
      'contact_channel_permission' | 'organization_communication_restriction' | 'suppression_entry',
    subjectId: string,
  ): Promise<void> {
    if (
      this.evidenceLinks === undefined ||
      input.evidenceRecordId === undefined ||
      input.evidenceRecordId === null
    ) {
      return;
    }
    await this.evidenceLinks.link({
      subjectType,
      subjectId,
      evidenceRecordId: input.evidenceRecordId,
      createdBy: input.capturedByUserId,
    });
  }
}
