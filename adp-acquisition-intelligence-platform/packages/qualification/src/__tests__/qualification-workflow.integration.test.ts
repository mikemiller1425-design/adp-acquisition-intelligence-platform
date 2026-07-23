import type { DatabaseClient, RepositoryExecutor } from '@adp/database';
import {
  auditEvents,
  createDatabaseClient,
  organizations,
  outboxEvents,
  qualificationDecisions,
  qualificationRecommendationOverrides,
  qualificationReviews,
  scoreDefinitions,
  scoreDefinitionVersions,
  scoreInputSnapshots,
  scoreResults,
  tasks,
  users,
} from '@adp/database';
import {
  acquireTestDatabaseLock,
  getTestDatabaseUrl,
  migrateTestDatabase,
  type TestDatabaseLock,
} from '@adp/database/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OperationalStateService } from '../application/operational-state-service.js';
import {
  QualificationConditionService,
  QualificationReviewService,
  QualificationTransitionCoordinator,
  ReentryService,
  ReviewWorkspaceQuery,
} from '../application/qualification-services.js';
import type { OperationalStateAuditPort, OperationalStateOutboxPort } from '../domain/ports.js';
import type { QualificationActor } from '../domain/qualification.js';
import type { QualificationGuardPort } from '../domain/qualification-ports.js';
import {
  PostgresOperationalStateTransitionRepository,
  PostgresOrganizationStateWriter,
} from '../infrastructure/postgres-operational-state.js';
import {
  PostgresDisqualificationReasonRepository,
  PostgresQualificationAuditAdapter,
  PostgresQualificationConditionRepository,
  PostgresQualificationDecisionRepository,
  PostgresQualificationOutboxAdapter,
  PostgresQualificationReviewRepository,
  PostgresQualificationTaskPort,
  PostgresRecommendationOverrideRepository,
} from '../infrastructure/postgres-qualification.js';

const testDatabaseUrl = getTestDatabaseUrl();
const reviewer = (userId: string): QualificationActor => ({ userId, roles: ['reviewer'] });
const sales = (userId: string): QualificationActor => ({ userId, roles: ['sales'] });

describe.sequential('Prompt 6 qualification workflow integration', () => {
  let lock: TestDatabaseLock;
  let client: DatabaseClient;

  beforeAll(async () => {
    lock = await acquireTestDatabaseLock(testDatabaseUrl);
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    client = createDatabaseClient(testDatabaseUrl);
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await lock?.release();
  });

  it('1. requests review queue entries and links score results', async () => {
    const fixture = await createFixture(client, 'queue');
    const service = buildQualificationService(client.db);

    const review = await service.request({
      organizationId: fixture.organizationId,
      actor: reviewer(fixture.userId),
      assignedToUserId: fixture.userId,
      scoreResultIds: [fixture.scoreResultId],
      computedRecommendation: { primaryMotion: 'payroll', nextAction: 'review' },
    });
    const queue = await new PostgresQualificationReviewRepository(client.db).listQueue({
      statuses: ['pending'],
      assignedToUserId: fixture.userId,
      limit: 10,
    });
    const links = await new PostgresQualificationReviewRepository(client.db).listScores(review.id);

    expect(queue.map((item) => item.id)).toContain(review.id);
    expect(links).toHaveLength(1);
    expect(links[0]?.scoreResultId).toBe(fixture.scoreResultId);
  });

  it('2. conditionally qualifies to prospect_stage=qualified with blocking tasks', async () => {
    const fixture = await createFixture(client, 'conditional');
    const review = await requestAndStart(client, fixture);

    const result = await client.withTransaction(async (tx) =>
      buildQualificationService(tx).decide({
        reviewId: review.id,
        outcome: 'conditionally_qualified',
        expectedReviewVersion: 2,
        expectedOrganizationRecordVersion: 1,
        actor: reviewer(fixture.userId),
        reasonCode: 'accepted_with_conditions',
        conditions: [condition(fixture.userId, 'confirm_payroll_book')],
        commandCorrelationId: '66666666-6666-6666-6666-666666666662',
      }),
    );
    const org = await organization(client, fixture.organizationId);
    const taskRows = await client.db
      .select()
      .from(tasks)
      .where(eq(tasks.organizationId, fixture.organizationId));

    expect(result.decision.outcome).toBe('conditionally_qualified');
    expect(result.conditions).toHaveLength(1);
    expect(result.conditions[0]?.type).toBe('blocking');
    expect(org.prospectStage).toBe('qualified');
    expect(taskRows).toHaveLength(1);
  });

  it('3. preserves computed score result after recommendation override', async () => {
    const fixture = await createFixture(client, 'override');
    const review = await requestAndStart(client, fixture, {
      computedRecommendation: { primaryMotion: 'payroll', nextAction: 'qualify' },
    });

    await client.withTransaction(async (tx) =>
      buildQualificationService(tx).decide({
        reviewId: review.id,
        outcome: 'qualified',
        expectedReviewVersion: 2,
        expectedOrganizationRecordVersion: 1,
        actor: reviewer(fixture.userId),
        reasonCode: 'manual_motion_selection',
        reviewerRecommendation: { primaryMotion: 'retirement', nextAction: 'qualify' },
        overrideReasonCode: 'reviewer_judgment',
        commandCorrelationId: '66666666-6666-6666-6666-666666666663',
      }),
    );
    const score = first(
      await client.db.select().from(scoreResults).where(eq(scoreResults.id, fixture.scoreResultId)),
    );
    const overrides = await client.db
      .select()
      .from(qualificationRecommendationOverrides)
      .where(eq(qualificationRecommendationOverrides.reviewId, review.id));

    expect(score.recommendation).toEqual({ primaryMotion: 'payroll', nextAction: 'review' });
    expect(score.overrideRecommendation).toBeNull();
    expect(overrides).toHaveLength(1);
  });

  it('4. routes research_required with required gaps and blocking research tasks', async () => {
    const fixture = await createFixture(client, 'research-required');
    const review = await requestAndStart(client, fixture);

    const result = await client.withTransaction(async (tx) =>
      buildQualificationService(tx).decide({
        reviewId: review.id,
        outcome: 'research_required',
        expectedReviewVersion: 2,
        expectedOrganizationRecordVersion: 1,
        actor: reviewer(fixture.userId),
        reasonCode: 'critical_unknowns',
        requiredGaps: ['payroll_platform_unknown'],
        conditions: [condition(fixture.userId, 'payroll_platform_unknown')],
        commandCorrelationId: '66666666-6666-6666-6666-666666666664',
      }),
    );
    const org = await organization(client, fixture.organizationId);

    expect(result.conditions).toHaveLength(1);
    expect(org.prospectStage).toBe('research_required');
  });

  it('5. records nurture without deleting prior intelligence', async () => {
    const fixture = await createFixture(client, 'nurture');
    const review = await requestAndStart(client, fixture);

    await client.withTransaction(async (tx) =>
      buildQualificationService(tx).decide({
        reviewId: review.id,
        outcome: 'nurture',
        expectedReviewVersion: 2,
        expectedOrganizationRecordVersion: 1,
        actor: reviewer(fixture.userId),
        reasonCode: 'timing_not_aligned',
        reasonNote: 'Revisit next quarter.',
        commandCorrelationId: '66666666-6666-6666-6666-666666666665',
      }),
    );
    const org = await organization(client, fixture.organizationId);
    const links = await new PostgresQualificationReviewRepository(client.db).listScores(review.id);

    expect(org.prospectStage).toBe('nurture');
    expect(links.map((link) => link.scoreResultId)).toContain(fixture.scoreResultId);
  });

  it('6. disqualifies with a controlled reason and preserves review intelligence', async () => {
    const fixture = await createFixture(client, 'disqualified');
    const review = await requestAndStart(client, fixture);

    const result = await client.withTransaction(async (tx) =>
      buildQualificationService(tx).decide({
        reviewId: review.id,
        outcome: 'disqualified',
        expectedReviewVersion: 2,
        expectedOrganizationRecordVersion: 1,
        actor: reviewer(fixture.userId),
        reasonCode: 'not_pursuable',
        disqualificationReasonKey: 'poor_fit',
        commandCorrelationId: '66666666-6666-6666-6666-666666666666',
      }),
    );
    const org = await organization(client, fixture.organizationId);

    expect(org.prospectStage).toBe('disqualified');
    expect(result.decision.disqualificationReasonId).not.toBeNull();
    expect(result.decision.decisionSnapshot.computedRecommendation).toEqual({
      primaryMotion: 'payroll',
      nextAction: 'review',
    });
  });

  it('7. keeps consent indicators separate from fit outcome and score', async () => {
    const fixture = await createFixture(client, 'consent');
    const review = await requestAndStart(client, fixture, {
      consentIndicators: { email: 'restricted' },
    });

    await client.withTransaction(async (tx) =>
      buildQualificationService(tx).decide({
        reviewId: review.id,
        outcome: 'qualified',
        expectedReviewVersion: 2,
        expectedOrganizationRecordVersion: 1,
        actor: reviewer(fixture.userId),
        reasonCode: 'fit_confirmed_permission_pending',
        commandCorrelationId: '66666666-6666-6666-6666-666666666667',
      }),
    );
    const workspace = await new ReviewWorkspaceQuery(
      new PostgresQualificationReviewRepository(client.db),
      new PostgresQualificationConditionRepository(client.db),
      new PostgresQualificationDecisionRepository(client.db),
    ).forReview(review.id, reviewer(fixture.userId));
    const score = first(
      await client.db.select().from(scoreResults).where(eq(scoreResults.id, fixture.scoreResultId)),
    );

    expect(workspace.consentIndicators).toEqual({ email: 'restricted' });
    expect(score.score).toBe('82.0000');
  });

  it('8. denies unauthorized qualification decisions without state changes', async () => {
    const fixture = await createFixture(client, 'unauthorized');
    const review = await requestAndStart(client, fixture);

    await expect(
      client.withTransaction(async (tx) =>
        buildQualificationService(tx).decide({
          reviewId: review.id,
          outcome: 'qualified',
          expectedReviewVersion: 2,
          expectedOrganizationRecordVersion: 1,
          actor: sales(fixture.userId),
          reasonCode: 'sales_attempt',
        }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const org = await organization(client, fixture.organizationId);
    const decisions = await client.db
      .select()
      .from(qualificationDecisions)
      .where(eq(qualificationDecisions.reviewId, review.id));

    expect(org.prospectStage).toBe('review');
    expect(decisions).toHaveLength(0);
  });

  it('9. rolls back stale review-version decisions on concurrency conflict', async () => {
    const fixture = await createFixture(client, 'concurrency');
    const review = await requestAndStart(client, fixture);

    await expect(
      client.withTransaction(async (tx) =>
        buildQualificationService(tx).decide({
          reviewId: review.id,
          outcome: 'qualified',
          expectedReviewVersion: 1,
          expectedOrganizationRecordVersion: 1,
          actor: reviewer(fixture.userId),
          reasonCode: 'stale_version',
          commandCorrelationId: '66666666-6666-6666-6666-666666666669',
        }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const decisions = await client.db
      .select()
      .from(qualificationDecisions)
      .where(eq(qualificationDecisions.reviewId, review.id));
    const currentReview = first(
      await client.db
        .select()
        .from(qualificationReviews)
        .where(eq(qualificationReviews.id, review.id)),
    );

    expect(decisions).toHaveLength(0);
    expect(currentReview.status).toBe('in_review');
  });

  it('10. rolls back decision rows when stage transition fails', async () => {
    const fixture = await createFixture(client, 'rollback');
    const review = await requestAndStart(client, fixture);

    await expect(
      client.withTransaction(async (tx) =>
        buildQualificationService(tx, new ThrowingTransitionCoordinator()).decide({
          reviewId: review.id,
          outcome: 'qualified',
          expectedReviewVersion: 2,
          expectedOrganizationRecordVersion: 1,
          actor: reviewer(fixture.userId),
          reasonCode: 'transition_failure',
        }),
      ),
    ).rejects.toThrow('simulated transition failure');
    const org = await organization(client, fixture.organizationId);
    const decisions = await client.db
      .select()
      .from(qualificationDecisions)
      .where(eq(qualificationDecisions.reviewId, review.id));

    expect(org.prospectStage).toBe('review');
    expect(decisions).toHaveLength(0);
  });

  it('11. enforces re-entry policy and writes transition history', async () => {
    const fixture = await createFixture(client, 'reentry', 'nurture');
    const result = await client.withTransaction(async (tx) =>
      buildReentryService(tx).reenter({
        organizationId: fixture.organizationId,
        from: 'nurture',
        to: 'review',
        expectedOrganizationRecordVersion: 1,
        actor: reviewer(fixture.userId),
        reasonCode: 'review_requested',
        ownerUserId: fixture.userId,
        dueDate: '2026-08-01',
        commandCorrelationId: '66666666-6666-6666-6666-666666666611',
      }),
    );
    const org = await organization(client, fixture.organizationId);

    expect(result.transition.fromValue).toBe('nurture');
    expect(result.transition.toValue).toBe('review');
    expect(org.prospectStage).toBe('review');
  });

  it('12. resolves and waives conditions so blocking work no longer appears open', async () => {
    const fixture = await createFixture(client, 'condition-lifecycle');
    const review = await requestAndStart(client, fixture);
    const result = await client.withTransaction(async (tx) =>
      buildQualificationService(tx).decide({
        reviewId: review.id,
        outcome: 'conditionally_qualified',
        expectedReviewVersion: 2,
        expectedOrganizationRecordVersion: 1,
        actor: reviewer(fixture.userId),
        reasonCode: 'accepted_with_conditions',
        conditions: [
          condition(fixture.userId, 'confirm_owner'),
          condition(fixture.userId, 'verify_compliance'),
        ],
        commandCorrelationId: '66666666-6666-6666-6666-666666666612',
      }),
    );
    const service = new QualificationConditionService(
      new PostgresQualificationConditionRepository(client.db),
      new PostgresQualificationAuditAdapter(client.db),
      new PostgresQualificationOutboxAdapter(client.db),
    );

    await service.resolve({
      conditionId: result.conditions[0]!.id,
      actor: reviewer(fixture.userId),
      resolutionNote: 'Confirmed.',
    });
    await service.waive({
      conditionId: result.conditions[1]!.id,
      actor: reviewer(fixture.userId),
      reasonCode: 'reviewer_exception',
    });
    const open = await new PostgresQualificationConditionRepository(
      client.db,
    ).listOpenBlockingForOrganization(fixture.organizationId);

    expect(open).toHaveLength(0);
  });
});

function buildQualificationService(
  db: RepositoryExecutor,
  coordinator = new QualificationTransitionCoordinator(buildOperationalStateService(db)),
) {
  return new QualificationReviewService(
    new PostgresQualificationReviewRepository(db),
    new PostgresQualificationDecisionRepository(db),
    new PostgresDisqualificationReasonRepository(db),
    new PostgresQualificationConditionRepository(db),
    new PostgresRecommendationOverrideRepository(db),
    coordinator,
    new PostgresQualificationTaskPort(db),
    new AllowAllQualificationGuard(),
    new PostgresQualificationAuditAdapter(db),
    new PostgresQualificationOutboxAdapter(db),
  );
}

function buildReentryService(db: RepositoryExecutor) {
  return new ReentryService(
    buildOperationalStateService(db),
    new AllowAllQualificationGuard(),
    new PostgresQualificationTaskPort(db),
    new PostgresQualificationAuditAdapter(db),
    new PostgresQualificationOutboxAdapter(db),
  );
}

function buildOperationalStateService(db: RepositoryExecutor) {
  return new OperationalStateService(
    new PostgresOrganizationStateWriter(db),
    new PostgresOperationalStateTransitionRepository(db),
    new OperationalAuditAdapter(db),
    new OperationalOutboxAdapter(db),
  );
}

class AllowAllQualificationGuard implements QualificationGuardPort {
  async assertCanAccessOrganization(): Promise<void> {
    await Promise.resolve();
  }

  async assertAssignmentAllowsQualification(): Promise<void> {
    await Promise.resolve();
  }

  async assertTerritoryAllowsQualification(): Promise<void> {
    await Promise.resolve();
  }
}

class ThrowingTransitionCoordinator extends QualificationTransitionCoordinator {
  constructor() {
    super({} as OperationalStateService);
  }

  override async applyDecision(): Promise<never> {
    throw new Error('simulated transition failure');
  }
}

class OperationalAuditAdapter implements OperationalStateAuditPort {
  constructor(private readonly db: RepositoryExecutor) {}

  async append(event: Parameters<OperationalStateAuditPort['append']>[0]): Promise<void> {
    await this.db.insert(auditEvents).values({
      actorType: event.actorUserId === null ? 'system' : 'user',
      actorUserId: event.actorUserId,
      action: event.action,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      organizationId: event.subjectId,
      commandCorrelationId: event.correlationId,
      metadata: event.metadata,
    });
  }
}

class OperationalOutboxAdapter implements OperationalStateOutboxPort {
  constructor(private readonly db: RepositoryExecutor) {}

  async insert(event: Parameters<OperationalStateOutboxPort['insert']>[0]): Promise<void> {
    await this.db.insert(outboxEvents).values({
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      idempotencyKey: event.idempotencyKey,
      payload: event.payload,
      metadata: event.metadata,
    });
  }
}

async function requestAndStart(
  client: DatabaseClient,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  options: {
    computedRecommendation?: Record<string, unknown>;
    consentIndicators?: Record<string, unknown>;
  } = {},
) {
  const service = buildQualificationService(client.db);
  const review = await service.request({
    organizationId: fixture.organizationId,
    actor: reviewer(fixture.userId),
    assignedToUserId: fixture.userId,
    scoreResultIds: [fixture.scoreResultId],
    computedRecommendation: options.computedRecommendation ?? {
      primaryMotion: 'payroll',
      nextAction: 'review',
    },
    consentIndicators: options.consentIndicators ?? {},
  });
  return service.start({
    reviewId: review.id,
    actor: reviewer(fixture.userId),
    expectedRecordVersion: 1,
  });
}

async function createFixture(
  client: DatabaseClient,
  suffix: string,
  prospectStage: (typeof organizations.prospectStage.enumValues)[number] = 'review',
) {
  const user = first(
    await client.db
      .insert(users)
      .values({
        externalSubjectId: `auth0|prompt6-${suffix}`,
        email: `prompt6-${suffix}@example.com`,
        displayName: `Prompt 6 ${suffix}`,
        status: 'active',
      })
      .returning({ id: users.id }),
  );
  const org = first(
    await client.db
      .insert(organizations)
      .values({
        displayName: `Prompt 6 ${suffix} Advisors`,
        normalizedName: `prompt 6 ${suffix} advisors`,
        normalizedDomain: `prompt6-${suffix}.example.com`,
        prospectStage,
      })
      .returning({ id: organizations.id }),
  );
  const scoreDefinition = first(
    await client.db
      .insert(scoreDefinitions)
      .values({
        key: `prompt6_${suffix}`,
        displayName: `Prompt 6 ${suffix}`,
        description: 'Prompt 6 fixture score definition',
        family: 'motion',
        subjectType: 'organization',
        status: 'active',
        approvalStatus: 'approved',
      })
      .returning({ id: scoreDefinitions.id }),
  );
  const scoreVersion = first(
    await client.db
      .insert(scoreDefinitionVersions)
      .values({
        definitionId: scoreDefinition.id,
        version: '1.0.0',
        status: 'active',
        approvalStatus: 'approved',
        publishedAt: new Date('2026-07-22T00:00:00.000Z'),
        tiers: { high: 80 },
        confidencePolicy: {},
        recommendationPolicy: {},
      })
      .returning({ id: scoreDefinitionVersions.id }),
  );
  const snapshot = first(
    await client.db
      .insert(scoreInputSnapshots)
      .values({
        scoreDefinitionId: scoreDefinition.id,
        scoreDefinitionVersionId: scoreVersion.id,
        subjectType: 'organization',
        organizationId: org.id,
        normalizedInputs: {},
        valueRefs: [],
        evidenceRefs: [],
        definitionRefs: [],
        definitionDigest: `digest-${suffix}`,
      })
      .returning({ id: scoreInputSnapshots.id }),
  );
  const score = first(
    await client.db
      .insert(scoreResults)
      .values({
        scoreDefinitionId: scoreDefinition.id,
        scoreDefinitionVersionId: scoreVersion.id,
        subjectType: 'organization',
        organizationId: org.id,
        inputSnapshotId: snapshot.id,
        status: 'final',
        score: '82.0000',
        tier: 'high',
        confidence: '0.9000',
        completeness: '0.9000',
        explanation: {},
        recommendation: { primaryMotion: 'payroll', nextAction: 'review' },
      })
      .returning({ id: scoreResults.id }),
  );
  return { userId: user.id, organizationId: org.id, scoreResultId: score.id };
}

function condition(ownerUserId: string, key: string) {
  return {
    type: 'blocking' as const,
    key,
    title: `Resolve ${key}`,
    ownerUserId,
    dueDate: '2026-08-01',
  };
}

async function organization(client: DatabaseClient, organizationId: string) {
  return first(
    await client.db.select().from(organizations).where(eq(organizations.id, organizationId)),
  );
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected at least one row');
  return row;
}
