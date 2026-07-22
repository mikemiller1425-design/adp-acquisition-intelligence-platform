import { createHash } from 'node:crypto';

import { AppError } from '@adp/platform';

import { calculateCompleteness } from '../domain/completeness.js';
import { calculateScoreCore } from '../domain/scoring-engine.js';
import type {
  CompletenessDefinitionRepository,
  ScoreDefinitionRepository,
  ScoreInputRepository,
  ScoreResultRepository,
} from '../domain/ports.js';
import type { ScoreCalculationResult, ScoringInput, SubjectRef } from '../domain/types.js';

export class CompletenessService {
  constructor(
    private readonly definitions: CompletenessDefinitionRepository,
    private readonly inputs: ScoreInputRepository,
  ) {}

  async calculate(
    subject: SubjectRef,
    completenessKey: string,
  ): Promise<ReturnType<typeof calculateCompleteness>> {
    const definition = await this.definitions.findByKey(completenessKey);
    if (definition === null) throw notFound('Completeness definition not found', completenessKey);
    const values = await this.inputs.listInputs(subject, {
      key: definition.key,
      displayName: definition.displayName,
      description: definition.description,
      family: 'support',
      subjectType: definition.subjectType,
      version: definition.version,
      status: definition.status,
      approvalStatus: definition.approvalStatus,
      range: [0, 100],
      minimumCompleteness: definition.minimumCompleteness,
      tiers: { high: 0 },
      confidencePolicy: { approvalStatus: definition.approvalStatus },
      recommendationPolicy: {},
      allowOptionalWeightRenormalization: true,
      components: definition.variables.map((variable) => ({
        key: variable.key,
        variableKey: variable.key,
        weight: variable.weight,
        transform: 'identity_passthrough',
        ...(variable.required !== undefined ? { required: variable.required } : {}),
      })),
    });
    return calculateCompleteness(definition, values);
  }
}

export class ScoringService {
  constructor(
    private readonly definitions: ScoreDefinitionRepository,
    private readonly inputs: ScoreInputRepository,
    private readonly results: ScoreResultRepository,
  ) {}

  async calculate(
    subject: SubjectRef,
    scoreKey: string,
    options: { allowDraft?: boolean; persist?: boolean; now?: Date } = {},
  ): Promise<ScoreCalculationResult & { persistedResultId?: string; inputSnapshotId?: string }> {
    const definition = options.allowDraft
      ? await this.definitions.findByKey(scoreKey)
      : await this.definitions.findActiveByKey(scoreKey);
    if (definition === null) throw notFound('Score definition not found', scoreKey);
    if (definition.status !== 'active' && options.allowDraft !== true) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Draft score calculations require allowDraft mode',
        details: { scoreKey },
      });
    }

    const startedAt = Date.now();
    const values = await this.inputs.listInputs(subject, definition);
    const result = calculateScoreCore(definition, values, {
      confidenceMode: options.allowDraft === true ? 'allowDraft' : 'strict',
      ...(options.now !== undefined ? { now: options.now } : {}),
    });

    if (options.persist === false) return result;

    const previous = await this.results.latest(subject, scoreKey);
    const persisted = await this.results.insert({
      subject,
      definition,
      result,
      normalizedInputs: normalizedInputMap(values),
      valueRefs: values.flatMap((value) =>
        value.valueId === undefined || value.valueId === null ? [] : [value.valueId],
      ),
      evidenceRefs: [...new Set(values.flatMap((value) => value.evidenceIds ?? []))],
      definitionDigest: digestDefinition(definition),
      previousScoreResultId: previous?.id ?? null,
      durationMs: Date.now() - startedAt,
    });
    return {
      ...result,
      persistedResultId: persisted.id,
      inputSnapshotId: persisted.inputSnapshotId,
    };
  }
}

export class OverrideService {
  constructor(
    private readonly definitions: ScoreDefinitionRepository,
    private readonly results: ScoreResultRepository,
  ) {}

  async overrideRecommendation(command: {
    subject: SubjectRef;
    scoreKey: string;
    computedResultId: string;
    recommendation: Record<string, unknown>;
    actorUserId: string | null;
    reasonCode: string;
    reasonNote?: string | null;
  }): Promise<{ id: string }> {
    const definition = await this.definitions.findByKey(command.scoreKey);
    if (definition === null) throw notFound('Score definition not found', command.scoreKey);
    if (command.reasonCode.trim() === '') {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Override reason code is required',
      });
    }
    return this.results.insertRecommendationOverride({
      subject: command.subject,
      definition,
      computedResultId: command.computedResultId,
      recommendation: command.recommendation,
      actorUserId: command.actorUserId,
      reasonCode: command.reasonCode,
      reasonNote: command.reasonNote ?? null,
    });
  }
}

function normalizedInputMap(values: readonly ScoringInput[]): Record<string, unknown> {
  return Object.fromEntries(
    [...values]
      .sort((left, right) => left.componentKey.localeCompare(right.componentKey))
      .map((value) => [value.componentKey, value.normalizedValue ?? value.value]),
  );
}

function digestDefinition(definition: unknown): string {
  return createHash('sha256').update(JSON.stringify(definition)).digest('hex');
}

function notFound(message: string, key: string): AppError {
  return new AppError({ code: 'NOT_FOUND', message, details: { key } });
}
