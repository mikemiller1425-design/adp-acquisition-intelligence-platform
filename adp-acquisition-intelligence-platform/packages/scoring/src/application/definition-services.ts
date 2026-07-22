import { AppError } from '@adp/platform';

import type {
  CompletenessDefinitionRepository,
  ScoreDefinitionRepository,
  ScoringActor,
} from '../domain/ports.js';
import type { CompletenessDefinitionVersion, ScoreDefinitionVersion } from '../domain/types.js';
import { validateWeights } from '../domain/weight-validation.js';

export class ScoreDefinitionService {
  constructor(private readonly definitions: ScoreDefinitionRepository) {}

  async createDraft(definition: ScoreDefinitionVersion): Promise<ScoreDefinitionVersion> {
    assertDraft(definition.status, definition.approvalStatus);
    validateWeights(definition.components);
    return this.definitions.upsertDraft({
      ...definition,
      status: 'draft',
      approvalStatus: 'draft_unapproved',
    });
  }

  async publish(command: {
    key: string;
    version: string;
    approvalStatus?: 'approved';
    approvalMetadata?: Record<string, unknown>;
    actor: ScoringActor;
  }): Promise<ScoreDefinitionVersion> {
    assertAdmin(command.actor);
    if (command.approvalStatus !== 'approved' || command.approvalMetadata === undefined) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Score definition activation requires explicit approved approval metadata',
      });
    }
    return this.definitions.publish({
      key: command.key,
      version: command.version,
      approvalStatus: command.approvalStatus,
      approvalMetadata: command.approvalMetadata,
      actorUserId: command.actor.userId,
    });
  }
}

export class CompletenessDefinitionService {
  constructor(private readonly definitions: CompletenessDefinitionRepository) {}

  async createDraft(
    definition: CompletenessDefinitionVersion,
  ): Promise<CompletenessDefinitionVersion> {
    assertDraft(definition.status, definition.approvalStatus);
    return this.definitions.upsertDraft({
      ...definition,
      status: 'draft',
      approvalStatus: 'draft_unapproved',
    });
  }
}

function assertDraft(status: string, approvalStatus: string): void {
  if (status === 'active' || approvalStatus === 'approved') {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: 'Prompt 5 definitions must be created as draft_unapproved drafts',
    });
  }
}

function assertAdmin(actor: ScoringActor): void {
  if (!actor.roles.includes('admin')) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Only admins can publish score definitions after approval',
    });
  }
}
