import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  mapDatabaseError,
  organizations,
  scoreDefinitions,
  scoreFactors,
  scoreInputSnapshots,
  scoreRecalculationJobs,
  scoreResults,
} from '@adp/database';
import {
  acquireTestDatabaseLock,
  createTestDatabaseClient,
  getTestDatabaseUrl,
  migrateTestDatabase,
  type TestDatabaseLock,
} from '@adp/database/testing';

import type { ScoreInputRepository } from '../domain/ports.js';
import type { ScoreDefinitionVersion, ScoringInput } from '../domain/types.js';
import {
  PostgresRecalculationJobRepository,
  PostgresScoreDefinitionRepository,
  PostgresScoreResultRepository,
} from '../infrastructure/postgres-repositories.js';
import { ScoreDefinitionService } from '../application/definition-services.js';
import { ScoringService } from '../application/scoring-service.js';

const testDatabaseUrl = getTestDatabaseUrl();

describe.sequential('Prompt 5 scoring integration', () => {
  let lock: TestDatabaseLock;

  beforeAll(async () => {
    lock = await acquireTestDatabaseLock(testDatabaseUrl);
  }, 120_000);

  afterAll(async () => {
    await lock?.release();
  });

  it('persists immutable snapshots, score results, and factors', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const client = createTestDatabaseClient(testDatabaseUrl);
    try {
      const organization = first(
        await client.db
          .insert(organizations)
          .values({
            displayName: 'Scoring Persistence Advisors',
            normalizedName: 'scoring persistence advisors',
            normalizedDomain: 'scoring-persistence.example.com',
          })
          .returning({ id: organizations.id }),
      );
      const definitions = new PostgresScoreDefinitionRepository(client.db);
      const draft = await definitions.upsertDraft(testDefinition());
      const service = new ScoringService(
        definitions,
        new StaticInputRepository([input('fit', 90), input('access', 70)]),
        new PostgresScoreResultRepository(client.db),
      );

      const result = await service.calculate(
        { subjectType: 'organization', organizationId: organization.id },
        draft.key,
        { allowDraft: true },
      );

      expect(result.persistedResultId).toBeDefined();
      expect(result.inputSnapshotId).toBeDefined();
      expect(result.score).toBe(80);

      const snapshotCount = first(
        await client.db.select({ value: count() }).from(scoreInputSnapshots),
      ).value;
      const factorCount = first(
        await client.db.select({ value: count() }).from(scoreFactors),
      ).value;
      expect(snapshotCount).toBe(1);
      expect(factorCount).toBe(2);

      await expect(
        client.db
          .update(scoreResults)
          .set({ tier: 'rewritten' })
          .where(eq(scoreResults.id, result.persistedResultId as string)),
      ).rejects.toSatisfy((error: unknown) => errorText(error).includes('append-only'));
      await expect(
        client.db
          .delete(scoreInputSnapshots)
          .where(eq(scoreInputSnapshots.id, result.inputSnapshotId as string)),
      ).rejects.toSatisfy((error: unknown) => errorText(error).includes('append-only'));
    } finally {
      await client.close();
    }
  });

  it('blocks active status without approval and keeps recalculation jobs idempotent', async () => {
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    const client = createTestDatabaseClient(testDatabaseUrl);
    try {
      await expect(
        client.db.insert(scoreDefinitions).values({
          key: 'forbidden_active',
          displayName: 'Forbidden Active',
          description: 'Should fail',
          family: 'motion',
          subjectType: 'organization',
          status: 'active',
          approvalStatus: 'draft_unapproved',
        }),
      ).rejects.toSatisfy((error: unknown) => {
        const mapped = mapDatabaseError(error);
        return mapped?.kind === 'check' || errorText(error).includes('approval_status=approved');
      });

      const definitions = new PostgresScoreDefinitionRepository(client.db);
      const definitionService = new ScoreDefinitionService(definitions);
      await definitionService.createDraft(testDefinition('cannot_publish'));
      await expect(
        definitionService.publish({
          key: 'cannot_publish',
          version: '0.1.0-draft',
          actor: { userId: null, roles: ['admin'] },
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      const organization = first(
        await client.db
          .insert(organizations)
          .values({
            displayName: 'Scoring Job Advisors',
            normalizedName: 'scoring job advisors',
            normalizedDomain: 'scoring-job.example.com',
          })
          .returning({ id: organizations.id }),
      );
      const jobs = new PostgresRecalculationJobRepository(client.db);
      const firstJob = await jobs.createPending({
        idempotencyKey: 'job-key',
        eventType: 'variable_value.confirmed',
        subject: { subjectType: 'organization', organizationId: organization.id },
        scoreKey: 'synthetic_fit',
      });
      const secondJob = await jobs.createPending({
        idempotencyKey: 'job-key',
        eventType: 'variable_value.confirmed',
        subject: { subjectType: 'organization', organizationId: organization.id },
        scoreKey: 'synthetic_fit',
      });

      expect(firstJob.created).toBe(true);
      expect(secondJob.created).toBe(false);
      expect(firstJob.id).toBe(secondJob.id);
      const jobCount = first(
        await client.db.select({ value: count() }).from(scoreRecalculationJobs),
      ).value;
      expect(jobCount).toBe(1);
    } finally {
      await client.close();
    }
  });
});

class StaticInputRepository implements ScoreInputRepository {
  constructor(private readonly inputs: readonly ScoringInput[]) {}

  listInputs(): Promise<ScoringInput[]> {
    return Promise.resolve([...this.inputs]);
  }
}

function testDefinition(key = 'synthetic_fit'): ScoreDefinitionVersion {
  return {
    key,
    displayName: 'Synthetic Fit',
    description: 'Synthetic scoring definition for integration tests.',
    family: 'motion',
    subjectType: 'organization',
    version: '0.1.0-draft',
    status: 'draft',
    approvalStatus: 'draft_unapproved',
    range: [0, 100],
    minimumCompleteness: 0.5,
    tiers: { high: 75, medium: 50, low: 0 },
    confidencePolicy: { approvalStatus: 'approved' },
    recommendationPolicy: { nextAction: 'Review synthetic score.' },
    allowOptionalWeightRenormalization: true,
    components: [
      { key: 'fit', weight: 0.5, transform: 'identity_passthrough', required: true },
      { key: 'access', weight: 0.5, transform: 'identity_passthrough', required: true },
    ],
  };
}

function input(componentKey: string, value: number): ScoringInput {
  return {
    componentKey,
    value,
    valueStatus: 'known',
    confidenceStatus: 'assessed',
    confidenceScore: 0.8,
  };
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected row.');
  return row;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.message}\n${errorText(error.cause)}`;
  return String(error ?? '');
}
