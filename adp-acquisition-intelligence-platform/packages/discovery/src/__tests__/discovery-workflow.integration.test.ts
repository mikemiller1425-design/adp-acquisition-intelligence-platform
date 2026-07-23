import type { DatabaseClient, RepositoryExecutor } from '@adp/database';
import {
  auditEvents,
  createDatabaseClient,
  discoveryAnswers,
  discoveryMappings,
  discoveryQuestions,
  discoveryScoreSnapshots,
  discoveryTemplateQuestions,
  discoveryTemplates,
  organizations,
  outboxEvents,
  qualificationConditions,
  qualificationReviews,
  users,
  variableDefinitions,
  variableDefinitionVersions,
  variableValues,
} from '@adp/database';
import {
  acquireTestDatabaseLock,
  getTestDatabaseUrl,
  migrateTestDatabase,
  type TestDatabaseLock,
} from '@adp/database/testing';
import {
  OperationalStateService,
  PostgresOperationalStateTransitionRepository,
  PostgresOrganizationStateWriter,
  PostgresQualificationConditionRepository,
} from '@adp/qualification';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AgendaService,
  AnswerMappingService,
  DiscoveryAnswerService,
  DiscoverySessionService,
} from '../application/discovery-services.js';
import type { DiscoveryActor } from '../domain/discovery.js';
import type { ScoreDeltaPort, VariableConfirmationPort } from '../domain/ports.js';
import {
  OperationalStateProspectStageAdapter,
  PostgresDiscoveryAgendaRepository,
  PostgresDiscoveryAnswerRepository,
  PostgresDiscoveryAuditAdapter,
  PostgresDiscoveryFollowUpRepository,
  PostgresDiscoveryInterpretationRepository,
  PostgresDiscoveryMappingRepository,
  PostgresDiscoveryOutboxAdapter,
  PostgresDiscoveryScoreSnapshotRepository,
  PostgresDiscoverySessionRepository,
  PostgresDiscoveryTemplateRepository,
} from '../infrastructure/postgres-discovery.js';

const testDatabaseUrl = getTestDatabaseUrl();
const actor = (userId: string): DiscoveryActor => ({
  userId,
  roles: ['reviewer', 'sales'],
});

describe.sequential('Prompt 7 discovery workflow integration', () => {
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

  it('generates agenda, records verbatim answer, confirms mapping with score delta, completes session', async () => {
    const fixture = await createFixture(client, 'happy');
    const services = buildServices(client.db, fixture);

    const { agenda, items } = await services.agenda.generate({
      organizationId: fixture.organizationId,
      actor: actor(fixture.userId),
      motion: 'payroll',
      organizationType: 'ria',
      missingVariableKeys: ['payroll_client_count'],
      templateKey: fixture.templateKey,
      commandCorrelationId: '77777777-7777-7777-7777-777777777771',
    });
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((item) => item.reasonCode === 'missing_high_impact_variable')).toBe(true);

    const session = await services.sessions.create({
      organizationId: fixture.organizationId,
      actor: actor(fixture.userId),
      agendaId: agenda.id,
      commandCorrelationId: '77777777-7777-7777-7777-777777777772',
    });
    const scheduled = await services.sessions.schedule({
      sessionId: session.id,
      actor: actor(fixture.userId),
      expectedSessionVersion: 1,
      expectedOrganizationRecordVersion: 1,
      scheduledStartAt: new Date('2026-07-24T15:00:00.000Z'),
      commandCorrelationId: '77777777-7777-7777-7777-777777777773',
    });
    expect(scheduled.status).toBe('scheduled');
    expect((await org(client, fixture.organizationId)).prospectStage).toBe('discovery_scheduled');

    const started = await services.sessions.start({
      sessionId: scheduled.id,
      actor: actor(fixture.userId),
      expectedSessionVersion: 2,
    });
    expect(started.status).toBe('in_progress');

    const requiredItem = items.find((item) => item.required) ?? items[0];
    if (requiredItem === undefined) throw new Error('expected agenda item');

    const recorded = await services.answers.recordAnswer({
      sessionId: started.id,
      actor: actor(fixture.userId),
      agendaItemId: requiredItem.id,
      questionId: requiredItem.questionId,
      answerType: 'number',
      answerStatus: 'answered',
      originalAnswer: { text: 'We support about 120 payroll clients today.' },
      normalizedValue: 120,
      variableDefinitionId: fixture.variableDefinitionId,
      variableDefinitionVersionId: fixture.variableDefinitionVersionId,
      proposeMapping: true,
      confidence: 90,
      rationale: 'Parsed numeric client count from answer',
    });
    expect(recorded.answer.originalAnswer).toEqual({
      text: 'We support about 120 payroll clients today.',
    });
    expect(recorded.mapping?.status).toBe('proposed');
    if (recorded.mapping === null) throw new Error('expected proposed mapping');

    const confirmed = await services.mappings.confirm({
      mappingId: recorded.mapping.id,
      actor: actor(fixture.userId),
      scoreKeys: ['acquisition_fit'],
    });
    expect(confirmed.mapping.status).toBe('confirmed');
    expect(confirmed.mapping.variableValueId).toBe(fixture.fakeVariableValueId);
    expect(confirmed.snapshots[0]?.before).toBe(40);
    expect(confirmed.snapshots[0]?.after).toBe(62);
    expect(confirmed.recommendation.nextAction).toBe('advance_to_outreach_ready');

    const original = first(
      await client.db
        .select()
        .from(discoveryAnswers)
        .where(eq(discoveryAnswers.id, recorded.answer.id)),
    );
    expect(original.originalAnswer).toEqual({
      text: 'We support about 120 payroll clients today.',
    });

    const completed = await services.sessions.complete({
      sessionId: started.id,
      actor: actor(fixture.userId),
      expectedSessionVersion: 3,
      expectedOrganizationRecordVersion: 2,
      summary: { notes: 'Discovery complete' },
      commandCorrelationId: '77777777-7777-7777-7777-777777777774',
    });
    expect(completed.session.status).toBe('completed');
    expect((await org(client, fixture.organizationId)).prospectStage).toBe('discovery_completed');

    const snapshots = await client.db
      .select()
      .from(discoveryScoreSnapshots)
      .where(eq(discoveryScoreSnapshots.sessionId, started.id));
    expect(snapshots).toHaveLength(1);

    const audits = await client.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.organizationId, fixture.organizationId));
    expect(audits.some((row) => row.action === 'discovery.mapping_confirmed')).toBe(true);

    const outbox = await client.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, fixture.organizationId));
    expect(outbox.some((row) => row.eventType === 'discovery.score_delta_recorded')).toBe(true);
  });

  it('blocks agenda generation when open blocking qualification conditions exist', async () => {
    const fixture = await createFixture(client, 'blocked');
    const review = first(
      await client.db
        .insert(qualificationReviews)
        .values({
          organizationId: fixture.organizationId,
          status: 'decided',
          requestedByUserId: fixture.userId,
        })
        .returning({ id: qualificationReviews.id }),
    );
    await client.db.insert(qualificationConditions).values({
      reviewId: review.id,
      organizationId: fixture.organizationId,
      type: 'blocking',
      key: 'need_more_research',
      title: 'Need more research',
      ownerUserId: fixture.userId,
      dueDate: '2026-08-01',
      status: 'pending',
    });

    const services = buildServices(client.db, fixture);
    await expect(
      services.agenda.generate({
        organizationId: fixture.organizationId,
        actor: actor(fixture.userId),
        templateKey: fixture.templateKey,
      }),
    ).rejects.toSatisfy((error: unknown) =>
      String(error).includes('Open blocking qualification conditions'),
    );
  });

  it('rejects mapping confirmation without immutable original answer', async () => {
    const fixture = await createFixture(client, 'immutable');
    const services = buildServices(client.db, fixture);
    const { agenda, items } = await services.agenda.generate({
      organizationId: fixture.organizationId,
      actor: actor(fixture.userId),
      templateKey: fixture.templateKey,
    });
    const session = await services.sessions.create({
      organizationId: fixture.organizationId,
      actor: actor(fixture.userId),
      agendaId: agenda.id,
    });
    await services.sessions.schedule({
      sessionId: session.id,
      actor: actor(fixture.userId),
      expectedSessionVersion: 1,
      expectedOrganizationRecordVersion: 1,
      scheduledStartAt: new Date('2026-07-25T15:00:00.000Z'),
    });
    await services.sessions.start({
      sessionId: session.id,
      actor: actor(fixture.userId),
      expectedSessionVersion: 2,
    });
    const item = items[0];
    if (item === undefined) throw new Error('expected item');
    const recorded = await services.answers.recordAnswer({
      sessionId: session.id,
      actor: actor(fixture.userId),
      agendaItemId: item.id,
      questionId: item.questionId,
      answerType: 'text',
      answerStatus: 'answered',
      originalAnswer: { text: 'verbatim remains' },
      normalizedValue: 'verbatim remains',
      variableDefinitionId: fixture.variableDefinitionId,
      variableDefinitionVersionId: fixture.variableDefinitionVersionId,
      proposeMapping: true,
    });
    if (recorded.mapping === null) throw new Error('expected mapping');

    await client.db.execute(sql`
      update discovery_answers
      set original_answer = null, answer_status = 'unknown'
      where id = ${recorded.answer.id}
    `);

    await expect(
      services.mappings.confirm({
        mappingId: recorded.mapping.id,
        actor: actor(fixture.userId),
      }),
    ).rejects.toSatisfy((error: unknown) => String(error).includes('immutable original answer'));

    const mapping = first(
      await client.db
        .select()
        .from(discoveryMappings)
        .where(eq(discoveryMappings.id, recorded.mapping.id)),
    );
    expect(mapping.status).toBe('proposed');
  });
});

function buildServices(db: RepositoryExecutor, fixture: Awaited<ReturnType<typeof createFixture>>) {
  const templates = new PostgresDiscoveryTemplateRepository(db);
  const agendas = new PostgresDiscoveryAgendaRepository(db);
  const sessions = new PostgresDiscoverySessionRepository(db);
  const answers = new PostgresDiscoveryAnswerRepository(db);
  const interpretations = new PostgresDiscoveryInterpretationRepository(db);
  const mappings = new PostgresDiscoveryMappingRepository(db);
  const snapshots = new PostgresDiscoveryScoreSnapshotRepository(db);
  const followUps = new PostgresDiscoveryFollowUpRepository(db);
  const blocking = new PostgresQualificationConditionRepository(db);
  const audit = new PostgresDiscoveryAuditAdapter(db);
  const outbox = new PostgresDiscoveryOutboxAdapter(db);
  const stages = new OperationalStateProspectStageAdapter(
    new OperationalStateService(
      new PostgresOrganizationStateWriter(db),
      new PostgresOperationalStateTransitionRepository(db),
    ),
  );
  const variables: VariableConfirmationPort = {
    async confirmFromMapping() {
      return {
        variableValueId: fixture.fakeVariableValueId,
        evidenceRecordId: null,
      };
    },
  };
  const scores: ScoreDeltaPort = {
    async captureDeltas(input) {
      return input.scoreKeys.map((scoreKey) => ({
        scoreKey,
        before: 40,
        after: 62,
        beforeScoreResultId: null,
        afterScoreResultId: null,
        beforeSnapshot: { score: 40 },
        afterSnapshot: { score: 62 },
        recommendationMovement: { before: 'review', after: 'qualify' },
        durationMs: 12,
      }));
    },
  };

  return {
    agenda: new AgendaService(templates, agendas, blocking, audit, outbox),
    sessions: new DiscoverySessionService(
      sessions,
      agendas,
      answers,
      mappings,
      blocking,
      stages,
      audit,
      outbox,
    ),
    answers: new DiscoveryAnswerService(
      sessions,
      answers,
      interpretations,
      mappings,
      audit,
      outbox,
    ),
    mappings: new AnswerMappingService(
      sessions,
      answers,
      mappings,
      snapshots,
      followUps,
      variables,
      scores,
      blocking,
      audit,
      outbox,
    ),
  };
}

async function createFixture(client: DatabaseClient, suffix: string) {
  const user = first(
    await client.db
      .insert(users)
      .values({
        externalSubjectId: `auth0|prompt7-${suffix}`,
        email: `prompt7-${suffix}@example.com`,
        displayName: `Prompt 7 ${suffix}`,
        status: 'active',
      })
      .returning({ id: users.id }),
  );
  const organization = first(
    await client.db
      .insert(organizations)
      .values({
        displayName: `Prompt 7 ${suffix} Advisors`,
        normalizedName: `prompt 7 ${suffix} advisors`,
        normalizedDomain: `prompt7-${suffix}.example.com`,
        prospectStage: 'qualified',
        firmType: 'ria',
      })
      .returning({ id: organizations.id }),
  );
  const definition = first(
    await client.db
      .insert(variableDefinitions)
      .values({
        key: `prompt7_payroll_clients_${suffix}`,
        displayLabel: 'Payroll clients',
        description: 'Discovery fixture variable',
        subjectType: 'organization',
        dataType: 'integer',
        status: 'active',
      })
      .returning({ id: variableDefinitions.id }),
  );
  const version = first(
    await client.db
      .insert(variableDefinitionVersions)
      .values({
        definitionId: definition.id,
        version: 1,
        lifecycleStatus: 'active',
        publishedAt: new Date('2026-07-22T00:00:00.000Z'),
        publishedBy: user.id,
      })
      .returning({ id: variableDefinitionVersions.id }),
  );
  const value = first(
    await client.db
      .insert(variableValues)
      .values({
        subjectType: 'organization',
        organizationId: organization.id,
        variableDefinitionId: definition.id,
        definitionVersionId: version.id,
        typedValue: 120,
        lifecycle: 'current',
        evidenceType: 'user_entered_fact',
        valueStatus: 'known',
      })
      .returning({ id: variableValues.id }),
  );
  const templateKey = `phase1_payroll_${suffix}`;
  const template = first(
    await client.db
      .insert(discoveryTemplates)
      .values({
        key: templateKey,
        version: '1.0.0',
        name: 'Phase 1 Payroll Discovery',
        description: 'Prompt 7 fixture template',
        motion: 'payroll',
        organizationType: 'ria',
        status: 'published',
        publishedAt: new Date('2026-07-22T00:00:00.000Z'),
        publishedByUserId: user.id,
        qualificationOutcomes: ['qualified', 'conditionally_qualified'],
      })
      .returning({ id: discoveryTemplates.id }),
  );
  const question = first(
    await client.db
      .insert(discoveryQuestions)
      .values({
        key: `payroll_client_count_q_${suffix}`,
        version: '1.0.0',
        prompt: 'How many payroll clients do you currently support?',
        answerType: 'number',
        variableDefinitionId: definition.id,
        variableDefinitionVersionId: version.id,
        scoreImpact: [{ scoreKey: 'acquisition_fit' }],
        requiredDefault: true,
        highImpact: true,
        tags: ['payroll_client_count'],
        status: 'published',
        publishedAt: new Date('2026-07-22T00:00:00.000Z'),
        publishedByUserId: user.id,
      })
      .returning({ id: discoveryQuestions.id }),
  );
  await client.db.insert(discoveryTemplateQuestions).values({
    templateId: template.id,
    questionId: question.id,
    displayOrder: 1,
    required: true,
    rationale: 'Core payroll motion discovery question',
  });

  return {
    userId: user.id,
    organizationId: organization.id,
    templateKey,
    variableDefinitionId: definition.id,
    variableDefinitionVersionId: version.id,
    fakeVariableValueId: value.id,
  };
}

async function org(client: DatabaseClient, organizationId: string) {
  return first(
    await client.db.select().from(organizations).where(eq(organizations.id, organizationId)),
  );
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected at least one row');
  return row;
}
