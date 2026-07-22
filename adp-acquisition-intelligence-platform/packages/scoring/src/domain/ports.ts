import type {
  ApprovalStatus,
  CompletenessDefinitionVersion,
  ScoreCalculationResult,
  ScoreDefinitionVersion,
  ScoringInput,
  SubjectRef,
} from './types.js';

export type ScoringActor = {
  userId: string | null;
  roles: readonly ('admin' | 'researcher' | 'sales' | 'reviewer')[];
};

export interface ScoreDefinitionRepository {
  upsertDraft(definition: ScoreDefinitionVersion): Promise<ScoreDefinitionVersion>;
  findByKey(key: string): Promise<ScoreDefinitionVersion | null>;
  findActiveByKey(key: string): Promise<ScoreDefinitionVersion | null>;
  publish(input: {
    key: string;
    version: string;
    approvalStatus: ApprovalStatus;
    approvalMetadata: Record<string, unknown> | null;
    actorUserId: string | null;
  }): Promise<ScoreDefinitionVersion>;
}

export interface CompletenessDefinitionRepository {
  upsertDraft(definition: CompletenessDefinitionVersion): Promise<CompletenessDefinitionVersion>;
  findByKey(key: string): Promise<CompletenessDefinitionVersion | null>;
}

export interface ScoreInputRepository {
  listInputs(subject: SubjectRef, score: ScoreDefinitionVersion): Promise<ScoringInput[]>;
}

export interface ScoreResultRepository {
  latest(
    subject: SubjectRef,
    scoreKey: string,
  ): Promise<{ id: string; score: number | null } | null>;
  insert(input: {
    subject: SubjectRef;
    definition: ScoreDefinitionVersion;
    result: ScoreCalculationResult;
    normalizedInputs: Record<string, unknown>;
    valueRefs: readonly string[];
    evidenceRefs: readonly string[];
    definitionDigest: string;
    previousScoreResultId?: string | null;
    durationMs: number;
  }): Promise<{ id: string; inputSnapshotId: string }>;
  insertRecommendationOverride(input: {
    subject: SubjectRef;
    definition: ScoreDefinitionVersion;
    computedResultId: string;
    recommendation: Record<string, unknown>;
    actorUserId: string | null;
    reasonCode: string;
    reasonNote?: string | null;
  }): Promise<{ id: string }>;
}

export interface RecalculationJobRepository {
  createPending(input: {
    idempotencyKey: string;
    eventType: string;
    subject: SubjectRef;
    scoreKey?: string | null;
  }): Promise<{ id: string; created: boolean }>;
  markRunning(id: string): Promise<void>;
  markCompleted(
    id: string,
    resultId: string | null,
    previousResultId: string | null,
  ): Promise<void>;
  markFailed(id: string, message: string): Promise<void>;
}
