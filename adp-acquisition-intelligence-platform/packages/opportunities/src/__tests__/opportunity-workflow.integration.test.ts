import type { DatabaseClient, RepositoryExecutor } from '@adp/database';
import {
  accountAssignments,
  auditEvents,
  contacts,
  createDatabaseClient,
  operationalStateTransitions,
  opportunityLossReasons,
  opportunityOutcomes,
  opportunityStageDefinitions,
  organizations,
  outboxEvents,
  territories,
  users,
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
} from '@adp/qualification';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CloseService,
  ContactRoleService,
  EligibilityService,
  OpportunityService,
  ProbabilityService,
  ReopenService,
  RiskFlagService,
  StageTransitionService,
  ValueService,
} from '../application/opportunity-services.js';
import type { OpportunityActor } from '../domain/opportunity.js';
import {
  PostgresContactRoleRepository,
  PostgresContextLinkRepository,
  PostgresEligibilityAssessmentRepository,
  PostgresHistoryRepository,
  PostgresLossReasonRepository,
  PostgresOperationalStateOpportunityAdapter,
  PostgresOpportunityAuditAdapter,
  PostgresOpportunityOutboxAdapter,
  PostgresOpportunityRepository,
  PostgresOutcomeRepository,
  PostgresProbabilityRepository,
  PostgresRiskFlagRepository,
  PostgresStageDefinitionRepository,
  PostgresStageTransitionRepository,
  PostgresValueRepository,
  PostgresOrganizationContextAdapter,
} from '../infrastructure/postgres-opportunities.js';

const testDatabaseUrl = getTestDatabaseUrl();
const actor = (userId: string): OpportunityActor => ({
  userId,
  roles: ['sales', 'reviewer', 'admin'],
});

describe.sequential('Prompt 9 opportunity workflow integration', () => {
  let lock: TestDatabaseLock;
  let client: DatabaseClient;

  beforeAll(async () => {
    lock = await acquireTestDatabaseLock(testDatabaseUrl);
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    client = createDatabaseClient(testDatabaseUrl);
    const admin = first(
      await client.db
        .insert(users)
        .values({
          externalSubjectId: 'auth0|opportunity-admin',
          email: 'opportunity-admin@example.com',
          displayName: 'Opportunity Admin',
          status: 'active',
        })
        .returning(),
    );
    await seedOpportunityFixture(client.db, admin.id);
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await lock?.release();
  });

  it('creates from outreach context, assigns contacts, sets value/probability, advances, closes, and reopens', async () => {
    const fixture = await createFixture(client, 'happy');
    const services = buildServices(client.db);

    const created = await services.opportunity.create({
      organizationId: fixture.organizationId,
      primaryMotion: 'direct_payroll_opportunity',
      name: 'Payroll Opportunity',
      humanConfirmation: true,
      actor: actor(fixture.userId),
      contextLinks: [
        {
          linkType: 'outreach_enrollment',
          linkedSubjectType: 'organization',
          linkedSubjectId: fixture.organizationId,
        },
      ],
      commandCorrelationId: '99999999-9999-9999-9999-999999999901',
    });
    expect(created.opportunityStage).toBe('open');

    await services.contacts.assign({
      opportunityId: created.id,
      contactId: fixture.contactId,
      role: 'economic_buyer',
      isPrimary: true,
      actor: actor(fixture.userId),
    });

    await services.values.setValue({
      opportunityId: created.id,
      amount: '50000',
      currency: 'USD',
      actor: actor(fixture.userId),
    });
    await services.probabilities.setProbability({
      opportunityId: created.id,
      probability: '35',
      source: 'manual',
      reasonNote: 'Buyer confirmed budget range verbally',
      actor: actor(fixture.userId),
    });

    const advanced = await services.stages.advance({
      opportunityId: created.id,
      toStage: 'discovery_validation',
      actor: actor(fixture.userId),
      commandCorrelationId: '99999999-9999-9999-9999-999999999902',
    });
    expect(advanced.opportunity.opportunityStage).toBe('discovery_validation');

    await services.stages.advance({
      opportunityId: created.id,
      toStage: 'solution_alignment',
      actor: actor(fixture.userId),
      commandCorrelationId: '99999999-9999-9999-9999-999999999903',
    });
    await services.stages.advance({
      opportunityId: created.id,
      toStage: 'commercial_review',
      actor: actor(fixture.userId),
      commandCorrelationId: '99999999-9999-9999-9999-999999999904',
    });

    const closed = await services.close.closeLost({
      opportunityId: created.id,
      lossReasonKey: 'timing_not_right',
      notes: 'Deferred to next fiscal year',
      actor: actor(fixture.reviewerUserId),
      commandCorrelationId: '99999999-9999-9999-9999-999999999905',
    });
    expect(closed.stage).toBe('lost');

    const reopened = await services.reopen.reopen({
      opportunityId: created.id,
      reasonCode: 'buyer_reengaged',
      reasonNote: 'Prospect requested revised proposal',
      actor: actor(fixture.reviewerUserId),
      commandCorrelationId: '99999999-9999-9999-9999-999999999906',
    });
    expect(reopened.opportunity.opportunityStage).toBe('open');

    const priorOutcome = first(
      await client.db
        .select()
        .from(opportunityOutcomes)
        .where(eq(opportunityOutcomes.opportunityId, created.id)),
    );
    expect(priorOutcome.supersededAt).not.toBeNull();

    const orgTransitions = await client.db
      .select()
      .from(operationalStateTransitions)
      .where(eq(operationalStateTransitions.subjectId, created.id));
    expect(orgTransitions.some((row) => row.dimension === 'opportunity_stage')).toBe(true);

    const audits = await client.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.subjectId, created.id));
    expect(audits.some((row) => row.action === 'opportunity.created')).toBe(true);
    expect(audits.some((row) => row.action === 'opportunity.reopened')).toBe(true);

    const outbox = await client.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, created.id));
    expect(outbox.some((row) => row.eventType === 'opportunity.created')).toBe(true);
  });

  it('rejects invalid transitions, duplicate active opportunities, missing loss reason, and ineligible orgs', async () => {
    const fixture = await createFixture(client, 'negative');
    const services = buildServices(client.db);

    const created = await services.opportunity.create({
      organizationId: fixture.organizationId,
      primaryMotion: 'direct_payroll_opportunity',
      name: 'Primary Opportunity',
      humanConfirmation: true,
      actor: actor(fixture.userId),
      commandCorrelationId: '99999999-9999-9999-9999-999999999911',
    });

    await expect(
      services.opportunity.create({
        organizationId: fixture.organizationId,
        primaryMotion: 'direct_payroll_opportunity',
        name: 'Duplicate Opportunity',
        humanConfirmation: true,
        actor: actor(fixture.userId),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(
      services.stages.advance({
        opportunityId: created.id,
        toStage: 'commercial_review',
        actor: actor(fixture.userId),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await expect(
      services.close.closeLost({
        opportunityId: created.id,
        lossReasonKey: 'missing_reason_key',
        actor: actor(fixture.reviewerUserId),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const ineligibleOrg = first(
      await client.db
        .insert(organizations)
        .values({
          displayName: 'Ineligible Research Advisors',
          normalizedName: 'ineligible research advisors',
          normalizedDomain: 'ineligible-research.example.com',
          prospectStage: 'research',
        })
        .returning(),
    );
    await expect(
      services.opportunity.create({
        organizationId: ineligibleOrg.id,
        primaryMotion: 'direct_payroll_opportunity',
        name: 'Should Fail',
        humanConfirmation: true,
        actor: actor(fixture.userId),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await services.riskFlags.raise({
      opportunityId: created.id,
      flagKey: 'stalled_engagement',
      description: 'No buyer response in 30 days',
      actor: actor(fixture.userId),
    });
    await expect(
      services.stages.advance({
        opportunityId: created.id,
        toStage: 'discovery_validation',
        actor: actor(fixture.userId),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

function buildServices(db: RepositoryExecutor) {
  const operationalState = new OperationalStateService(
    new PostgresOrganizationStateWriter(db),
    new PostgresOperationalStateTransitionRepository(db),
  );
  const opportunitiesRepo = new PostgresOpportunityRepository(db);
  const stageDefinitions = new PostgresStageDefinitionRepository(db);
  const audit = new PostgresOpportunityAuditAdapter(db);
  const outbox = new PostgresOpportunityOutboxAdapter(db);
  const operational = new PostgresOperationalStateOpportunityAdapter(db, operationalState);
  const eligibility = new EligibilityService(
    new PostgresOrganizationContextAdapter(db),
    new PostgresEligibilityAssessmentRepository(db),
    audit,
  );
  const stages = new StageTransitionService(
    opportunitiesRepo,
    new PostgresStageTransitionRepository(db),
    operational,
    stageDefinitions,
    new PostgresProbabilityRepository(db),
    new PostgresRiskFlagRepository(db),
    new PostgresHistoryRepository(db),
    audit,
    outbox,
  );
  const close = new CloseService(
    opportunitiesRepo,
    new PostgresOutcomeRepository(db),
    new PostgresLossReasonRepository(db),
    stages,
    new PostgresHistoryRepository(db),
    audit,
    outbox,
  );

  return {
    opportunity: new OpportunityService(
      new PostgresOrganizationContextAdapter(db),
      opportunitiesRepo,
      eligibility,
      operational,
      stageDefinitions,
      new PostgresProbabilityRepository(db),
      new PostgresHistoryRepository(db),
      new PostgresContextLinkRepository(db),
      audit,
      outbox,
    ),
    contacts: new ContactRoleService(
      opportunitiesRepo,
      new PostgresContactRoleRepository(db),
      audit,
    ),
    values: new ValueService(
      opportunitiesRepo,
      new PostgresValueRepository(db),
      new PostgresHistoryRepository(db),
      audit,
    ),
    probabilities: new ProbabilityService(
      opportunitiesRepo,
      new PostgresProbabilityRepository(db),
      new PostgresHistoryRepository(db),
      audit,
    ),
    stages,
    riskFlags: new RiskFlagService(opportunitiesRepo, new PostgresRiskFlagRepository(db), audit),
    close,
    reopen: new ReopenService(
      opportunitiesRepo,
      new PostgresOutcomeRepository(db),
      stages,
      new PostgresHistoryRepository(db),
      audit,
    ),
  };
}

async function createFixture(client: DatabaseClient, suffix: string) {
  const user = first(
    await client.db
      .insert(users)
      .values({
        externalSubjectId: `auth0|opportunity-${suffix}`,
        email: `opportunity-${suffix}@example.com`,
        displayName: `Opportunity ${suffix}`,
        status: 'active',
      })
      .returning(),
  );
  const reviewer = first(
    await client.db
      .insert(users)
      .values({
        externalSubjectId: `auth0|opportunity-reviewer-${suffix}`,
        email: `opportunity-reviewer-${suffix}@example.com`,
        displayName: `Opportunity Reviewer ${suffix}`,
        status: 'active',
      })
      .returning(),
  );
  const territory = first(
    await client.db
      .insert(territories)
      .values({
        code: `OPP-${suffix}`,
        name: `Opportunity Territory ${suffix}`,
        description: 'Opportunity fixture territory',
        status: 'active',
        createdByUserId: user.id,
        updatedByUserId: user.id,
      })
      .returning(),
  );
  const organization = first(
    await client.db
      .insert(organizations)
      .values({
        displayName: `Opportunity Ready Advisors ${suffix}`,
        normalizedName: `opportunity ready advisors ${suffix}`,
        normalizedDomain: `opportunity-ready-${suffix}.example.com`,
        prospectStage: 'outreach_active',
        outreachStatus: 'active',
      })
      .returning(),
  );
  await client.db.insert(accountAssignments).values({
    organizationId: organization.id,
    userId: user.id,
    territoryId: territory.id,
    assignmentRole: 'owner',
  });
  const contact = first(
    await client.db
      .insert(contacts)
      .values({
        organizationId: organization.id,
        displayName: `Alex Buyer ${suffix}`,
        email: `alex-${suffix}@example.com`,
        normalizedEmail: `alex-${suffix}@example.com`,
      })
      .returning(),
  );

  return {
    userId: user.id,
    reviewerUserId: reviewer.id,
    organizationId: organization.id,
    contactId: contact.id,
  };
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected at least one row');
  return row;
}

async function seedOpportunityFixture(db: RepositoryExecutor, publishedByUserId: string) {
  const stages = [
    ['open', '10', 14],
    ['discovery_validation', '20', 21],
    ['solution_alignment', '40', 30],
    ['commercial_review', '60', 30],
    ['won', '100', null],
    ['lost', '0', null],
    ['nurture', '5', 90],
  ] as const;

  for (const [stageKey, defaultProbability, maxAgeDays] of stages) {
    await db
      .insert(opportunityStageDefinitions)
      .values({
        stageKey,
        version: '1.0.0',
        displayName: stageKey,
        description: `${stageKey} stage`,
        defaultProbability,
        maxAgeDays,
        status: 'active',
        publishedAt: new Date(),
        publishedByUserId,
      })
      .onConflictDoNothing();
  }

  const lossReasons = [
    ['timing_not_right', 'Timing Not Right', 30],
    ['chose_competitor', 'Chose Competitor', 10],
  ] as const;

  for (const [key, displayName, sortOrder] of lossReasons) {
    await db
      .insert(opportunityLossReasons)
      .values({
        key,
        displayName,
        description: displayName,
        sortOrder,
        status: 'active',
      })
      .onConflictDoNothing();
  }
}
