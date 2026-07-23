import type { JobEnvelope, JobHandlerRegistryPort } from '@adp/platform';

import type { RecalculationJobRepository } from '../domain/ports.js';
import type { SubjectRef } from '../domain/types.js';
import type { ScoringService } from './scoring-service.js';

export const SCORE_RECALCULATION_JOB = 'score.recalculate';
export const RECALCULATION_EVENT_TYPES = [
  'variable_value.confirmed',
  'variable_value.superseded',
  'variable_value.contradicted',
  'variable_value.stale',
  'score_definition.published',
] as const;

export class ScoreRecalculationService {
  constructor(
    private readonly jobs: RecalculationJobRepository,
    private readonly scoring: ScoringService,
    private readonly scoreKeys: readonly string[],
  ) {}

  register(registry: JobHandlerRegistryPort): void {
    registry.register(SCORE_RECALCULATION_JOB, (job) => this.handle(job));
  }

  async enqueueFromOutboxEvent(event: {
    eventType: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (
      !RECALCULATION_EVENT_TYPES.includes(
        event.eventType as (typeof RECALCULATION_EVENT_TYPES)[number],
      )
    ) {
      return;
    }
    const subject = subjectFromPayload(event.payload);
    if (subject === null) return;
    const scoreKey = readString(event.payload['scoreKey']);
    await this.jobs.createPending(
      scoreKey === undefined
        ? {
            idempotencyKey: `score-recalc:${event.idempotencyKey}`,
            eventType: event.eventType,
            subject,
          }
        : {
            idempotencyKey: `score-recalc:${event.idempotencyKey}`,
            eventType: event.eventType,
            subject,
            scoreKey,
          },
    );
  }

  async handle(job: JobEnvelope): Promise<void> {
    const jobId = readRequiredString(job.payload['jobId']);
    const subject = subjectFromPayload(job.payload);
    if (subject === null) throw new Error('Score recalculation job requires a subject.');
    const scoreKey = readString(job.payload['scoreKey']);
    await this.jobs.markRunning(jobId);
    try {
      let lastResultId: string | null = null;
      let previousResultId: string | null = null;
      for (const key of scoreKey === undefined ? this.scoreKeys : [scoreKey]) {
        const result = await this.scoring.calculate(subject, key, { allowDraft: true });
        lastResultId = result.persistedResultId ?? null;
        previousResultId = null;
      }
      await this.jobs.markCompleted(jobId, lastResultId, previousResultId);
    } catch (error) {
      await this.jobs.markFailed(jobId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}

export function registerScoreRecalculationHandler(
  registry: JobHandlerRegistryPort,
  service: ScoreRecalculationService,
): void {
  service.register(registry);
}

function subjectFromPayload(payload: Record<string, unknown>): SubjectRef | null {
  if (payload['subjectType'] === 'organization' && typeof payload['organizationId'] === 'string') {
    return { subjectType: 'organization', organizationId: payload['organizationId'] };
  }
  if (payload['subjectType'] === 'contact' && typeof payload['contactId'] === 'string') {
    return { subjectType: 'contact', contactId: payload['contactId'] };
  }
  return null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readRequiredString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Required string payload field is missing.');
  return value;
}
