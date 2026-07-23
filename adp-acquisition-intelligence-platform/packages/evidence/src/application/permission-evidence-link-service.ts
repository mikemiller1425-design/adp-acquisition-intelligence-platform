import {
  AllowListCapabilityChecker,
  type CapabilityActor,
  type CapabilityChecker,
  type PermissionEvidenceLink,
  type PermissionEvidenceLinkRepository,
} from '../domain/ports.js';
import type { PermissionEvidenceSubjectType } from '../domain/evidence.js';

export class PermissionEvidenceLinkService {
  constructor(
    private readonly links: PermissionEvidenceLinkRepository,
    private readonly authz: CapabilityChecker = new AllowListCapabilityChecker(),
  ) {}

  async link(command: {
    subjectType: PermissionEvidenceSubjectType;
    subjectId: string;
    evidenceRecordId: string;
    actor: CapabilityActor;
  }): Promise<PermissionEvidenceLink> {
    await this.authz.assertCan(command.actor, 'permission_evidence:link');
    return this.links.link({
      subjectType: command.subjectType,
      subjectId: command.subjectId,
      evidenceRecordId: command.evidenceRecordId,
      createdBy: command.actor.userId,
    });
  }
}
